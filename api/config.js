"use strict";

module.exports = function handler(req, res) {
  if (req.method !== "GET") return res.status(405).setHeader("Allow", "GET").json({ error:"Method not allowed" });
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(503).json({ error:"Supabase belum dikonfigurasi." });
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.status(200).json({ supabaseUrl:url.replace(/\/$/, ""), supabaseAnonKey:anonKey });
};
