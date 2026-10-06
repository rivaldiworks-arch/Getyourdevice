"use strict";

const { supabaseAdmin } = require("./_supabase");

async function requireAdmin(req) {
  const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) {
    const error=new Error("ADMIN_AUTH_REQUIRED");
    error.status=401;
    throw error;
  }
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const anonKey=process.env.SUPABASE_ANON_KEY;
  if(!url||!anonKey) throw new Error("SUPABASE_AUTH_NOT_CONFIGURED");

  const userResponse=await fetch(`${url}/auth/v1/user`,{
    headers:{apikey:anonKey,Authorization:`Bearer ${token}`}
  });
  const user=await userResponse.json().catch(()=>null);
  if(!userResponse.ok||!user?.id) {
    const error=new Error("ADMIN_AUTH_INVALID");
    error.status=401;
    throw error;
  }

  const profileResponse=await supabaseAdmin(`admin_profiles?select=id,role&id=eq.${encodeURIComponent(user.id)}&limit=1`);
  const profiles=await profileResponse.json().catch(()=>[]);
  if(!profileResponse.ok||profiles?.[0]?.role!=="admin") {
    const error=new Error("ADMIN_FORBIDDEN");
    error.status=403;
    throw error;
  }
  return {id:user.id,email:user.email||null};
}

module.exports={requireAdmin};
