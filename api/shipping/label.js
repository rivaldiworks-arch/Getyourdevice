"use strict";

// Data for the printable shipping label. Biteship has no label API, so the admin
// panel renders its own 100x150 mm label from this. Requires a booked shipment with
// a courier waybill (resi); a missing waybill is fetched once from Biteship.
const { requireAdmin } = require("../_adminAuth");
const { bookingConfig, retrieveOrder } = require("./_biteship");
const { hydratePhysical, loadItems, loadOrder, patchOrder, value } = require("./_orderData");

function courierParts(serviceCode) {
  const [company,...rest]=String(serviceCode||"").split(":");
  return {company:company||null,type:rest.join(":")||null};
}

module.exports=async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  try{
    await requireAdmin(req);
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const orderId=String(body.orderId||"").trim();
    if(!orderId) return res.status(400).json({error:"Order ID wajib diisi."});

    const order=await loadOrder(orderId);
    if(!order) return res.status(404).json({error:"Pesanan tidak ditemukan."});
    if(!order.shipping_order_id) return res.status(409).json({error:"Buat pengiriman Biteship terlebih dahulu sebelum mencetak label."});

    let trackingNumber=String(order.tracking_number||"").trim();
    let trackingUrl=order.tracking_url||null;
    if(!trackingNumber) {
      // Some couriers assign the waybill after booking; the webhook may not have landed yet.
      const shipment=await retrieveOrder(order.shipping_order_id);
      trackingNumber=String(shipment?.courier?.waybill_id||"").trim();
      trackingUrl=shipment?.courier?.link||trackingUrl;
      if(trackingNumber) await patchOrder(order.id,{tracking_number:trackingNumber,...(trackingUrl?{tracking_url:trackingUrl}:{})});
    }
    if(!trackingNumber) return res.status(409).json({error:"Nomor resi belum diterbitkan kurir. Coba lagi beberapa saat lagi.",code:"WAYBILL_PENDING"});

    const cfg=bookingConfig();
    const items=await hydratePhysical(await loadItems(order.id));
    const quantity=item=>Number(value(item.quantity,item.qty,1))||1;
    const weightGrams=items.reduce((sum,item)=>sum+(Number(item.weight_grams)||0)*quantity(item),0);
    const courier=courierParts(order.shipping_service_code);

    return res.status(200).json({
      orderNumber:order.order_number,
      createdAt:order.created_at,
      trackingNumber,
      courier:{company:courier.company,type:courier.type,name:value(order.shipping_service_name,order.shipping_service_code,"Kurir")},
      environment:order.shipping_environment||null,
      recipient:{
        name:value(order.customer_name,order.full_name,""),
        phone:value(order.customer_phone,order.whatsapp,""),
        address:value(order.shipping_address,order.address,""),
        city:order.city||"",
        postalCode:order.postal_code||"",
        note:value(order.order_notes,order.notes,order.customer_notes,null)
      },
      sender:{
        name:cfg.organization||cfg.originContactName,
        contact:cfg.originContactName,
        phone:cfg.originContactPhone,
        address:cfg.originAddress,
        postalCode:cfg.originPostalCode
      },
      items:items.map(item=>({name:value(item.product_name,item.name,"Produk"),quantity:quantity(item)})),
      weightGrams:weightGrams>0?weightGrams:null
    });
  }catch(error){
    if(error instanceof SyntaxError) return res.status(400).json({error:"Format permintaan tidak valid."});
    if(["ADMIN_AUTH_REQUIRED","ADMIN_AUTH_INVALID"].includes(error.message)) return res.status(401).json({error:"Sesi admin tidak valid. Silakan login ulang."});
    if(error.message==="ADMIN_FORBIDDEN") return res.status(403).json({error:"Akun tidak memiliki akses admin."});
    if(/SHIPPING_ORIGIN_.*not configured|BITESHIP_API_KEY|SHIPPING_ORIGIN_POSTAL_CODE/.test(error.message)) return res.status(503).json({error:"Data pengirim atau Biteship belum lengkap di server."});
    console.error("Shipping label failed",{status:error.status||null,code:error.code||null,message:error.message});
    return res.status(500).json({error:"Label belum dapat dibuat."});
  }
};
