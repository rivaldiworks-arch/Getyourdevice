"use strict";

const { timingSafeEqual } = require("node:crypto");
const { supabaseAdmin } = require("../_supabase");
const { orderStatusForShipment } = require("../_orderStatus");

function secureEqual(a,b){
  const left=Buffer.from(String(a||"")),right=Buffer.from(String(b||""));
  return left.length===right.length && left.length>0 && timingSafeEqual(left,right);
}
function webhookAuth(req){
  const headerName=String(process.env.BITESHIP_WEBHOOK_HEADER_NAME||"").trim().toLowerCase();
  const secret=String(process.env.BITESHIP_WEBHOOK_HEADER_SECRET||"").trim();
  if(!headerName||!secret) throw new Error("BITESHIP_WEBHOOK_AUTH_NOT_CONFIGURED");
  return secureEqual(req.headers[headerName],secret);
}
async function rows(path){
  const response=await supabaseAdmin(path);
  const data=await response.json().catch(()=>[]);
  if(!response.ok) throw new Error(data?.message||data?.error||`Supabase lookup failed (${response.status})`);
  return data||[];
}
async function patchOrder(id,body){
  const response=await supabaseAdmin(`orders?id=eq.${encodeURIComponent(id)}`,{
    method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(body)
  });
  if(!response.ok) {
    const data=await response.json().catch(()=>({}));
    throw new Error(data?.message||data?.error||"Shipping webhook update failed");
  }
}

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  try{
    const payload=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    // Biteship validates a new webhook with an empty request body before activation.
    // Return a harmless 200 only for that installation probe; real events still require the configured secret header.
    if(!payload || (typeof payload==="object" && Object.keys(payload).length===0)) {
      return res.status(200).json({ok:true});
    }
    if(!webhookAuth(req)) return res.status(401).json({error:"Unauthorized"});
    const event=String(payload.event||"");
    const shippingOrderId=String(payload.order_id||"");
    if(!shippingOrderId||!["order.status","order.waybill_id","order.price"].includes(event)) {
      return res.status(200).json({ok:true,ignored:true});
    }

    const order=(await rows(`orders?select=id,status,payment_method,shipping_method,shipping_status,shipping_order_id&shipping_order_id=eq.${encodeURIComponent(shippingOrderId)}&limit=1`))[0];
    if(!order) return res.status(200).json({ok:true,ignored:true});

    const now=new Date().toISOString();
    const patch={shipping_last_event_at:now};
    const shippingStatus=String(payload.status||order.shipping_status||"");
    if(shippingStatus) {
      patch.shipping_status=shippingStatus;
      const status=orderStatusForShipment(shippingStatus,order);
      if(status!==order.status) patch.status=status;
    }
    if(payload.courier_tracking_id) patch.shipping_tracking_id=String(payload.courier_tracking_id);
    if(payload.courier_waybill_id) patch.tracking_number=String(payload.courier_waybill_id);
    if(payload.courier_link) patch.tracking_url=String(payload.courier_link);
    if(event==="order.price") {
      const actual=Number(payload.price ?? payload.shippment_fee);
      if(Number.isFinite(actual)&&actual>=0) patch.shipping_cost_actual=actual;
    }
    if(["picked","dropping_off"].includes(shippingStatus.toLowerCase())) patch.shipped_at=now;
    if(shippingStatus.toLowerCase()==="delivered") patch.delivered_at=now;

    await patchOrder(order.id,patch);
    return res.status(200).json({ok:true});
  }catch(error){
    if(error instanceof SyntaxError) return res.status(400).json({error:"Invalid JSON"});
    if(error.message==="BITESHIP_WEBHOOK_AUTH_NOT_CONFIGURED") {
      console.error("Biteship webhook auth not configured");
      return res.status(503).json({error:"Webhook not configured"});
    }
    console.error("Biteship shipping webhook failed",{message:error.message});
    return res.status(500).json({error:"Webhook update failed"});
  }
};
