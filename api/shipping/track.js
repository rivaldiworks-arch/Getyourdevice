"use strict";

const { supabaseAdmin } = require("../_supabase");
const { requireAdmin } = require("../_adminAuth");
const { retrieveTracking } = require("./_biteship");
const { orderStatusForShipment } = require("../_orderStatus");

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
  if(!response.ok) throw new Error("Tracking update failed");
}

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  try{
    await requireAdmin(req);
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const orderId=String(body.orderId||"").trim();
    if(!orderId) return res.status(400).json({error:"Order ID wajib diisi."});
    const order=(await rows(`orders?select=id,status,payment_method,shipping_method,shipping_tracking_id,shipping_order_id&id=eq.${encodeURIComponent(orderId)}&limit=1`))[0];
    if(!order) return res.status(404).json({error:"Pesanan tidak ditemukan."});
    if(!order.shipping_tracking_id) return res.status(409).json({error:"Tracking ID Biteship belum tersedia."});

    const tracking=await retrieveTracking(order.shipping_tracking_id);
    const patch={
      shipping_status:tracking.status||null,
      tracking_number:tracking.waybill_id||null,
      tracking_url:tracking.link||null,
      shipping_last_event_at:new Date().toISOString()
    };
    const status=orderStatusForShipment(tracking.status,order);
    if(status!==order.status) patch.status=status;
    if(tracking.status==="delivered") patch.delivered_at=new Date().toISOString();
    if(["picked","dropping_off"].includes(String(tracking.status||"").toLowerCase())) patch.shipped_at=new Date().toISOString();
    await patchOrder(order.id,patch);

    return res.status(200).json({
      status:tracking.status||null,
      trackingNumber:tracking.waybill_id||null,
      trackingUrl:tracking.link||null,
      history:Array.isArray(tracking.history)?tracking.history.slice(-10).map(item=>({
        status:item.status||null,note:item.note||null,updatedAt:item.updated_at||null
      })):[]
    });
  }catch(error){
    if(error instanceof SyntaxError) return res.status(400).json({error:"Format permintaan tidak valid."});
    if(["ADMIN_AUTH_REQUIRED","ADMIN_AUTH_INVALID"].includes(error.message)) return res.status(401).json({error:"Sesi admin tidak valid. Silakan login ulang."});
    if(error.message==="ADMIN_FORBIDDEN") return res.status(403).json({error:"Akun tidak memiliki akses admin."});
    console.error("Tracking refresh failed",{status:error.status||null,code:error.code||null,message:error.message});
    return res.status(500).json({error:error.message||"Tracking belum dapat diperbarui."});
  }
};
