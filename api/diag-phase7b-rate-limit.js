"use strict";
const { supabaseAdmin } = require("./_supabase");

module.exports=async function handler(req,res){
  if(process.env.VERCEL_ENV==="production") return res.status(404).json({error:"Not found"});
  try{
    const response=await supabaseAdmin("rpc/consume_api_rate_limit",{
      method:"POST",
      body:JSON.stringify({
        p_bucket:"smoke:phase7b",
        p_key_hash:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        p_limit:5,
        p_window_seconds:60
      })
    });
    const data=await response.json().catch(()=>null);
    return res.status(response.ok?200:500).json({ok:response.ok,result:data});
  }catch(error){
    return res.status(500).json({ok:false,error:error.message});
  }
};