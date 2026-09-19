"use strict";
module.exports=async function handler(req,res){
  if(process.env.VERCEL_ENV!=="production") return res.status(404).json({error:"Not found"});
  const key=String(process.env.BITESHIP_API_KEY||"");
  const origin=String(process.env.SHIPPING_ORIGIN_POSTAL_CODE||"");
  return res.status(200).json({
    hasBiteshipApiKey:Boolean(key),
    isTestKey:key.startsWith("biteship_test"),
    originPostalConfigured:/^\d{5}$/.test(origin),
    originPostalCode:/^\d{5}$/.test(origin)?origin:null
  });
};