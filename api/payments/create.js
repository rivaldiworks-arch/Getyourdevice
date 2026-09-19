"use strict";
const { supabase, supabaseAdmin } = require("../_supabase");
const { customerSafePayment, providerFor } = require("./_provider");
const { createQrisCharge, getTransactionStatus, paymentFieldsFromTransaction, rawTransactionStatus } = require("./_midtrans");

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

module.exports=async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  try {
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const keys=Object.keys(body);
    if(keys.some(key=>!["orderId","orderNumber","paymentToken"].includes(key))) return res.status(400).json({error:"Permintaan pembayaran berisi field yang tidak diizinkan."});
    const orderId=String(body.orderId||"").trim(),orderNumber=String(body.orderNumber||"").trim(),paymentToken=String(body.paymentToken||"").trim();
    if(Boolean(orderId)===Boolean(orderNumber)||orderId&&!UUID.test(orderId)||orderNumber&&!ORDER_NUMBER.test(orderNumber)||!PAYMENT_TOKEN.test(paymentToken)) {
      return res.status(400).json({error:"Identitas pembayaran tidak valid."});
    }

    const response=await supabase("rpc/create_manual_payment_intent",{method:"POST",body:JSON.stringify({p_order_id:orderId||null,p_order_number:orderNumber||null,p_payment_token:paymentToken})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) {
      if(["ORDER_NOT_FOUND","PAYMENT_ACCESS_DENIED"].includes(data.message)) return res.status(404).json({error:"Pesanan tidak ditemukan atau akses pembayaran sudah tidak valid."});
      if(["ORDER_NOT_PAYABLE","INVALID_PAYMENT_METHOD"].includes(data.message)) return res.status(409).json({error:"Pesanan ini tidak dapat dibuatkan pembayaran."});
      console.error("Payment intent RPC failed",{status:response.status,code:data.code,message:data.message});
      return res.status(500).json({error:"Pembayaran belum dapat disiapkan."});
    }

    if(data.payment_method==="COD") return res.status(200).json({paymentStatus:"unpaid",paymentMethod:"COD",message:"Pembayaran dilakukan saat pesanan diterima."});

    // Phase 5C integrates Midtrans QRIS first. Transfer Bank remains on the
    // provider-neutral/manual rail until VA integration is explicitly enabled.
    if(data.payment_method!=="QRIS") {
      const provider=providerFor(data.provider);
      if(!provider) return res.status(500).json({error:"Penyedia pembayaran belum didukung."});
      return res.status(data.reused?200:201).json({...customerSafePayment(provider.createPayment({payment:data})),reused:Boolean(data.reused),message:"Menunggu instruksi pembayaran dari toko."});
    }

    let payment=await paymentRow(data.id);
    if(payment.provider==="midtrans" && payment.payment_url && ["unpaid","pending"].includes(payment.status)) {
      return res.status(200).json({...customerSafePayment(payment),reused:true,message:"QRIS siap dipindai."});
    }

    const order=await orderRow(payment.order_id);
    const charge=await createQrisCharge({orderId:order.order_number,amount:Number(payment.amount)});
    let transaction=charge;
    if(!rawTransactionStatus(charge)){
      try{
        const authoritative=await getTransactionStatus(order.order_number);
        transaction={
          ...charge,
          ...authoritative,
          actions:charge?.actions||authoritative?.actions||[],
          qrUrl:charge?.qrUrl||authoritative?.qrUrl,
          qrImage:charge?.qrImage||authoritative?.qrImage,
          qrContent:charge?.qrContent||authoritative?.qrContent
        };
      }catch(statusError){
        console.warn("Midtrans GET status fallback failed after QR charge",{orderNumber:order.order_number,status:statusError.status||null,message:statusError.message});
      }
    }
    const expiresAt=new Date(Date.now()+30*60*1000).toISOString();
    const fields=paymentFieldsFromTransaction(transaction,{expiresAt,defaultPending:true});
    if(!fields.payment_url && !fields.qr_string) throw new Error("Midtrans QRIS response did not include QR content");
    payment=await updatePayment(payment.id,fields);

    return res.status(data.reused?200:201).json({
      ...customerSafePayment(payment),
      reused:Boolean(data.reused),
      message:"QRIS siap dipindai."
    });
  } catch(error) {
    if(error instanceof SyntaxError) return res.status(400).json({error:"Format data tidak valid."});
    console.error("Payment creation failed",{message:error.message,status:error.status||null,midtransStatus:error.midtrans?.status_code||null});
    if(error.message==="MIDTRANS_SERVER_KEY is not configured" || error.message==="SUPABASE_SERVICE_ROLE_KEY is not configured") {
      return res.status(503).json({error:"Gateway pembayaran belum dikonfigurasi."});
    }
    return res.status(500).json({error:"Pembayaran belum dapat disiapkan."});
  }
};
