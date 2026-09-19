"use strict";

const DEFAULT_COURIERS="jne,jnt,sicepat,anteraja,ninja,pos,tiki";

function config() {
  const apiKey=String(process.env.BITESHIP_API_KEY||"").trim();
  const originPostalCode=String(process.env.SHIPPING_ORIGIN_POSTAL_CODE||"").trim();
  const couriers=String(process.env.BITESHIP_COURIERS||DEFAULT_COURIERS).trim();
  if(!apiKey) throw new Error("BITESHIP_API_KEY is not configured");
  if(!/^\d{5}$/.test(originPostalCode)) throw new Error("SHIPPING_ORIGIN_POSTAL_CODE is not configured");
  return {apiKey,originPostalCode,couriers,isTest:apiKey.startsWith("biteship_test.")};
}

async function biteshipFetch(path,options={}) {
  const {apiKey}=config();
  const response=await fetch(`https://api.biteship.com${path}`,{
    ...options,
    headers:{Accept:"application/json",authorization:apiKey,"content-type":"application/json",...options.headers}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.success===false){
    const providerMessage=typeof data?.error==="string"?data.error:data?.error?.message;
    const error=new Error(data?.message||providerMessage||`Biteship request failed (${response.status})`);
    error.status=response.status;
    error.code=data?.code||null;
    error.biteship=data;
    throw error;
  }
  return data;
}

function parseEta(rate) {
  const unit=String(rate.shipment_duration_unit||"").toLowerCase();
  const range=String(rate.shipment_duration_range||rate.duration||"").match(/\d+/g)?.map(Number)||[];
  if(unit.includes("hour")) return {etaMinDays:0,etaMaxDays:1};
  if(!range.length) return {etaMinDays:null,etaMaxDays:null};
  return {etaMinDays:Math.max(0,range[0]),etaMaxDays:Math.max(range[0],range[1]??range[0])};
}

function shippingMethod(rate) {
  const type=String(rate.service_type||"").toLowerCase();
  if(type==="same_day"||type==="instant") return "sameday";
  if(type==="overnight"||/yes|ons|next/i.test(String(rate.courier_service_code||""))) return "express";
  return "regular";
}

function mapRate(rate) {
  const eta=parseEta(rate);
  const courierCode=String(rate.courier_code||rate.company||"").trim();
  const serviceCode=String(rate.courier_service_code||rate.type||"").trim();
  return {
    provider:"biteship",
    serviceCode:`${courierCode}:${serviceCode}`,
    serviceName:`${rate.courier_name||courierCode} · ${rate.courier_service_name||serviceCode}`,
    shippingMethod:shippingMethod(rate),
    amount:Number(rate.price),
    currency:rate.currency||"IDR",
    etaMinDays:eta.etaMinDays,
    etaMaxDays:eta.etaMaxDays,
    providerReference:`${courierCode}/${serviceCode}`
  };
}

async function retrieveRates({destinationPostalCode,items}) {
  const {originPostalCode,couriers}=config();
  const data=await biteshipFetch("/v1/rates/couriers",{
    method:"POST",
    body:JSON.stringify({
      origin_postal_code:Number(originPostalCode),
      destination_postal_code:Number(destinationPostalCode),
      couriers,
      items
    })
  });
  const pricing=Array.isArray(data?.pricing)?data.pricing:[];
  return pricing.map(mapRate).filter(rate=>Number.isFinite(rate.amount)&&rate.amount>=0&&rate.serviceCode!==":");
}

function bookingConfig() {
  const base=config();
  const originContactName=String(process.env.SHIPPING_ORIGIN_CONTACT_NAME||"").trim();
  const originContactPhone=String(process.env.SHIPPING_ORIGIN_CONTACT_PHONE||"").trim();
  const originAddress=String(process.env.SHIPPING_ORIGIN_ADDRESS||"").trim();
  const originContactEmail=String(process.env.SHIPPING_ORIGIN_CONTACT_EMAIL||"").trim();
  const originNote=String(process.env.SHIPPING_ORIGIN_NOTE||"").trim();
  const organization=String(process.env.SHIPPING_ORIGIN_ORGANIZATION||"GETYOURDEVICE").trim();
  if(!originContactName) throw new Error("SHIPPING_ORIGIN_CONTACT_NAME is not configured");
  if(!/^\+?\d{9,15}$/.test(originContactPhone.replace(/[\s().-]/g,""))) throw new Error("SHIPPING_ORIGIN_CONTACT_PHONE is not configured");
  if(originAddress.length<10) throw new Error("SHIPPING_ORIGIN_ADDRESS is not configured");
  return {...base,originContactName,originContactPhone,originAddress,originContactEmail,originNote,organization};
}

async function createOrder(payload) {
  try{
    return await biteshipFetch("/v1/orders",{method:"POST",body:JSON.stringify(payload)});
  }catch(error){
    if(Number(error.code)===40002060 && error.biteship?.details?.order_id){
      return retrieveOrder(error.biteship.details.order_id);
    }
    throw error;
  }
}

async function retrieveOrder(id) {
  return biteshipFetch(`/v1/orders/${encodeURIComponent(id)}`,{method:"GET"});
}

async function retrieveTracking(id) {
  return biteshipFetch(`/v1/trackings/${encodeURIComponent(id)}`,{method:"GET"});
}

module.exports={config,bookingConfig,retrieveRates,createOrder,retrieveOrder,retrieveTracking};
