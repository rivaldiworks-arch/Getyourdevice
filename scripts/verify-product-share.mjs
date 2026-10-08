// Product share page (/p/<id> -> /api/products?share=<id>): crawlers get Open Graph tags with
// the product photo, name and price; people are redirected to the storefront route; unknown or
// invalid ids go home; values are escaped. Runs the handler against a mocked Supabase.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require=createRequire(import.meta.url);
process.env.SUPABASE_URL="https://db.test";process.env.SUPABASE_ANON_KEY="anon";
const id="11111111-2222-4333-8444-555555555555";
const product={id,name:'iPhone Air 256 GB <b>"x"</b>',description:"Baris satu.\n\nBaris dua "+"panjang ".repeat(40),price:19999000,image_url:"https://img.test/cover.jpg",images:[{url:"http://insecure.test/a.jpg",shape:"square"},{url:"https://img.test/wide.jpg",shape:"landscape"}]};
const queries=[];
globalThis.fetch=async url=>{queries.push(String(url));return {ok:true,json:async()=>String(url).includes(`id=eq.${id}`)?[product]:[]};};
const handler=require("../api/products.js");
async function call(share,host="www.getyourdevice.id"){
  const res={statusCode:0,headers:{},body:"",status(code){this.statusCode=code;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this;},send(body){this.body=body;return this;},end(){return this;},json(body){this.body=body;return this;}};
  await handler({method:"GET",query:{share},headers:{host}},res);
  return res;
}
const og=(html,key)=>(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)||[])[1];

const page=await call(id);
assert.equal(page.statusCode,200);
assert.match(page.headers["content-type"],/text\/html/);
assert.match(page.headers["cache-control"],/s-maxage=600/);
assert.equal(og(page.body,"og:url"),`https://www.getyourdevice.id/p/${id}`);
assert.equal(og(page.body,"og:title"),"iPhone Air 256 GB &lt;b&gt;&quot;x&quot;&lt;/b&gt; · Rp 19.999.000","title carries the price and is escaped");
assert.equal(og(page.body,"og:image"),"https://img.test/wide.jpg","first https gallery photo is the share image");
assert.equal(og(page.body,"og:image:width"),"1600");assert.equal(og(page.body,"og:image:height"),"1200");
assert.equal(og(page.body,"twitter:card"),"summary_large_image");
assert.equal(og(page.body,"product:price:amount"),"19999000");
const description=og(page.body,"og:description");
assert.ok(description.startsWith("Baris satu. Baris dua"),"description is flattened to one line");
assert.ok(description.length<=180&&description.endsWith("…"),"long descriptions are trimmed");
assert.ok(!page.body.includes("<b>"),"no raw HTML from product data");
assert.ok(page.body.includes(`location.replace("/#produk/${id}")`),"people are sent to the storefront product");
assert.ok(!/http-equiv="refresh"/i.test(page.body),"no meta refresh: crawlers must stay on this page");
assert.ok(queries.some(url=>url.includes("is_active=eq.true")),"inactive products are not shared");

for(const bad of ["not-a-uuid","../../etc","22222222-2222-4222-8222-222222222222"]){
  const res=await call(bad);
  assert.equal(res.statusCode,302,`invalid or unknown id redirects: ${bad}`);
  assert.equal(res.headers.location,"/");
}
assert.ok(!queries.some(url=>url.includes("not-a-uuid")||url.includes("etc")),"invalid ids never reach the database");
assert.equal(og((await call(id,"evil.test/<x>")).body,"og:url"),`https://www.getyourdevice.id/p/${id}`,"a bad Host header falls back to the site URL");

// No gallery and no cover: the store icon stands in.
product.images=[];product.image_url="";
assert.equal(og((await call(id)).body,"og:image"),"https://www.getyourdevice.id/icon-512.png");

const vercel=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url)));
assert.ok(vercel.rewrites.some(rule=>rule.source==="/p/:id"&&rule.destination==="/api/products?share=:id"),"/p/:id is routed to the share page");
const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");
for(const key of ["og:title","og:description","og:image","og:url"])assert.match(index,new RegExp(`property="${key}" content="https://|property="${key}" content="[^"]+"`),`homepage has ${key}`);
console.log("Product share page checks passed.");
