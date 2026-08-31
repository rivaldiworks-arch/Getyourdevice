"use strict";
const { supabase } = require("./_supabase");

const SHIPPING_METHODS = new Set(["regular", "express", "sameday", "pickup"]);
const PAYMENT_METHODS = new Set(["Transfer Bank", "COD"]);
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
  return customer.full_name.length>=3 && PHONE.test(customer.whatsapp) && EMAIL.test(customer.email) &&
    customer.address.length>=10 && customer.city.length>=2 && /^\d{5}$/.test(customer.postal_code);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).setHeader("Allow", "POST").json({ error:"Method not allowed" });
  try {
    const body=typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if(!body?.customer || !Array.isArray(body.items) || !body.items.length || body.items.length>50) return res.status(400).json({error:"Data pesanan tidak lengkap."});
    const customer=customerFrom(body.customer);
    if(!validCustomer(customer)) return res.status(400).json({error:"Data pelanggan belum valid. Periksa nama, WhatsApp, email, alamat, kota, dan kode pos."});
    if(!SHIPPING_METHODS.has(body.shippingId) || !PAYMENT_METHODS.has(body.payment)) return res.status(400).json({error:"Metode pengiriman atau pembayaran tidak valid."});
    if(!body.items.every(item=>UUID.test(item.productId||"") && Number.isInteger(item.quantity) && item.quantity>0 && item.quantity<=99)) return res.status(400).json({error:"Item pesanan tidak valid."});
    const response=await supabase("rpc/create_storefront_order_v2",{method:"POST",body:JSON.stringify({p_customer:customer,p_items:body.items.map(item=>({product_id:item.productId,quantity:item.quantity})),p_shipping_id:body.shippingId,p_payment_method:body.payment})});
    const data=await response.json();
    if(!response.ok) {
      console.error("Supabase order RPC failed", {status:response.status,code:data.code,message:data.message,details:data.details,hint:data.hint});
      if(data.message==="INSUFFICIENT_STOCK") return res.status(409).json({error:"Stok salah satu produk sudah berubah. Silakan periksa keranjang Anda."});
      if(data.message==="INVALID_CUSTOMER") return res.status(400).json({error:"Data pelanggan dan alamat belum valid. Periksa kembali data checkout."});
      if(data.message==="INVALID_PRODUCT" || data.message==="INVALID_QUANTITY") return res.status(422).json({error:"Salah satu produk tidak lagi tersedia. Silakan periksa keranjang Anda."});
      return res.status(500).json({error:"Pesanan belum dapat diproses. Silakan coba kembali."});
    }
    return res.status(201).json({orderNumber:data.order_number,createdAt:data.created_at,subtotal:Number(data.subtotal),shippingCost:Number(data.shipping_cost),total:Number(data.total ?? data.grand_total)});
  } catch(error) {
    if (error instanceof SyntaxError) return res.status(400).json({error:"Format data pesanan tidak valid."});
    console.error("Order endpoint failed", error);
    return res.status(500).json({error:"Pesanan belum dapat diproses. Silakan coba kembali."});
  }
};
