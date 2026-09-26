"use strict";

const { requireAdmin } = require("../_adminAuth");
const { bookingConfig, createOrder, retrieveOrder } = require("./_biteship");
const { hydratePhysical, loadItems, loadOrder, patchOrder, value } = require("./_orderData");

function bookingItems(items) {
  return items.map(item=>{
    const weight=Number(item.weight_grams),length=Number(item.length_cm),width=Number(item.width_cm),height=Number(item.height_cm);
    if(!(weight>0&&length>0&&width>0&&height>0)) throw new Error(`Data berat/dimensi belum lengkap untuk ${item.product_name||"produk"}.`);
    return {
      name:item.product_name||"Produk GETYOURDEVICE",
      description:item.product_name||undefined,
      category:"electronic",
      value:Math.round(Number(value(item.product_price,item.price,item.unit_price,0))),
      quantity:Number(value(item.quantity,item.qty,1)),
      weight,length,width,height
    };
  });
}

function courierParts(serviceCode) {
  const [company,...rest]=String(serviceCode||"").split(":");
  const type=rest.join(":");
  if(!company||!type) throw new Error("Kode layanan Biteship pada order tidak valid.");
  return {company,type};
}

function shippingPatch(data,isTest) {
  const courier=data?.courier||{};
  return {
    shipping_order_id:String(data?.id||"")||null,
    shipping_tracking_id:String(courier.tracking_id||"")||null,
    shipping_status:String(data?.status||"confirmed"),
    shipping_environment:isTest?"test":"live",
    shipping_booked_at:new Date().toISOString(),
    shipping_last_event_at:new Date().toISOString(),
    shipping_cost_actual:Number.isFinite(Number(data?.price))?Number(data.price):null,
    tracking_number:String(courier.waybill_id||"")||null,
    tracking_url:String(courier.link||"")||null
  };
}

module.exports=async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  try{
    await requireAdmin(req);
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const orderId=String(body.orderId||"").trim();
    if(!orderId) return res.status(400).json({error:"Order ID wajib diisi."});

    let order=await loadOrder(orderId);
    if(!order) return res.status(404).json({error:"Pesanan tidak ditemukan."});
    if(order.shipping_provider!=="biteship") return res.status(409).json({error:"Pesanan ini tidak menggunakan pengiriman Biteship."});
    if(order.shipping_method==="pickup") return res.status(409).json({error:"Pesanan ambil di toko tidak memerlukan booking kurir."});

    const cfg=bookingConfig();
    if(!cfg.isTest && String(order.payment_status||"").toLowerCase()!=="paid") {
      return res.status(409).json({error:"Pengiriman live hanya dapat dibooking setelah pembayaran berstatus paid."});
    }

    if(order.shipping_order_id) {
      const existing=await retrieveOrder(order.shipping_order_id);
      await patchOrder(order.id,shippingPatch(existing,cfg.isTest));
      return res.status(200).json({
        alreadyBooked:true,
        environment:cfg.isTest?"test":"live",
        shippingOrderId:existing.id,
        status:existing.status,
        trackingNumber:existing.courier?.waybill_id||null,
        trackingId:existing.courier?.tracking_id||null
      });
    }

    let items=await loadItems(order.id);
    items=await hydratePhysical(items);
    const courier=courierParts(order.shipping_service_code);
    const destinationAddress=String(value(order.shipping_address,order.address,"")).trim();
    const destinationPhone=String(value(order.customer_phone,order.whatsapp,"")).trim();
    const destinationName=String(value(order.customer_name,order.full_name,"")).trim();
    if(destinationAddress.length<10||destinationPhone.length<9||destinationName.length<2) {
      return res.status(422).json({error:"Data penerima pada pesanan belum lengkap untuk booking kurir."});
    }

    const payload={
      shipper_contact_name:cfg.originContactName,
      shipper_contact_phone:cfg.originContactPhone,
      ...(cfg.originContactEmail?{shipper_contact_email:cfg.originContactEmail}:{}),
      shipper_organization:cfg.organization,
      origin_contact_name:cfg.originContactName,
      origin_contact_phone:cfg.originContactPhone,
      ...(cfg.originContactEmail?{origin_contact_email:cfg.originContactEmail}:{}),
      origin_address:cfg.originAddress,
      ...(cfg.originNote?{origin_note:cfg.originNote}:{}),
      origin_postal_code:Number(cfg.originPostalCode),
      destination_contact_name:destinationName,
      destination_contact_phone:destinationPhone,
      ...(order.customer_email?{destination_contact_email:order.customer_email}:{}),
      destination_address:destinationAddress,
      destination_postal_code:Number(order.postal_code),
      ...(value(order.order_notes,order.notes,order.customer_notes)?{destination_note:String(value(order.order_notes,order.notes,order.customer_notes)).slice(0,500)}:{}),
      courier_company:courier.company,
      courier_type:courier.type,
      delivery_type:"now",
      reference_id:order.order_number,
      order_note:`GETYOURDEVICE ${order.order_number}`,
      metadata:{getyourdevice_order_id:order.id,getyourdevice_order_number:order.order_number},
      items:bookingItems(items)
    };

    const created=await createOrder(payload);
    const patch=shippingPatch(created,cfg.isTest);
    await patchOrder(order.id,patch);
    return res.status(201).json({
      environment:cfg.isTest?"test":"live",
      shippingOrderId:created.id,
      status:created.status,
      trackingNumber:created.courier?.waybill_id||null,
      trackingId:created.courier?.tracking_id||null,
      trackingUrl:created.courier?.link||null,
      actualShippingCost:Number.isFinite(Number(created.price))?Number(created.price):null
    });
  }catch(error){
    if(error instanceof SyntaxError) return res.status(400).json({error:"Format permintaan tidak valid."});
    const status=Number(error.status)||500;
    if(["ADMIN_AUTH_REQUIRED","ADMIN_AUTH_INVALID"].includes(error.message)) return res.status(401).json({error:"Sesi admin tidak valid. Silakan login ulang."});
    if(error.message==="ADMIN_FORBIDDEN") return res.status(403).json({error:"Akun tidak memiliki akses admin."});
    if(/SHIPPING_ORIGIN_.*not configured/.test(error.message)) return res.status(503).json({error:"Data pickup origin belum lengkap di server."});
    console.error("Shipment booking failed",{status:error.status||null,code:error.code||null,message:error.message});
    return res.status(status>=400&&status<500?status:500).json({error:error.message||"Pengiriman belum dapat dibooking."});
  }
};
