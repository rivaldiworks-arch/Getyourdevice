"use strict";
const { supabase } = require("./_supabase");

// Share page (/p/<id>, rewritten here as ?share=<id>). WhatsApp, Facebook, X and Telegram
// read Open Graph tags from the HTML without running JavaScript, and they drop the #fragment
// the storefront routes on, so a product link needs its own server-rendered page. Crawlers
// get the product name, price, description and cover photo; people are sent on to the
// product in the storefront by script.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHAPE_SIZE={square:[1200,1200],landscape:[1600,1200]};
function escapeHTML(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);}
function rupiah(value){return `Rp ${Math.round(Number(value)||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g,".")}`;}
function siteOrigin(req){
  const host=String(req.headers["x-forwarded-host"]||req.headers.host||"").split(",")[0].trim();
  if(/^[a-z0-9.-]+(:\d+)?$/i.test(host))return `${/^(localhost|127\.)/.test(host)?"http":"https"}://${host}`;
  return String(process.env.SITE_URL||"https://www.getyourdevice.id").replace(/\/$/,"");
}
function shareImage(product,origin){
  const photos=(Array.isArray(product.images)?product.images:[]).filter(item=>/^https:\/\//i.test(item?.url||""));
  if(photos.length)return {url:photos[0].url,size:SHAPE_SIZE[photos[0].shape]||SHAPE_SIZE.square};
  if(/^https:\/\//i.test(product.image_url||""))return {url:product.image_url,size:null};
  return {url:`${origin}/icon-512.png`,size:[512,512]};
}
function sharePage(product,origin){
  const url=`${origin}/p/${product.id}`,target=`/#produk/${product.id}`,image=shareImage(product,origin);
  const title=`${product.name} · ${rupiah(product.price)}`;
  const summary=String(product.description||"").replace(/\s+/g," ").trim();
  const description=(summary.length>180?`${summary.slice(0,177).trimEnd()}…`:summary)||`Beli ${product.name} di getyourdevice. Pembayaran aman, pengiriman ke seluruh Indonesia.`;
  const meta=[
    ["property","og:type","product"],["property","og:site_name","getyourdevice"],["property","og:locale","id_ID"],
    ["property","og:url",url],["property","og:title",title],["property","og:description",description],
    ["property","og:image",image.url],["property","og:image:secure_url",image.url],["property","og:image:alt",product.name],
    ...(image.size?[["property","og:image:width",String(image.size[0])],["property","og:image:height",String(image.size[1])]]:[]),
    ["property","product:price:amount",String(Math.round(Number(product.price)||0))],["property","product:price:currency","IDR"],
    ["name","twitter:card","summary_large_image"],["name","twitter:title",title],["name","twitter:description",description],["name","twitter:image",image.url],
    ["name","description",description]
  ].map(([attr,key,value])=>`<meta ${attr}="${key}" content="${escapeHTML(value)}">`).join("\n");
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)} | getyourdevice</title>
<link rel="canonical" href="${escapeHTML(url)}">
${meta}
<link rel="icon" href="/favicon.ico" sizes="any">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body style="font-family:system-ui,sans-serif;padding:24px"><p><a href="${escapeHTML(target)}">Lihat ${escapeHTML(product.name)} di getyourdevice</a></p></body></html>`;
}

async function share(req,res,id){
  const origin=siteOrigin(req);
  if(!UUID.test(String(id)))return res.status(302).setHeader("Location","/").end();
  const response=await supabase(`products?select=id,name,description,price,image_url,images&id=eq.${encodeURIComponent(id)}&is_active=eq.true&limit=1`);
  const [product]=response.ok?await response.json():[];
  if(!product)return res.status(302).setHeader("Location","/").end();
  res.setHeader("Content-Type","text/html; charset=utf-8");
  // Crawlers re-read the page at most every few minutes; a price change shows within 10 minutes.
  res.setHeader("Cache-Control","public, max-age=0, s-maxage=600, stale-while-revalidate=86400");
  return res.status(200).send(sharePage(product,origin));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).setHeader("Allow", "GET").json({ error:"Method not allowed" });
  if (req.query?.share !== undefined) {
    try { return await share(req,res,req.query.share); }
    catch(error) { console.error(error); return res.status(302).setHeader("Location",`/#produk/${UUID.test(String(req.query.share))?req.query.share:""}`).end(); }
  }
  try {
    const fields="id,name,brand,category,description,specifications,price,original_price,stock,image_url,images,rating,is_active,warranty,is_new";
    const response=await supabase(`products?select=${fields}&is_active=eq.true&order=name.asc`);
    const data=await response.json();
    if(!response.ok) throw new Error(data.message || "Supabase product query failed");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ products:data });
  } catch(error) { console.error(error); return res.status(503).json({ error:"Katalog produk belum dapat dimuat." }); }
};

module.exports.sharePage = sharePage;
