"use strict";
const { supabase } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).setHeader("Allow", "POST").json({ error:"Method not allowed" });
  try {
    const body=typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if(!body?.customer || !Array.isArray(body.items) || !body.items.length || body.items.length>50) return res.status(400).json({error:"Data pesanan tidak lengkap."});
    const customer=body.customer;
    if(!customer.name || !customer.email || !customer.phone || !customer.address || !customer.city || !customer.postalCode) return res.status(400).json({error:"Data pelanggan dan alamat wajib dilengkapi."});
    if(!body.items.every(item=>typeof item.productId==="string" && Number.isInteger(item.quantity) && item.quantity>0 && item.quantity<=99)) return res.status(400).json({error:"Item pesanan tidak valid."});
    const response=await supabase("rpc/create_storefront_order",{method:"POST",body:JSON.stringify({p_customer:{name:customer.name,email:customer.email,phone:customer.phone,address:customer.address,city:customer.city,postal_code:customer.postalCode,notes:customer.notes||""},p_items:body.items.map(item=>({product_id:item.productId,quantity:item.quantity})),p_shipping_id:body.shippingId,p_payment_method:body.payment})});
    const data=await response.json();
    if(!response.ok) {
      console.error("Supabase order RPC failed", {status:response.status,code:data.code,message:data.message,details:data.details,hint:data.hint});
      if(data.message==="INSUFFICIENT_STOCK") return res.status(409).json({error:"Stok salah satu produk tidak mencukupi. Perbarui keranjang lalu coba lagi."});
      if(data.message==="INVALID_PRODUCT" || data.message==="INVALID_QUANTITY") return res.status(422).json({error:"Salah satu item pesanan tidak lagi tersedia. Perbarui keranjang lalu coba lagi."});
      return res.status(500).json({error:"Layanan pesanan sedang bermasalah. Silakan coba kembali beberapa saat lagi."});
    }
    return res.status(201).json({orderNumber:data.order_number,createdAt:data.created_at,subtotal:Number(data.subtotal),shippingCost:Number(data.shipping_cost),total:Number(data.grand_total)});
  } catch(error) { console.error("Order endpoint failed", error); return res.status(500).json({error:"Layanan pesanan sedang bermasalah. Silakan coba kembali beberapa saat lagi."}); }
};
