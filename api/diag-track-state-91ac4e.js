"use strict";
const { supabaseAdmin } = require("./_supabase");
const { retrieveTracking } = require("./shipping/_biteship");

module.exports=async function handler(req,res){
  if(process.env.VERCEL_ENV!=="production") return res.status(404).json({error:"Not found"});
  try{
    const response=await supabaseAdmin("orders?select=id,order_number,status,shipping_status,shipping_tracking_id,tracking_number,shipping_last_event_at,shipped_at,delivered_at&order_number=eq.GYD-20260920-0001&limit=1");
    const rows=await response.json().catch(()=>[]);
    const order=rows?.[0];
    if(!response.ok||!order) return res.status(200).json({found:false});
    let provider=null;
    if(order.shipping_tracking_id){
      try{
        const t=await retrieveTracking(order.shipping_tracking_id);
        provider={
          status:t?.status||null,
          waybillId:t?.waybill_id||null,
          history:Array.isArray(t?.history)?t.history.slice(-5).map(h=>({status:h.status||null,note:h.note||null,updatedAt:h.updated_at||null})):[]
        };
      }catch(error){
        provider={error:error.message,statusCode:error.status||null};
      }
    }
    return res.status(200).json({
      found:true,
      local:{
        orderStatus:order.status,
        shippingStatus:order.shipping_status,
        trackingNumber:order.tracking_number,
        shippingLastEventAt:order.shipping_last_event_at,
        shippedAt:order.shipped_at,
        deliveredAt:order.delivered_at
      },
      provider
    });
  }catch(error){
    return res.status(200).json({error:error.message});
  }
};