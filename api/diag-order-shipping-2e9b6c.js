"use strict";
const { supabaseAdmin } = require("./_supabase");
module.exports=async function handler(req,res){
  if(process.env.VERCEL_ENV!=="production") return res.status(404).json({error:"Not found"});
  const orderNumber="GYD-20260920-0001";
  try{
    const response=await supabaseAdmin(`orders?select=order_number,shipping_method,shipping_cost,shipping_provider,shipping_service_code,shipping_service_name,shipping_eta_min_days,shipping_eta_max_days,shipping_quote_id,total,payment_status&order_number=eq.${encodeURIComponent(orderNumber)}&limit=1`);
    const rows=await response.json().catch(()=>[]);
    if(!response.ok) return res.status(200).json({found:false,error:"lookup_failed"});
    const o=rows?.[0];
    if(!o) return res.status(200).json({found:false});
    return res.status(200).json({
      found:true,
      orderNumber:o.order_number,
      shippingMethod:o.shipping_method,
      shippingCost:Number(o.shipping_cost),
      shippingProvider:o.shipping_provider,
      shippingServiceCode:o.shipping_service_code,
      shippingServiceName:o.shipping_service_name,
      etaMinDays:o.shipping_eta_min_days,
      etaMaxDays:o.shipping_eta_max_days,
      hasShippingQuote:Boolean(o.shipping_quote_id),
      total:Number(o.total),
      paymentStatus:o.payment_status
    });
  }catch(error){
    return res.status(200).json({found:false,error:error.message});
  }
};