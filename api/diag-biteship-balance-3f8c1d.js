"use strict";
module.exports=async function handler(req,res){
  if(process.env.VERCEL_ENV!=="production") return res.status(404).json({error:"Not found"});
  const apiKey=String(process.env.BITESHIP_API_KEY||"");
  try{
    const response=await fetch("https://api.biteship.com/v1/rates/couriers",{
      method:"POST",
      headers:{authorization:apiKey,"content-type":"application/json",accept:"application/json"},
      body:JSON.stringify({
        origin_postal_code:10140,
        destination_postal_code:12240,
        couriers:"jne,sicepat,jnt",
        items:[{name:"Diagnostic electronic item",category:"electronic",value:1000000,length:20,width:12,height:8,weight:500,quantity:1}]
      })
    });
    const data=await response.json().catch(()=>({}));
    return res.status(200).json({
      httpStatus:response.status,
      success:data?.success??response.ok,
      message:data?.message??(typeof data?.error==="string"?data.error:data?.error?.message)??null,
      pricingCount:Array.isArray(data?.pricing)?data.pricing.length:0,
      sample:Array.isArray(data?.pricing)?data.pricing.slice(0,3).map(r=>({
        courier:r.courier_name||r.courier_code||null,
        service:r.courier_service_name||r.courier_service_code||null,
        price:r.price??null,
        duration:r.shipment_duration_range??null,
        unit:r.shipment_duration_unit??null
      })):[]
    });
  }catch(error){
    return res.status(200).json({networkError:error.message});
  }
};