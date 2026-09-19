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
      ok:response.ok,
      keys:Object.keys(data||{}).sort(),
      success:data?.success??null,
      code:data?.code??data?.error?.code??null,
      message:data?.message??data?.error?.message??data?.error??null,
      object:data?.object??null,
      pricingCount:Array.isArray(data?.pricing)?data.pricing.length:null
    });
  }catch(error){
    return res.status(200).json({networkError:error.message});
  }
};