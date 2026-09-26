"use strict";
const { supabase, supabaseAdmin } = require("../_supabase");
const { guardPublicJson } = require("../_guard");
const { isServerConfigError } = require("../_secrets");
const { notifyOrderPaid } = require("../_notify");
const { canTransition, customerSafePayment, providerFor } = require("./_provider");
const {
  createQrisCharge,
  getTransactionStatus,
  isMidtransNotFound,
  midtransConfig,
  midtransOrderId,
  normalizeTransactionStatus,
  paymentFieldsFromTransaction,
  rawTransactionStatus
} = require("./_midtrans");

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
  constructor(httpStatus,message) {
    super(message);
    this.httpStatus=httpStatus;
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

function qrExpired(payment,now=Date.now()) {
  const expiresAt=Date.parse(payment.expires_at||"");
  return !Number.isFinite(expiresAt) || expiresAt<=now;
}

// Midtrans is authoritative for gateway state. Used when our own expiry says the QR is
// stale, so a missed 'expire' webhook can no longer strand the customer on a dead QR.
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
// reuse its QR, report that it is already paid, charge it, or retire it and renew.
async function reconcileQrisPayment(payment,env,requestId) {
  const isMidtransAttempt=payment.provider==="midtrans" && Boolean(payment.provider_reference);
  if(!isMidtransAttempt) return {action:"charge",payment};

  if(paymentEnvironment(payment)!==env) {
    // A QR from the other Midtrans account can never be paid here.
    console.warn("Retiring Midtrans payment from another environment",{requestId,paymentId:payment.id,from:paymentEnvironment(payment),to:env});
    await updatePayment(payment.id,{status:"expired"});
    return {action:"renew"};
  }
  if(payment.payment_url && !qrExpired(payment)) return {action:"respond",payment,message:"QRIS siap dipindai."};

  const synced=await syncMidtransPayment(payment,requestId);
  if(synced.status==="paid") return {action:"respond",payment:synced,message:"Pembayaran sudah diterima."};
  if(["expired","failed"].includes(synced.status)) return {action:"renew"};
  // Midtrans still accepts this QR even though our clock says it expired.
  if(synced.payment_url) return {action:"respond",payment:synced,message:"QRIS siap dipindai."};
  return {action:"charge",payment:synced};
}

async function chargeQris(payment,env,requestId) {
  const order=await orderRow(payment.order_id);
  const reference=midtransOrderId(order.order_number,payment.id);
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
  // The webhook looks payments up by the Midtrans order_id, so pin it to what we sent.
  return updatePayment(payment.id,{...fields,provider_reference:reference,provider_environment:env});
}

module.exports=async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  const guard=await guardPublicJson(req,res,{bucket:"payments:create",limit:40,windowSeconds:900,maxBytes:8*1024});
  if(!guard.ok)return;
  const {requestId}=guard;
  try {
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const keys=Object.keys(body);
    if(keys.some(key=>!["orderId","orderNumber","paymentToken"].includes(key))) return res.status(400).json({error:"Permintaan pembayaran berisi field yang tidak diizinkan."});
    const orderId=String(body.orderId||"").trim(),orderNumber=String(body.orderNumber||"").trim(),paymentToken=String(body.paymentToken||"").trim();
    if(Boolean(orderId)===Boolean(orderNumber)||orderId&&!UUID.test(orderId)||orderNumber&&!ORDER_NUMBER.test(orderNumber)||!PAYMENT_TOKEN.test(paymentToken)) {
      return res.status(400).json({error:"Identitas pembayaran tidak valid."});
    }
    const identity={orderId,orderNumber,paymentToken};

    let data=await requestIntent(identity,requestId);

    if(data.payment_method==="COD") return res.status(200).json({paymentStatus:"unpaid",paymentMethod:"COD",message:"Pembayaran dilakukan saat pesanan diterima."});

    // Phase 5C integrates Midtrans QRIS first. Transfer Bank remains on the
    // provider-neutral/manual rail until VA integration is explicitly enabled.
    if(data.payment_method!=="QRIS") {
      const provider=providerFor(data.provider);
      if(!provider) return res.status(500).json({error:"Penyedia pembayaran belum didukung."});
      return res.status(data.reused?200:201).json({...customerSafePayment(provider.createPayment({payment:data})),reused:Boolean(data.reused),message:"Menunggu instruksi pembayaran dari toko."});
    }

    // Validate gateway configuration before touching any payment row.
    const {env}=midtransConfig();
    let payment=await paymentRow(data.id);
    let outcome=await reconcileQrisPayment(payment,env,requestId);
    if(outcome.action==="renew") {
      // The previous attempt is now terminal, so the RPC inserts a fresh attempt row.
      data=await requestIntent(identity,requestId);
      payment=await paymentRow(data.id);
      outcome=await reconcileQrisPayment(payment,env,requestId);
      if(outcome.action==="renew") throw new Error("QRIS payment attempt could not be renewed");
    }
    if(outcome.action==="respond") {
      return res.status(200).json({...customerSafePayment(outcome.payment),reused:true,message:outcome.message});
    }

    payment=await chargeQris(outcome.payment,env,requestId);
    return res.status(data.reused?200:201).json({
      ...customerSafePayment(payment),
      reused:Boolean(data.reused),
      message:"QRIS siap dipindai."
    });
  } catch(error) {
    if(error instanceof IntentError) return res.status(error.httpStatus).json({error:error.message});
    if(error instanceof SyntaxError) return res.status(400).json({error:"Format data tidak valid."});
    console.error("Payment creation failed",{requestId,message:error.message,status:error.status||null,midtransStatus:error.midtrans?.status_code||null});
    if(isServerConfigError(error) || error.message==="SUPABASE_SERVICE_ROLE_KEY is not configured") {
      return res.status(503).json({error:"Gateway pembayaran belum dikonfigurasi."});
    }
    if(String(error.midtrans?.status_code||"")==="402" || /payment channel is not activated/i.test(error.message||"")) {
      return res.status(503).json({error:"QRIS Midtrans belum aktif untuk merchant ini."});
    }
    return res.status(500).json({error:"Pembayaran belum dapat disiapkan."});
  }
};
