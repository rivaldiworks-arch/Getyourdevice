"use strict";
const { createHash, createHmac, randomBytes } = require("node:crypto");
const { supabaseAdmin } = require("./_supabase");
const { guardPublicJson } = require("./_guard");

const PAYMENT_METHODS = new Set(["Transfer Bank", "COD", "QRIS"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?\d{9,15}$/;

function normalizePhone(value) {
  const phone=String(value||"").trim().replace(/[\s().-]/g, "");
  if (/^08\d{8,11}$/.test(phone)) return `62${phone.slice(1)}`;
  if (/^\+?62\d{8,12}$/.test(phone)) return phone.replace(/^\+/, "");
  return phone;
}
function customerFrom(input={}) {
  return {
    full_name:String(input.full_name ?? input.fullName ?? input.name ?? "").trim(),
    whatsapp:normalizePhone(input.whatsapp ?? input.phone ?? input.phoneNumber),
    email:String(input.email ?? "").trim().toLowerCase(), address:String(input.address ?? "").trim(),
    city:String(input.city ?? "").trim(), postal_code:String(input.postal_code ?? input.postalCode ?? "").trim(),
    notes:String(input.notes ?? "").trim().slice(0, 1000)
  };
}
function validCustomer(customer) {
  return customer.full_name.length>=3 && customer.full_name.length<=120 &&
    customer.whatsapp.length<=16 && PHONE.test(customer.whatsapp) &&
    customer.email.length<=254 && EMAIL.test(customer.email) &&
    customer.address.length>=10 && customer.address.length<=500 &&
    customer.city.length>=2 && customer.city.length<=120 &&
    /^\d{5}$/.test(customer.postal_code);
}
function cartFingerprint(items) {
  const normalized=items.map(item=>({productId:String(item.productId),quantity:Number(item.quantity)})).sort((a,b)=>a.productId.localeCompare(b.productId));
  return createHash("sha256").update(normalized.map(item=>`${item.productId}:${item.quantity}`).join("|")).digest("hex");
}
function checkoutToken(idempotencyKey,purpose) {
  const secret=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"");
  if(!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createHmac("sha256",secret).update(`${purpose}:${idempotencyKey}`).digest("hex");
}
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).setHeader("Allow", "POST").json({ error:"Method not allowed" });
  const guard=await guardPublicJson(req,res,{bucket:"orders:create",limit:20,windowSeconds:3600,maxBytes:64*1024});
  if(!guard.ok)return;
  const {requestId}=guard;
  try {
    const body=typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if(!body?.customer || !Array.isArray(body.items) || !body.items.length || body.items.length>50) return res.status(400).json({error:"Data pesanan tidak lengkap."});
    const customer=customerFrom(body.customer);
    if(!validCustomer(customer)) return res.status(400).json({error:"Data pelanggan belum valid. Periksa nama, WhatsApp, email, alamat, kota, dan kode pos."});
    if(!UUID.test(String(body.shippingQuoteId||"")) || !PAYMENT_METHODS.has(body.payment)) return res.status(400).json({error:"Opsi pengiriman atau pembayaran tidak valid. Muat ulang checkout lalu coba lagi."});
    if(!body.items.every(item=>UUID.test(item.productId||"") && Number.isInteger(item.quantity) && item.quantity>0 && item.quantity<=99)) return res.status(400).json({error:"Item pesanan tidak valid."});
    const headerKey=String(req.headers["idempotency-key"]||"").trim().toLowerCase();
    if(headerKey && !/^[0-9a-f]{64}$/.test(headerKey)) return res.status(400).json({error:"Idempotency key checkout tidak valid."});
    const idempotencyKey=headerKey||randomBytes(32).toString("hex");
    const paymentToken=checkoutToken(idempotencyKey,"payment");
    const orderAccessToken=checkoutToken(idempotencyKey,"order-access");
    const response=await supabaseAdmin("rpc/create_storefront_order_v5",{method:"POST",body:JSON.stringify({p_customer:customer,p_items:body.items.map(item=>({product_id:item.productId,quantity:item.quantity})),p_shipping_quote_id:body.shippingQuoteId,p_payment_method:body.payment,p_payment_token:paymentToken,p_order_access_token:orderAccessToken,p_checkout_idempotency_key:idempotencyKey,p_cart_fingerprint:cartFingerprint(body.items)})});
    const data=await response.json();
    if(!response.ok) {
      console.error("Supabase order RPC failed", {requestId,status:response.status,code:data.code,message:data.message,details:data.details,hint:data.hint});
      if(data.message==="INSUFFICIENT_STOCK") return res.status(409).json({error:"Stok salah satu produk sudah berubah. Silakan periksa keranjang Anda."});
      if(data.message==="INVALID_CUSTOMER") return res.status(400).json({error:"Data pelanggan dan alamat belum valid. Periksa kembali data checkout."});
      if(data.message==="INVALID_PRODUCT" || data.message==="INVALID_QUANTITY") return res.status(422).json({error:"Salah satu produk tidak lagi tersedia. Silakan periksa keranjang Anda."});
      if(data.message==="SHIPPING_QUOTE_EXPIRED") return res.status(409).json({error:"Opsi ongkir sudah kedaluwarsa. Kembali ke langkah pengiriman untuk memuat tarif terbaru."});
      if(["SHIPPING_QUOTE_MISMATCH","SHIPPING_QUOTE_CART_MISMATCH"].includes(data.message)) return res.status(409).json({error:"Opsi ongkir tidak lagi cocok dengan alamat atau isi keranjang. Muat ulang tarif pengiriman."});
      if(["INVALID_IDEMPOTENCY_KEY","INVALID_CART_FINGERPRINT"].includes(data.message)) return res.status(400).json({error:"Identitas checkout tidak valid. Muat ulang halaman lalu coba kembali."});
      if(data.message==="IDEMPOTENCY_REPLAY_EXPIRED") return res.status(409).json({error:"Sesi retry checkout sudah kedaluwarsa. Periksa menu Pesanan sebelum membuat checkout baru."});
      if(data.message==="ORDER_ACCESS_TOKEN_INVALID") return res.status(500).json({error:"Akses pesanan belum dapat dibuat. Silakan coba kembali."});
      return res.status(500).json({error:"Pesanan belum dapat diproses. Silakan coba kembali."});
    }
    const reused=Boolean(data.reused);
    res.setHeader("Idempotency-Replayed",reused?"true":"false");
    return res.status(reused?200:201).json({orderNumber:data.order_number,createdAt:data.created_at,subtotal:Number(data.subtotal),shippingCost:Number(data.shipping_cost),shippingProvider:data.shipping_provider||null,shippingServiceCode:data.shipping_service_code||null,shippingServiceName:data.shipping_service_name||null,shippingEtaMinDays:data.shipping_eta_min_days??null,shippingEtaMaxDays:data.shipping_eta_max_days??null,total:Number(data.total ?? data.grand_total),orderAccessToken,reused,...(body.payment!=="COD"?{paymentToken}: {})});
  } catch(error) {
    if (error instanceof SyntaxError) return res.status(400).json({error:"Format data pesanan tidak valid."});
    console.error("Order endpoint failed",{requestId,message:error.message});
    return res.status(500).json({error:"Pesanan belum dapat diproses. Silakan coba kembali."});
  }
};
