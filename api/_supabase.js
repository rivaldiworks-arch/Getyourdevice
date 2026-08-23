"use strict";

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not configured");
  return { url:url.replace(/\/$/, ""), key };
}

async function supabase(path, options = {}) {
  const { url, key } = config();
  return fetch(`${url}/rest/v1/${path}`, { ...options, headers:{ apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json", ...options.headers } });
}

module.exports = { supabase };
