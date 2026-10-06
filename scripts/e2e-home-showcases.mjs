// Browser test for the home "Baru" bento and "Promo terbatas" carousel: which products
// appear, the crossed-out price and saving, add to cart without opening the detail,
// sold-out buttons, the carousel arrows, hidden sections when empty, and no horizontal
// scroll on phone and desktop. Requires: npm install --no-save playwright
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root=fileURLToPath(new URL("..",import.meta.url));
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml"};
const server=createServer(async (req,res)=>{
  const path=new URL(req.url,"http://x").pathname;
  try{const body=await readFile(join(root,path==="/"?"index.html":path));res.writeHead(200,{"Content-Type":types[extname(path)]||"text/html"});res.end(body);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const mk=(i,name,price,orig,stock,isNew)=>({id:`00000000-0000-4000-8000-0000000000${String(i).padStart(2,"0")}`,name,brand:"Apple",category:"Smartphone",description:"x",
  specifications:{summary:`Spesifikasi ${i}`},price,original_price:orig,stock,image_url:`${origin}/icon-512.png`,is_active:true,is_new:isNew});
const catalog=[mk(1,"Baru Satu",16999000,null,4,true),mk(2,"Baru Dua",22749000,null,3,true),mk(3,"Baru Habis",10499000,null,0,true),mk(4,"Baru Keempat",9000000,null,2,true),
  mk(5,"Promo Kecil",8699000,8999000,5,false),mk(6,"Promo Besar",20499000,23499000,5,false),mk(7,"Promo Habis",3999000,4299000,0,false),mk(8,"Promo Empat",1299000,1499000,5,false),
  mk(9,"Harga Sama",5000000,5000000,5,false),mk(10,"Biasa",1000000,null,5,false)];
const errors=[];
const browser=await chromium.launch();

async function open(width,products){
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route(`${origin}/api/**`,route=>new URL(route.request().url()).pathname==="/api/products"?route.fulfill({json:{products}}):route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y"}}));
  await page.goto(origin);
  await page.waitForFunction(()=>document.querySelector("#productGrid .product-card"));
  return page;
}

for(const width of [1280,390]){
  const page=await open(width,catalog);
  // Baru: the first three ticked products, the first one as the lead tile.
  assert.equal(await page.locator("#newSection").isVisible(),true);
  assert.deepEqual(await page.locator("#newGrid .new-tile h3").allTextContents(),["Baru Satu","Baru Dua","Baru Habis"],"at most three new products");
  assert.equal(await page.locator("#newGrid").getAttribute("class"),"new-grid new-count-3");
  assert.equal(await page.locator("#newGrid .new-tile-lead h3").textContent(),"Baru Satu");
  assert.match(await page.locator("#newGrid .new-tile").first().innerText(),/BARU[\s\S]*Spesifikasi 1[\s\S]*Rp\s16\.999\.000/);
  const soldOut=page.locator("#newGrid .new-tile").nth(2).locator(".pill-button");
  assert.equal(await soldOut.isDisabled(),true); assert.equal(await soldOut.textContent(),"Stok habis");

  // Promo: only real discounts, biggest saving first, with the crossed-out price and saving.
  assert.equal(await page.locator("#promoSection").isVisible(),true);
  assert.deepEqual(await page.locator("#promoTrack .promo-card h3").allTextContents(),["Promo Besar","Promo Kecil","Promo Habis","Promo Empat"]);
  const first=await page.locator("#promoTrack .promo-card").first().innerText();
  assert.match(first,/SALE[\s\S]*Rp\s23\.499\.000[\s\S]*-Rp\s3\.000\.000[\s\S]*Rp\s20\.499\.000/);
  assert.doesNotMatch(await page.locator("#promoSection").innerText(),/\/bln|bulan|cicil/i,"no installment line: the store sells no instalments");
  assert.equal(await page.locator("#promoTrack .promo-card").nth(2).locator(".pill-button").isDisabled(),true);

  // Add to cart from both sections without opening the product detail.
  await page.locator("#newGrid .new-tile").first().locator(".pill-button").click();
  await page.locator("#promoTrack .promo-card").first().locator(".pill-button").click();
  await page.waitForFunction(()=>document.querySelector("#cartCount").textContent==="2");
  assert.equal(await page.locator("#productModal").isHidden(),true,"the button adds to cart, it does not open the detail");

  // Images stay inside their boxes; no horizontal page scroll.
  const boxes=await page.evaluate(()=>[...document.querySelectorAll(".promo-card")].map(card=>{const box=card.querySelector(".promo-image").getBoundingClientRect(),img=card.querySelector(".promo-image img").getBoundingClientRect();return img.height<=box.height+1;}));
  assert.ok(boxes.every(Boolean),"promo images fit their box");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"no horizontal scroll");

  if(width>900){
    assert.equal(await page.locator(".promo-arrow.prev").isDisabled(),true,"at the start only the next arrow works");
    assert.equal(await page.locator(".promo-arrow.next").isDisabled(),false);
    await page.locator(".promo-arrow.next").click();
    await page.waitForFunction(()=>!document.querySelector(".promo-arrow.prev").disabled);
    assert.ok(await page.locator("#promoTrack").evaluate(el=>el.scrollLeft)>0,"the next arrow scrolls the carousel");
  } else {
    assert.equal(await page.locator(".promo-arrow.next").isVisible(),false,"phones swipe instead of using arrows");
  }

  // Clicking the tile itself opens the product detail.
  await page.locator("#newGrid .new-tile").nth(1).locator("h3").click();
  await page.waitForSelector("#productModal:not(.hidden)");
  await page.close();
}

// Nothing ticked and no discounts: both sections stay hidden.
{
  const page=await open(390,[mk(10,"Biasa",1000000,null,5,false),mk(9,"Harga Sama",5000000,5000000,5,false)]);
  assert.equal(await page.locator("#newSection").isHidden(),true);
  assert.equal(await page.locator("#promoSection").isHidden(),true);
  await page.close();
}
// One or two ticked products use full-width tiles.
{
  const page=await open(1280,[mk(1,"Baru Satu",16999000,null,4,true),mk(2,"Baru Dua",22749000,null,3,true)]);
  assert.equal(await page.locator("#newGrid").getAttribute("class"),"new-grid new-count-2");
  await page.close();
}

assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Home showcases browser test passed.");
