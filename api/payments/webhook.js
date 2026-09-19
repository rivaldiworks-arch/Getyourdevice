"use strict";
const { providerFor } = require("./_provider");

module.exports=async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});
  const providerName=String(req.headers?.["x-payment-provider"]||"").toLowerCase();
  const provider=providerFor(providerName);
  // No gateway is installed in Phase 5. Never perform a database write before an
  // adapter verifies the raw request body and provider-specific signature.
  if(!provider||providerName==="manual") return res.status(400).json({error:"Unsupported payment provider"});
  const verification=await provider.verifyWebhook({headers:req.headers,rawBody:req.rawBody});
  if(!verification.verified) return res.status(401).json({error:"Invalid webhook signature"});
  return res.status(501).json({error:"Webhook processing is not configured"});
};
