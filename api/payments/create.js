"use strict";
const { supabase } = require("../_supabase");
const { customerSafePayment, providerFor } = require("./_provider");

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_NUMBER=/^GYD-\d{8}-\d{4}$/;
const PAYMENT_TOKEN=/^[0-9a-f]{64}$/i;

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
    const provider=providerFor(data.provider);
    if(!provider) return res.status(500).json({error:"Penyedia pembayaran belum didukung."});
    const payment=provider.createPayment({payment:data});
    return res.status(data.reused?200:201).json({...customerSafePayment(payment),reused:Boolean(data.reused),message:"Menunggu instruksi pembayaran dari penyedia pembayaran."});
  } catch(error) {
    if(error instanceof SyntaxError) return res.status(400).json({error:"Format data tidak valid."});
    console.error("Payment creation failed",error);
    return res.status(500).json({error:"Pembayaran belum dapat disiapkan."});
  }
};
