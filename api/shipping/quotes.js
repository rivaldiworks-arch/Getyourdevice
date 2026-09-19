"use strict";
const { createHash } = require("node:crypto");
const { supabaseAdmin } = require("../_supabase");
const { retrieveRates } = require("./_biteship");

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FALLBACK_SERVICES=Object.freeze([
  {provider:"internal",serviceCode:"REG",serviceName:"Reguler",shippingMethod:"regular",amount:25000,etaMinDays:3,etaMaxDays:5},
  {provider:"internal",serviceCode:"EXP",serviceName:"Express",shippingMethod:"express",amount:50000,etaMinDays:1,etaMaxDays:2},
  {provider:"internal",serviceCode:"SDY",serviceName:"Same Day / Instant",shippingMethod:"sameday",amount:85000,etaMinDays:0,etaMaxDays:1}
]);
const PICKUP=Object.freeze({provider:"internal",serviceCode:"PUP",serviceName:"Ambil di Toko",shippingMethod:"pickup",amount:0,etaMinDays:0,etaMaxDays:0});

function normalizeItems(items) {
  if(!Array.isArray(items)||!items.length||items.length>50) throw new Error("INVALID_ITEMS");
  const normalized=items.map(item=>({productId:String(item.productId||""),quantity:Number(item.quantity)}));
  if(!normalized.every(item=>UUID.test(item.productId)&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=99)) throw new Error("INVALID_ITEMS");
  return normalized.sort((a,b)=>a.productId.localeCompare(b.productId));
}

function cartFingerprint(items) {
  return createHash("sha256").update(items.map(item=>`${item.productId}:${item.quantity}`).join("|")).digest("hex");
}

async function productRows(items) {
  const ids=items.map(item=>item.productId);
  const response=await supabaseAdmin(`products?select=id,name,description,price,is_active,weight_grams,length_cm,width_cm,height_cm&id=in.(${ids.map(encodeURIComponent).join(",")})`);
  const data=await response.json().catch(()=>[]);
  if(!response.ok) throw new Error(data?.message||data?.error||`Product shipping lookup failed (${response.status})`);
  return data||[];
}

function productShippingReady(product) {
  return product && product.is_active!==false && Number(product.weight_grams)>0 && Number(product.length_cm)>0 && Number(product.width_cm)>0 && Number(product.height_cm)>0;
}

function biteshipItems(items,products) {
  const byId=new Map(products.map(product=>[String(product.id),product]));
  return items.map(item=>{
    const product=byId.get(item.productId);
    return {
      name:product.name,
      description:product.description||undefined,
      value:Math.round(Number(product.price)||0),
      length:Number(product.length_cm),
      width:Number(product.width_cm),
      height:Number(product.height_cm),
      weight:Number(product.weight_grams),
      quantity:item.quantity
    };
  });
}

async function rateServices(items,destinationPostalCode) {
  const products=await productRows(items);
  if(products.length!==items.length) throw new Error("INVALID_PRODUCT");
  const missing=products.filter(product=>!productShippingReady(product)).map(product=>product.name);
  if(missing.length) return {services:[...FALLBACK_SERVICES,PICKUP],live:false,missing};
  if(!process.env.BITESHIP_API_KEY||!process.env.SHIPPING_ORIGIN_POSTAL_CODE) return {services:[...FALLBACK_SERVICES,PICKUP],live:false,missing:[]};
  try{
    const liveRates=await retrieveRates({destinationPostalCode,items:biteshipItems(items,products)});
    if(!liveRates.length) return {services:[...FALLBACK_SERVICES,PICKUP],live:false,missing:[],warning:"Kurir live belum mengembalikan layanan untuk tujuan ini."};
    return {services:[...liveRates,PICKUP],live:true,missing:[],warning:null};
  }catch(error){
    console.warn("Biteship live rates unavailable",{status:error.status||null,code:error.code||null,message:error.message});
    const warning=/sufficient balance|top up/i.test(error.message||"")?"Saldo Biteship belum cukup untuk cek ongkir live; menampilkan tarif fallback.":"Tarif kurir live sedang tidak tersedia; menampilkan tarif fallback.";
    return {services:[...FALLBACK_SERVICES,PICKUP],live:false,missing:[],warning};
  }
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
    const rateResult=await rateServices(items,postalCode);
    const rows=rateResult.services.map(service=>({
      provider:service.provider,
      service_code:service.serviceCode,
      service_name:service.serviceName,
      shipping_method:service.shippingMethod,
      amount:service.amount,
      currency:service.currency||"IDR",
      eta_min_days:service.etaMinDays,
      eta_max_days:service.etaMaxDays,
      destination_city:city,
      destination_postal_code:postalCode,
      cart_fingerprint:fingerprint,
      provider_reference:service.providerReference||null,
      expires_at:expiresAt
    }));
    const quotes=await insertQuotes(rows);
    return res.status(200).json({
      liveRates:rateResult.live,
      missingShippingSpecs:rateResult.missing,
      rateWarning:rateResult.warning||null,
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
    if(error.message==="INVALID_PRODUCT") return res.status(422).json({error:"Salah satu produk tidak tersedia untuk pengiriman."});
    if(error.message==="BITESHIP_API_KEY is not configured"||error.message==="SHIPPING_ORIGIN_POSTAL_CODE is not configured") return res.status(503).json({error:"Integrasi kurir belum dikonfigurasi."});
    return res.status(500).json({error:"Opsi pengiriman belum dapat dimuat."});
  }
};
