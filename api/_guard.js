"use strict";
const { randomUUID } = require("node:crypto");
const { supabaseAdmin } = require("./_supabase");
const { isServerConfigError, serverHmac } = require("./_secrets");

function noStore(res){
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("Pragma","no-cache");
}
function ensureRequestId(res){
  const existing=String(res.getHeader?.("X-Request-ID")||"");
  if(existing)return existing;
  const id=randomUUID();
  res.setHeader("X-Request-ID",id);
  return id;
}
function rawClientAddress(req){
  const preferred=req.headers["x-vercel-forwarded-for"];
  const forwarded=preferred||req.headers["x-forwarded-for"]||"";
  const first=Array.isArray(forwarded)?forwarded[0]:String(forwarded).split(",")[0];
  return String(first||req.socket?.remoteAddress||"unknown").trim().slice(0,128);
}
function clientKeyHash(req){
  return serverHmac("rate-limit",rawClientAddress(req));
}
function bodyBytes(req){
  if(req.body==null)return 0;
  if(Buffer.isBuffer(req.body))return req.body.length;
  if(typeof req.body==="string")return Buffer.byteLength(req.body);
  try{return Buffer.byteLength(JSON.stringify(req.body));}catch{return Number.MAX_SAFE_INTEGER;}
}
async function consumeRateLimit(req,{bucket,limit,windowSeconds}){
  const response=await supabaseAdmin("rpc/consume_api_rate_limit",{
    method:"POST",
    body:JSON.stringify({
      p_bucket:bucket,
      p_key_hash:clientKeyHash(req),
      p_limit:limit,
      p_window_seconds:windowSeconds
    })
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.message||data?.error||`Rate limit RPC failed (${response.status})`);
  return data||{};
}
async function guardPublicJson(req,res,{bucket,limit,windowSeconds,maxBytes}){
  const requestId=ensureRequestId(res);
  noStore(res);

  const contentType=String(req.headers["content-type"]||"").toLowerCase();
  if(!contentType.startsWith("application/json")){
    res.status(415).json({error:"Content-Type harus application/json."});
    return {ok:false,requestId};
  }

  const declared=Number(req.headers["content-length"]||0);
  if((Number.isFinite(declared)&&declared>maxBytes)||bodyBytes(req)>maxBytes){
    res.status(413).json({error:"Ukuran permintaan terlalu besar."});
    return {ok:false,requestId};
  }

  try{
    const rate=await consumeRateLimit(req,{bucket,limit,windowSeconds});
    if(rate.limit!=null)res.setHeader("X-RateLimit-Limit",String(rate.limit));
    if(rate.remaining!=null)res.setHeader("X-RateLimit-Remaining",String(rate.remaining));
    if(rate.allowed===false){
      const retry=Math.max(1,Number(rate.retryAfter)||1);
      res.setHeader("Retry-After",String(retry));
      res.status(429).json({error:"Terlalu banyak permintaan. Coba lagi beberapa saat lagi."});
      return {ok:false,requestId};
    }
  }catch(error){
    // A missing or invalid HMAC secret is a deployment error, not an outage: fail
    // closed so protection is never silently disabled.
    if(isServerConfigError(error)){
      console.error("Rate limit misconfigured",{requestId,bucket,message:error.message});
      res.status(503).json({error:"Layanan sedang dalam pemeliharaan. Silakan coba beberapa saat lagi."});
      return {ok:false,requestId};
    }
    // Fail open: checkout should not become unavailable merely because the limiter
    // storage is temporarily unreachable. The endpoint's normal backend calls still
    // provide authoritative validation.
    console.warn("Rate limit check unavailable",{requestId,bucket,message:error.message});
  }

  return {ok:true,requestId};
}

module.exports={guardPublicJson,noStore};
