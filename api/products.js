"use strict";
const { supabase } = require("./_supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).setHeader("Allow", "GET").json({ error:"Method not allowed" });
  try {
    const fields="id,name,brand,category,description,specifications,price,original_price,stock,image_url,rating,is_active";
    const response=await supabase(`products?select=${fields}&is_active=eq.true&order=name.asc`);
    const data=await response.json();
    if(!response.ok) throw new Error(data.message || "Supabase product query failed");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ products:data });
  } catch(error) { console.error(error); return res.status(503).json({ error:"Katalog produk belum dapat dimuat." }); }
};
