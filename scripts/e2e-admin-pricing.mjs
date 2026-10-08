// Browser test for the admin price calculator (#harga): the minimum price covers the
// target profit after the most expensive filled-in payment method, including PPN on the fee
// and the fee Midtrans takes on shipping; only QRIS is prefilled, fee rates persist in the
// browser, and a planned price below the minimum is flagged.
// Requires the playwright package: npm install --no-save playwright
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root=fileURLToPath(new URL("..",import.meta.url));
const types={".html":"text/html",".js":"text/javascript",".css":"text/css"};
const server=createServer(async (req,res)=>{
  const path=new URL(req.url,"http://x").pathname;
  try{const body=await readFile(join(root,path==="/"?"admin.html":path));res.writeHead(200,{"Content-Type":types[extname(path)]||"text/html"});res.end(body);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const DB="https://db.test";
const errors=[];
const browser=await chromium.launch();
const rupiah=value=>Number(String(value).replace(/[^\d]/g,""));

for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const page=await context.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(url=>!url.href.startsWith(origin)&&!url.href.startsWith(DB),route=>route.abort());
  await page.route(`${origin}/api/config`,route=>route.fulfill({json:{supabaseUrl:DB,supabaseAnonKey:"anon"}}));
  await page.route(`${DB}/**`,route=>{
    const table=new URL(route.request().url()).pathname.replace(/^\/(rest|auth)\/v1\//,"");
    if(table.startsWith("token")) return route.fulfill({json:{access_token:"tok",refresh_token:"ref",expires_in:3600,user:{id:"admin-1",email:"admin@example.com"}}});
    if(table==="admin_profiles") return route.fulfill({json:[{id:"admin-1",full_name:"Admin",role:"admin"}]});
    return route.fulfill({json:[]});
  });
  await page.addInitScript(()=>localStorage.setItem("gyd_admin_session",JSON.stringify({refresh_token:"ref"})));
  await page.goto(`${origin}/admin.html#harga`);
  await page.waitForSelector("#pricingPanel:not(.hidden) .fee-row input");
  assert.equal(await page.locator('[data-tab="pricing"]').getAttribute("class"),"active","Harga tab is active");

  // Only QRIS comes prefilled (documented 0.7%); the rest wait for the contract rates.
  assert.equal(await page.locator('[data-fee="qris:percent"]').inputValue(),"0,7");
  assert.equal(await page.locator('[data-fee="card:percent"]').inputValue(),"");
  assert.match(await page.locator("#pricingResult").innerText(),/Isi harga modal/);

  // Cost 10.000.000 + profit 500.000; QRIS 0.7% and a card rate of 3% + Rp2.000, PPN 11% on fees.
  assert.equal(await page.locator("#feeTax").inputValue(),"11","PPN on fees defaults to 11%");
  await page.fill("#priceCost","10000000");
  await page.fill("#priceProfit","500000");
  await page.fill('[data-fee="card:percent"]',"3");
  await page.fill('[data-fee="card:flat"]',"2000");
  const minimum=Math.ceil(((10500000+2000*1.11)/(1-0.03*1.11))/1000)*1000;
  const summary=await page.locator(".pricing-summary").innerText();
  assert.equal(rupiah(summary.split("\n")[1]),minimum,"minimum price covers the card fee");
  assert.match(summary,/Termahal: Kartu kredit\/debit/);
  const rows=await page.locator(".pricing-table tbody tr").allInnerTexts();
  assert.match(rows[0],/^QRIS/,"cheapest method listed first");
  assert.ok(rows.every(row=>rupiah(row.split("\t").pop())>=500000),"every filled method keeps the target profit");
  assert.match(await page.locator("#pricingResult").innerText(),/5 metode belum diisi/);

  // Shipping is billed through Midtrans too, so its fee comes out of the profit and raises the minimum.
  await page.fill("#priceShipping","200000");
  const withShipping=Math.ceil(((10500000+(200000*0.03+2000)*1.11)/(1-0.03*1.11))/1000)*1000;
  assert.equal(rupiah((await page.locator(".pricing-summary").innerText()).split("\n")[1]),withShipping,"minimum covers the fee on shipping");
  assert.ok((await page.locator(".pricing-table tbody tr").allInnerTexts()).every(row=>rupiah(row.split("\t").pop())>=500000),"profit holds with shipping");
  await page.fill("#priceShipping","");

  // A planned price below the minimum is flagged.
  await page.fill("#pricePlanned","10600000");
  assert.match(await page.locator(".pricing-summary").innerText(),/Kurang/);
  assert.ok(await page.locator(".pricing-table .is-short").count()>0,"short profit is highlighted");

  // Rates survive a reload in this browser.
  await page.reload();
  await page.waitForSelector("#pricingPanel:not(.hidden) .fee-row input");
  assert.equal(await page.locator('[data-fee="card:percent"]').inputValue(),"3");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no sideways scroll at ${width}px`);

  // The other tabs still switch.
  await page.locator('[data-tab="orders"]').click();
  await page.waitForSelector("#ordersPanel:not(.hidden)");
  assert.equal(await page.locator("#pricingPanel").isHidden(),true);
  await context.close();
}

assert.deepEqual(errors,[],"no page errors");
await browser.close();
server.close();
console.log("Admin price calculator browser test passed.");
