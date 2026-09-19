"use strict";
const { createHash } = require("node:crypto");
const { supabaseAdmin } = require("../_supabase");

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICES=Object.freeze([
  {serviceCode:"REG",serviceName:"Reguler",shippingMethod:"regular",amount:25000,etaMinDays:3,etaMaxDays:5},
  {serviceCode:"EXP",serviceName:"Express",shippingMethod:"express",amount:50000,etaMinDays:1,etaMaxDays:2},
  {serviceCode:"SDY",serviceName:"Same Day / Instant",shippingMethod:"sameday",amount:85000,etaMinDays:0,etaMaxDays:1},
  {serviceCode:"PUP",serviceName:"Ambil di Toko",shippingMethod:"pickup",amount:0,etaMinDays:0,etaMaxDays:0}
]);

function normalizeItems(items) {
  if(!Array.isArray(items)||!items.length||items.length>50) throw new Error("INVALID_ITEMS");
  const normalized=items.map(item=>({productId:String(item.productId||""),quantity:Number(item.quantity)}));
  if(!normalized.every(item=>UUID.test(item.productId)&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=99)) throw new Error("INVALID_ITEMS");
  return normalized.sort((a,b)=>a.productId.localeCompare(b.productId));
}

function cartFingerprint(items) {
  return createHash("sha256").update(items.map(item=>`${item.productId}:${item.quantity}`).join("|")).digest("hex");
}

async function insertQuotes(rows) {
  const response=await supabaseAdmin("shipping_quotes",{
    method:"POST",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify(rows)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok) throw new Error(data?.message||data?.error||`Shipping quote insert failed (${response.status})`);
  return data;
}

module.exports=async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    const city=String(body.city||body.destination?.city||"").trim();
    const postalCode=String(body.postalCode||body.destination?.postalCode||"").trim();
    if(city.length<2||!/^\d{5}$/.test(postalCode)) return res.status(400).json({error:"Kota dan kode pos tujuan belum valid."});
    const items=normalizeItems(body.items);
    const fingerprint=cartFingerprint(items);
    const expiresAt=new Date(Date.now()+30*60*1000).toISOString();
    const rows=SERVICES.map(service=>({
      provider:"internal",
      service_code:service.serviceCode,
      service_name:service.serviceName,
      shipping_method:service.shippingMethod,
      amount:service.amount,
      currency:"IDR",
      eta_min_days:service.etaMinDays,
      eta_max_days:service.etaMaxDays,
      destination_city:city,
      destination_postal_code:postalCode,
      cart_fingerprint:fingerprint,
      expires_at:expiresAt
    }));
    const quotes=await insertQuotes(rows);
    return res.status(200).json({
      quotes:quotes.map(row=>({
        quoteId:row.id,
        provider:row.provider,
        serviceCode:row.service_code,
        name:row.service_name,
        method:row.shipping_method,
        price:Number(row.amount),
        etaMinDays:row.eta_min_days,
        etaMaxDays:row.eta_max_days,
        expiresAt:row.expires_at
      }))
    });
  }catch(error){
    if(error instanceof SyntaxError||error.message==="INVALID_ITEMS") return res.status(400).json({error:"Data permintaan ongkir tidak valid."});
    console.error("Shipping quote creation failed",{message:error.message});
    if(error.message==="SUPABASE_SERVICE_ROLE_KEY is not configured") return res.status(503).json({error:"Layanan ongkir belum dikonfigurasi."});
    return res.status(500).json({error:"Opsi pengiriman belum dapat dimuat."});
  }
};
