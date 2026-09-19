"use strict";
const { supabaseAdmin } = require("./_supabase");
module.exports=async function handler(req,res){
  if(process.env.VERCEL_ENV!=="production") return res.status(404).json({error:"Not found"});
  const orderNumber="GYD-20260920-0001";
  const response=await supabaseAdmin(`orders?select=id,order_number,status,shipping_status,shipping_order_id,shipping_tracking_id,tracking_number,tracking_url,shipping_last_event_at,shipped_at,delivered_at&order_number=eq.${encodeURIComponent(orderNumber)}&limit=1`);
  const rows=await response.json().catch(()=>[]);
  if(!response.ok) return res.status(200).json({found:false,error:"lookup_failed"});
  const o=rows?.[0];
  if(!o) return res.status(200).json({found:false});
  return res.status(200).json({
    found:true,
    orderStatus:o.status,
    shippingStatus:o.shipping_status,
    hasShippingOrder:Boolean(o.shipping_order_id),
    hasTrackingId:Boolean(o.shipping_tracking_id),
    trackingNumber:o.tracking_number||null,
    hasTrackingUrl:Boolean(o.tracking_url),
    shippingLastEventAt:o.shipping_last_event_at||null,
    shippedAt:o.shipped_at||null,
    deliveredAt:o.delivered_at||null
  });
};