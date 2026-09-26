"use strict";
const { checkoutPaymentMethods } = require("./_checkout");
const { VA_BANKS, enabledVaBanks, QRIS_MAX_AMOUNT } = require("./payments/_midtrans");

module.exports = function handler(req, res) {
  if (req.method !== "GET") return res.status(405).setHeader("Allow", "GET").json({ error:"Method not allowed" });
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(503).json({ error:"Supabase belum dikonfigurasi." });
  res.setHeader("Cache-Control", "public, max-age=300");
  // Public, non-secret checkout configuration so the storefront only offers what works.
  let checkout=null;
  try {
    checkout={
      paymentMethods:checkoutPaymentMethods(),
      vaBanks:enabledVaBanks().map(code=>({code,name:VA_BANKS[code]})),
      qrisMaxAmount:QRIS_MAX_AMOUNT
    };
  } catch(error) {
    console.error("Checkout configuration invalid",{message:error.message});
  }
  return res.status(200).json({ supabaseUrl:url.replace(/\/$/, ""), supabaseAnonKey:anonKey, checkout });
};
