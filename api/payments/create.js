"use strict";
const { supabase, supabaseAdmin } = require("../_supabase");
const { guardPublicJson } = require("../_guard");
const { isServerConfigError } = require("../_secrets");
const { notifyOrderPaid } = require("../_notify");
const { canTransition, customerSafePayment, providerFor } = require("./_provider");
const {
  QRIS_MAX_AMOUNT,
  createBankTransferCharge,
  createQrisCharge,
  enabledVaBanks,
  getTransactionStatus,
  isChannelNotActive,
  isMidtransNotFound,
  midtransConfig,
  midtransOrderId,
  normalizeTransactionStatus,
  paymentFieldsFromTransaction,
  rawTransactionStatus,
  vaFieldsFromTransaction
} = require("./_midtrans");

// Payment methods charged through Midtrans, and what "ready to pay" means for each.
const GATEWAY_METHODS=Object.freeze({
  "QRIS":{hasInstructions:payment=>Boolean(payment.payment_url),ready:"QRIS siap dipindai."},
  "Transfer Bank":{hasInstructions:payment=>Boolean(payment.va_number),ready:"Nomor Virtual Account siap digunakan."}
});

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_NUMBER=/^GYD-\d{8}-\d{4}$/;
const PAYMENT_TOKEN=/^[0-9a-f]{64}$/i;

async function adminRows(path,options={}) {
  const response=await supabaseAdmin(path,options);
  const data=await response.json().catch(()=>[]);
  if(!response.ok) throw new Error(data?.message||data?.error||`Supabase admin request failed (${response.status})`);
  return data;
}

async function paymentRow(id) {
  const rows=await adminRows(`payments?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  if(!rows?.[0]) throw new Error("Payment row not found");
  return rows[0];
}

async function orderRow(id) {
  const rows=await adminRows(`orders?select=id,order_number,total&id=eq.${encodeURIComponent(id)}&limit=1`);
  if(!rows?.[0]) throw new Error("Order row not found");
  return rows[0];
}

async function updatePayment(id,changes) {
  const rows=await adminRows(`payments?id=eq.${encodeURIComponent(id)}`,{
    method:"PATCH",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify(changes)
  });
  if(!rows?.[0]) throw new Error("Payment update returned no row");
  return rows[0];
}

class IntentError extends Error {
  constructor(httpStatus,message,code=null) {
    super(message);
    this.httpStatus=httpStatus;
    this.code=code;
  }
}

// Returns the order's active payment row, or inserts a fresh 'unpaid' attempt when the
// previous one is terminal. The RPC verifies the payment capability token every time.
async function requestIntent({orderId,orderNumber,paymentToken},requestId) {
  const response=await supabase("rpc/create_manual_payment_intent",{method:"POST",body:JSON.stringify({p_order_id:orderId||null,p_order_number:orderNumber||null,p_payment_token:paymentToken})});
  const data=await response.json().catch(()=>({}));
  if(response.ok) return data;
  if(["ORDER_NOT_FOUND","PAYMENT_ACCESS_DENIED"].includes(data.message)) throw new IntentError(404,"Pesanan tidak ditemukan atau akses pembayaran sudah tidak valid.");
  if(["ORDER_NOT_PAYABLE","INVALID_PAYMENT_METHOD"].includes(data.message)) throw new IntentError(409,"Pesanan ini tidak dapat dibuatkan pembayaran.");
  console.error("Payment intent RPC failed",{requestId,status:response.status,code:data.code,message:data.message});
  throw new IntentError(500,"Pembayaran belum dapat disiapkan.");
}

function safeProviderPayload(payload={}) {
  const {signature_key,...safe}=payload;
  return safe;
}

// Every Midtrans row created before migration 015 came from sandbox.
function paymentEnvironment(payment) {
  return payment.provider_environment||"sandbox";
}

function instructionsExpired(payment,now=Date.now()) {
  const expiresAt=Date.parse(payment.expires_at||"");
  return !Number.isFinite(expiresAt) || expiresAt<=now;
}

// Midtrans is authoritative for gateway state. Used when our own expiry says the QR/VA is
// stale, so a missed 'expire' webhook can no longer strand the customer on dead instructions.
async function syncMidtransPayment(payment,requestId) {
  let transaction;
  try {
    transaction=await getTransactionStatus(payment.provider_reference);
  } catch(error) {
    if(!isMidtransNotFound(error)) throw error;
    console.warn("Retiring Midtrans payment unknown to the gateway",{requestId,paymentId:payment.id});
    return updatePayment(payment.id,{status:"expired"});
  }
  const providerAmount=Number(transaction.gross_amount);
  if(!Number.isFinite(providerAmount) || Math.abs(providerAmount-Number(payment.amount))>0.001) {
    throw new Error("Midtrans status amount mismatch");
  }
  const next=normalizeTransactionStatus(transaction);
  if(next===payment.status || !canTransition(payment.status,next)) return payment;
  const updated=await updatePayment(payment.id,{
    status:next,
    external_transaction_id:transaction.transaction_id||payment.external_transaction_id||null,
    provider_payload:safeProviderPayload(transaction)
  });
  // The webhook was missed, so this sync is where the seller learns about the payment.
  if(next==="paid") await notifyOrderPaid(payment.order_id,{requestId});
  return updated;
}

// Decides what to do with the active payment row returned by the intent RPC:
// reuse its QR/VA, report that it is already paid, charge it, or retire it and renew.
async function reconcileGatewayPayment(payment,env,method,requestId) {
  const {hasInstructions,ready}=GATEWAY_METHODS[method];
  const isMidtransAttempt=payment.provider==="midtrans" && Boolean(payment.provider_reference);
  if(!isMidtransAttempt) return {action:"charge",payment};

  if(paymentEnvironment(payment)!==env) {
    // Instructions from the other Midtrans account can never be paid here.
    console.warn("Retiring Midtrans payment from another environment",{requestId,paymentId:payment.id,from:paymentEnvironment(payment),to:env});
    await updatePayment(payment.id,{status:"expired"});
    return {action:"renew"};
  }
  if(hasInstructions(payment) && !instructionsExpired(payment)) return {action:"respond",payment,message:ready};

  const synced=await syncMidtransPayment(payment,requestId);
  if(synced.status==="paid") return {action:"respond",payment:synced,message:"Pembayaran sudah diterima."};
  if(["expired","failed"].includes(synced.status)) return {action:"renew"};
  // Midtrans still accepts these instructions even though our clock says they expired.
  if(hasInstructions(synced)) return {action:"respond",payment:synced,message:ready};
  return {action:"charge",payment:synced};
}

async function chargeQris(payment,order,reference,requestId) {
  const charge=await createQrisCharge({orderId:reference,amount:Number(payment.amount)});
  let transaction=charge;
  if(!rawTransactionStatus(charge)){
    try{
      const authoritative=await getTransactionStatus(reference);
      transaction={
        ...charge,
        ...authoritative,
        actions:charge?.actions||authoritative?.actions||[],
        qrUrl:charge?.qrUrl||authoritative?.qrUrl,
        qrImage:charge?.qrImage||authoritative?.qrImage,
        qrContent:charge?.qrContent||authoritative?.qrContent
      };
    }catch(statusError){
      console.warn("Midtrans GET status fallback failed after QR charge",{requestId,orderNumber:order.order_number,status:statusError.status||null,message:statusError.message});
    }
  }
  const expiresAt=new Date(Date.now()+30*60*1000).toISOString();
  const fields=paymentFieldsFromTransaction(transaction,{expiresAt,defaultPending:true});
  if(!fields.payment_url && !fields.qr_string) throw new Error("Midtrans QRIS response did not include QR content");
  return fields;
}

async function chargeBankTransfer(payment,bank,reference) {
  const transaction=await createBankTransferCharge({orderId:reference,amount:Number(payment.amount),bank});
  const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
  const fields=vaFieldsFromTransaction(transaction,{bank,expiresAt});
  if(!fields.va_number) throw new Error("Midtrans Virtual Account response did not include a VA number");
  return fields;
}

async function chargeGateway(payment,env,method,bank,requestId) {
  const order=await orderRow(payment.order_id);
  const reference=midtransOrderId(order.order_number,payment.id);
  const fields=method==="QRIS"
    ? await chargeQris(payment,order,reference,requestId)
    : await chargeBankTransfer(payment,bank,reference);
  // The webhook looks payments up by the Midtrans order_id, so pin it to what we sent.
  return updatePayment(payment.id,{...fields,provider_reference:reference,provider_environment:env});
}

module.exports=async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  const guard=await guardPublicJson(req,res,{bucket:"payments:create",limit:40,windowSeconds:900,maxBytes:8*1024});
  if(!guard.ok)return;
  const {requestId}=guard;
  let method=null;
  try {
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const keys=Object.keys(body);
    if(keys.some(key=>!["orderId","orderNumber","paymentToken","bank"].includes(key))) return res.status(400).json({error:"Permintaan pembayaran berisi field yang tidak diizinkan."});
    const orderId=String(body.orderId||"").trim(),orderNumber=String(body.orderNumber||"").trim(),paymentToken=String(body.paymentToken||"").trim();
    if(Boolean(orderId)===Boolean(orderNumber)||orderId&&!UUID.test(orderId)||orderNumber&&!ORDER_NUMBER.test(orderNumber)||!PAYMENT_TOKEN.test(paymentToken)) {
      return res.status(400).json({error:"Identitas pembayaran tidak valid."});
    }
    const bank=body.bank==null||body.bank===""?null:String(body.bank).trim().toLowerCase();
    if(bank && !enabledVaBanks().includes(bank)) return res.status(400).json({error:"Bank Virtual Account tidak tersedia.",code:"BANK_UNAVAILABLE"});
    const identity={orderId,orderNumber,paymentToken};

    let data=await requestIntent(identity,requestId);
    method=data.payment_method;

    if(method==="COD") return res.status(200).json({paymentStatus:"unpaid",paymentMethod:"COD",message:"Pembayaran dilakukan saat pesanan diterima."});

    if(!Object.hasOwn(GATEWAY_METHODS,method)) {
      const provider=providerFor(data.provider);
      if(!provider) return res.status(500).json({error:"Penyedia pembayaran belum didukung."});
      return res.status(data.reused?200:201).json({...customerSafePayment(provider.createPayment({payment:data})),reused:Boolean(data.reused),message:"Menunggu instruksi pembayaran dari toko."});
    }

    // Validate gateway configuration before touching any payment row.
    const {env}=midtransConfig();
    let payment=await paymentRow(data.id);
    let outcome=await reconcileGatewayPayment(payment,env,method,requestId);
    if(outcome.action==="renew") {
      // The previous attempt is now terminal, so the RPC inserts a fresh attempt row.
      data=await requestIntent(identity,requestId);
      payment=await paymentRow(data.id);
      outcome=await reconcileGatewayPayment(payment,env,method,requestId);
      if(outcome.action==="renew") throw new Error("Payment attempt could not be renewed");
    }
    if(outcome.action==="respond") {
      // An active VA is returned as is, even if a different bank was requested: issuing a
      // second VA while the first is still payable could let the customer pay twice.
      return res.status(200).json({...customerSafePayment(outcome.payment),reused:true,message:outcome.message});
    }

    if(method==="QRIS" && Number(outcome.payment.amount)>QRIS_MAX_AMOUNT) {
      throw new IntentError(409,"Total pesanan melebihi batas QRIS Rp10.000.000. Gunakan Transfer Bank untuk pesanan ini.","QRIS_LIMIT");
    }
    if(method==="Transfer Bank" && !bank) {
      throw new IntentError(400,"Pilih bank untuk mendapatkan nomor Virtual Account.","BANK_REQUIRED");
    }

    payment=await chargeGateway(outcome.payment,env,method,bank,requestId);
    return res.status(data.reused?200:201).json({
      ...customerSafePayment(payment),
      reused:Boolean(data.reused),
      message:GATEWAY_METHODS[method].ready
    });
  } catch(error) {
    if(error instanceof IntentError) return res.status(error.httpStatus).json({error:error.message,...(error.code?{code:error.code}:{})});
    if(error instanceof SyntaxError) return res.status(400).json({error:"Format data tidak valid."});
    console.error("Payment creation failed",{requestId,method,message:error.message,status:error.status||null,midtransStatus:error.midtrans?.status_code||null});
    if(isServerConfigError(error) || error.message==="SUPABASE_SERVICE_ROLE_KEY is not configured") {
      return res.status(503).json({error:"Gateway pembayaran belum dikonfigurasi."});
    }
    if(isChannelNotActive(error)) {
      return res.status(503).json(method==="Transfer Bank"
        ? {error:"Virtual Account bank ini belum aktif. Silakan pilih bank lain.",code:"BANK_UNAVAILABLE"}
        : {error:"QRIS Midtrans belum aktif untuk merchant ini."});
    }
    return res.status(500).json({error:"Pembayaran belum dapat disiapkan."});
  }
};
