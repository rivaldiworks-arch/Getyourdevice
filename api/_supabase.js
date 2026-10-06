"use strict";

function baseConfig() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not configured");
  return { url:url.replace(/\/$/, "") };
}

function anonConfig() {
  const { url } = baseConfig();
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) throw new Error("SUPABASE_ANON_KEY is not configured");
  return { url, key };
}

function adminConfig() {
  const { url } = baseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return { url, key };
}

async function requestWith(config, path, options = {}) {
  const { url, key } = config;
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers:{
      apikey:key,
      Authorization:`Bearer ${key}`,
      "Content-Type":"application/json",
      ...options.headers
    }
  });
}

async function supabase(path, options = {}) {
  return requestWith(anonConfig(), path, options);
}

async function supabaseAdmin(path, options = {}) {
  return requestWith(adminConfig(), path, options);
}

module.exports = { supabase, supabaseAdmin };
