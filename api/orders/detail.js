"use strict";
const { createHash, timingSafeEqual } = require("node:crypto");
const { supabaseAdmin } = require("../_supabase");
const { guardPublicJson } = require("../_guard");

const ORDER_NUMBER=/^GYD-\d{8}-\d{4,}$/;
const TOKEN=/^[a-f0-9]{64}$/i;

function hash(value){return createHash("sha256").update(value).digest("hex");}
function secureEqual(a,b){
  const left=Buffer.from(String(a||"")),right=Buffer.from(String(b||""));
  return left.length===right.length&&left.length>0&&timingSafeEqual(left,right);
}
async function rows(path){
  const response=await supabaseAdmin(path);
  const data=await response.json().catch(()=>[]);
  if(!response.ok) throw new Error(data?.message||data?.error||`Supabase lookup failed (${response.status})`);
  return data||[];
}

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  const guard=await guardPublicJson(req,res,{bucket:"orders:detail",limit:240,windowSeconds:900,maxBytes:8*1024});
  if(!guard.ok)return;
  const {requestId}=guard;
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const orderNumber=String(body.orderNumber||"").trim();
    const token=String(body.orderAccessToken||"").trim();
    if(!ORDER_NUMBER.test(orderNumber)||!TOKEN.test(token)) return res.status(400).json({error:"Nomor pesanan atau akses pesanan tidak valid."});

    const order=(await rows(`orders?select=id,order_number,created_at,status,payment_method,payment_status,shipping_provider,shipping_service_code,shipping_service_name,shipping_status,shipping_cost,shipping_eta_min_days,shipping_eta_max_days,tracking_number,tracking_url,shipped_at,delivered_at,subtotal,total,customer_name,city,payment_access_expires_at,order_access_token_hash,order_access_expires_at&order_number=eq.${encodeURIComponent(orderNumber)}&limit=1`))[0];
    if(!order||!secureEqual(hash(token),order.order_access_token_hash)||!order.order_access_expires_at||new Date(order.order_access_expires_at).getTime()<=Date.now()){
      return res.status(404).json({error:"Pesanan tidak ditemukan atau akses sudah kedaluwarsa."});
    }

    const items=await rows(`order_items?select=product_name,quantity,product_price,subtotal&order_id=eq.${encodeURIComponent(order.id)}`);
    return res.status(200).json({
      orderNumber:order.order_number,
      createdAt:order.created_at,
      status:order.status,
      paymentMethod:order.payment_method,
      paymentStatus:order.payment_status,
      // Payment capability tokens expire 24 hours after checkout; the storefront uses
      // this to decide whether the customer can still request a QR.
      paymentDeadline:order.payment_access_expires_at||null,
      shippingProvider:order.shipping_provider,
      shippingServiceCode:order.shipping_service_code,
      shippingServiceName:order.shipping_service_name,
      shippingStatus:order.shipping_status,
      shippingCost:Number(order.shipping_cost||0),
      shippingEtaMinDays:order.shipping_eta_min_days,
      shippingEtaMaxDays:order.shipping_eta_max_days,
      trackingNumber:order.tracking_number||null,
      trackingUrl:/^https:\/\//i.test(String(order.tracking_url||""))?order.tracking_url:null,
      shippedAt:order.shipped_at||null,
      deliveredAt:order.delivered_at||null,
      subtotal:Number(order.subtotal||0),
      total:Number(order.total||0),
      customerName:order.customer_name||null,
      city:order.city||null,
      items:items.map(item=>({
        name:item.product_name||"Produk",
        quantity:Number(item.quantity||1),
        unitPrice:Number(item.product_price||0),
        subtotal:Number(item.subtotal||0)
      }))
    });
  }catch(error){
    if(error instanceof SyntaxError) return res.status(400).json({error:"Format permintaan tidak valid."});
    console.error("Customer order lookup failed",{requestId,message:error.message});
    return res.status(500).json({error:"Pesanan belum dapat dimuat."});
  }
};
