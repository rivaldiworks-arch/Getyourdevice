"use strict";
const { createQrisCharge } = require("./payments/_midtrans");

module.exports=async function handler(req,res) {
  if(process.env.VERCEL_ENV!=="production" || String(process.env.MIDTRANS_ENV||"").toLowerCase()!=="sandbox") {
    return res.status(404).json({error:"Not found"});
  }
  if(req.method!=="GET") return res.status(405).setHeader("Allow","GET").json({error:"Method not allowed"});
  try{
    const data=await createQrisCharge({orderId:`GYD-DIAG-${Date.now()}`,amount:1000});
    const actions=Array.isArray(data?.actions)?data.actions:[];
    return res.status(200).json({
      keys:Object.keys(data||{}).sort(),
      statusCode:data?.status_code??null,
      responseCode:data?.responseCode??null,
      transactionStatus:data?.transaction_status??null,
      transactionStatusCamel:data?.transactionStatus??null,
      latestTransactionStatus:data?.latestTransactionStatus??null,
      latestTransactionStatusSnake:data?.latest_transaction_status??null,
      paymentType:data?.payment_type??null,
      hasTransactionId:Boolean(data?.transaction_id),
      hasReferenceNo:Boolean(data?.referenceNo),
      hasPartnerReferenceNo:Boolean(data?.partnerReferenceNo),
      actionNames:actions.map(a=>a?.name).filter(Boolean),
      hasActionUrl:actions.some(a=>Boolean(a?.url)),
      hasQrString:Boolean(data?.qr_string),
      hasQrUrl:Boolean(data?.qrUrl||data?.qr_url),
      hasQrImage:Boolean(data?.qrImage),
      hasQrContent:Boolean(data?.qrContent||data?.qr_content),
      statusMessage:data?.status_message??data?.responseMessage??null
    });
  }catch(error){
    return res.status(500).json({
      error:error.message,
      httpStatus:error.status||null,
      midtransStatusCode:error.midtrans?.status_code??null,
      midtransResponseCode:error.midtrans?.responseCode??null,
      midtransMessage:error.midtrans?.status_message??error.midtrans?.responseMessage??null,
      midtransKeys:Object.keys(error.midtrans||{}).sort()
    });
  }
};
