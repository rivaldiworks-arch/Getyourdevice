"use strict";
const { supabase } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).setHeader("Allow", "POST").json({ error:"Method not allowed" });
  try {
    const body=typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if(!body?.customer || !Array.isArray(body.items) || !body.items.length || body.items.length>50) return res.status(400).json({error:"Data pesanan tidak lengkap."});
    const submitted=body.customer;
    const customer={full_name:String(submitted.full_name ?? submitted.fullName ?? submitted.name ?? submitted.custName ?? "").trim(),whatsapp:String(submitted.whatsapp ?? submitted.phone ?? submitted.phoneNumber ?? "").trim(),email:String(submitted.email ?? "").trim(),address:String(submitted.address ?? "").trim(),city:String(submitted.city ?? "").trim(),postal_code:String(submitted.postal_code ?? submitted.postalCode ?? "").trim()};
    console.info("Checkout customer payload shape", {keys:Object.keys(submitted).sort(),fullNamePresent:Boolean(customer.full_name)});
    if(!customer.full_name) return res.status(400).json({error:"Nama pelanggan wajib diisi sebelum membuat pesanan."});
    if(Object.values(customer).some(value=>!value)) return res.status(400).json({error:"Data pelanggan dan alamat wajib dilengkapi."});
    if(!body.items.every(item=>typeof item.productId==="string" && Number.isInteger(item.quantity) && item.quantity>0 && item.quantity<=99)) return res.status(400).json({error:"Item pesanan tidak valid."});
    console.info("Checkout RPC customer shape", {keys:Object.keys(customer).sort(),fullNamePresent:Boolean(customer.full_name)});
    const response=await supabase("rpc/create_storefront_order_v2",{method:"POST",body:JSON.stringify({p_customer:customer,p_items:body.items.map(item=>({product_id:item.productId,quantity:item.quantity})),p_shipping_id:body.shippingId,p_payment_method:body.payment})});
    const data=await response.json();
    if(!response.ok) {
      console.error("Supabase order RPC failed", {status:response.status,code:data.code,message:data.message,details:data.details,hint:data.hint});
      if(data.message==="INSUFFICIENT_STOCK") return res.status(409).json({error:"Stok salah satu produk tidak mencukupi. Perbarui keranjang lalu coba lagi."});
      if(data.message==="INVALID_CUSTOMER") return res.status(400).json({error:"Data pelanggan dan alamat tidak lengkap. Periksa kembali data checkout."});
      if(data.message==="INVALID_PRODUCT" || data.message==="INVALID_QUANTITY") return res.status(422).json({error:"Salah satu item pesanan tidak lagi tersedia. Perbarui keranjang lalu coba lagi."});
      return res.status(500).json({error:"Layanan pesanan sedang bermasalah. Silakan coba kembali beberapa saat lagi."});
    }
    return res.status(201).json({orderNumber:data.order_number,createdAt:data.created_at,subtotal:Number(data.subtotal),shippingCost:Number(data.shipping_cost),total:Number(data.grand_total)});
  } catch(error) { console.error("Order endpoint failed", error); return res.status(500).json({error:"Layanan pesanan sedang bermasalah. Silakan coba kembali beberapa saat lagi."}); }
};
