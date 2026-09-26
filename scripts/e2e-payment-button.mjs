// Browser test for the "Pesanan Saya" QRIS button. Serves the static storefront,
// mocks /api/*, and drives Chromium at desktop and phone widths.
// Requires the playwright package: npm install --no-save playwright
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
const types={".html":"text/html",".js":"text/javascript",".css":"text/css"};
const server=createServer(async (req,res)=>{
  const path=new URL(req.url,"http://x").pathname;
  try{const body=await readFile(join(root,path==="/"?"index.html":path));res.writeHead(200,{"Content-Type":types[extname(path)]||"text/html"});res.end(body);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const now=Date.now();
const orderBase={createdAt:new Date(now-3600e3).toISOString(),status:"pending",paymentMethod:"QRIS",shippingServiceName:"JNE REG",shippingCost:20000,subtotal:130000,total:150000,items:[{name:"Galaxy A55",quantity:1,unitPrice:130000,subtotal:130000}]};
const state={
  "GYD-20260925-0001":{...orderBase,orderNumber:"GYD-20260925-0001",paymentStatus:"pending",paymentDeadline:new Date(now+20*3600e3).toISOString()},
  "GYD-20260925-0002":{...orderBase,orderNumber:"GYD-20260925-0002",paymentStatus:"unpaid",paymentDeadline:new Date(now-60e3).toISOString()},
  "GYD-20260925-0003":{...orderBase,orderNumber:"GYD-20260925-0003",paymentStatus:"unpaid",paymentDeadline:new Date(now+20*3600e3).toISOString()},
  "GYD-20260925-0004":{...orderBase,orderNumber:"GYD-20260925-0004",paymentMethod:"COD",paymentStatus:"unpaid",paymentDeadline:null}
};
let qrCount=0, createCalls=[], errors=[];
const browser=await chromium.launch();
async function run(width){
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on("pageerror",e=>errors.push(e.message));
  // Block third-party requests (product images) so the test is hermetic.
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route("**/api/**",async route=>{
    const url=new URL(route.request().url()); const body=route.request().postDataJSON?.()||{};
    if(url.pathname==="/api/orders/detail") return route.fulfill({json:state[body.orderNumber]});
    if(url.pathname==="/api/payments/create"){
      createCalls.push(body.orderNumber);
      qrCount++;
      return route.fulfill({status:200,json:{paymentStatus:"pending",paymentMethod:"QRIS",paymentUrl:`data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><text y='9'>${qrCount}</text></svg>`,expiresAt:new Date(Date.now()+30*60e3).toISOString(),reused:false}});
    }
    return route.fulfill({status:503,json:{error:"offline"}});
  });
  await page.addInitScript(()=>{const T=c=>c.repeat(64);localStorage.setItem("gyd_order_access",JSON.stringify([
    {orderNumber:"GYD-20260925-0001",token:T("a"),paymentToken:T("b")},
    {orderNumber:"GYD-20260925-0002",token:T("c"),paymentToken:T("d")},
    {orderNumber:"GYD-20260925-0003",token:T("e")},
    {orderNumber:"GYD-20260925-0004",token:T("f")}]));});
  await page.goto(`${origin}/#pesanan`);
  await page.waitForSelector(".customer-order-card");
  await page.clock.install({time:Date.now()});
  const card=n=>page.locator(".customer-order-card",{hasText:n});
  assert.equal(await card("0001").locator("[data-pay-order]").innerText(),"Tampilkan QRIS");
  assert.match(await card("0001").innerText(),/Menunggu pembayaran/);
  assert.match(await card("0002").innerText(),/Batas waktu pembayaran sudah lewat/);
  assert.equal(await card("0002").locator("[data-pay-order]").count(),0);
  assert.match(await card("0003").innerText(),/hanya dapat dilanjutkan dari browser/);
  assert.equal(await card("0004").locator("[data-pay-order], .payment-note").count(),0,"COD has no payment action");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  assert.equal(overflow,false,"no horizontal scroll");

  // open QR
  await card("0001").locator("[data-pay-order]").click();
  await page.waitForSelector("#paymentContent .payment-qr img");
  assert.match(await page.locator("#paymentContent").innerText(),/Rp\s?150\.000/);
  // The QR expiry comes from the mocked API (Node clock) while the page runs on the
  // installed fake clock, so the first reading can be 30:00 or 29:59. Assert the value
  // range, then that the countdown moves with the page clock.
  const toSeconds=text=>{const [m,sec]=text.split(":").map(Number);return m*60+sec;};
  const startSeconds=toSeconds(await page.locator("#paymentCountdown").innerText());
  assert.ok(startSeconds<=1800&&startSeconds>=1795,`countdown starts near 30:00 (got ${startSeconds}s)`);
  await page.clock.runFor(5000);
  const elapsed=startSeconds-toSeconds(await page.locator("#paymentCountdown").innerText());
  assert.ok(elapsed>=4&&elapsed<=6,`countdown follows the clock (moved ${elapsed}s in 5s)`);
  // manual check, still pending
  await page.getByRole("button",{name:"Saya Sudah Bayar, Cek Status"}).click();
  await page.waitForFunction(()=>/belum terdeteksi/.test(document.querySelector("#paymentPollNote")?.textContent||""));
  // pays → auto poll picks it up
  state["GYD-20260925-0001"].paymentStatus="paid";
  await page.clock.runFor(8000);
  await page.waitForSelector("#paymentContent .payment-state.paid");
  await page.waitForFunction(()=>/Lunas/.test(document.querySelector("#customerOrderList").textContent));
  assert.equal(await card("0001").locator("[data-pay-order]").count(),0,"paid order has no pay button");
  await page.getByRole("button",{name:"Tutup",exact:true}).click();
  assert.equal(await page.locator("#paymentModal").isHidden(),true);
  state["GYD-20260925-0001"].paymentStatus="pending";

  // expiry → renew
  await page.reload(); await page.waitForSelector(".customer-order-card"); await page.clock.install({time:Date.now()});
  const before=qrCount;
  await card("0001").locator("[data-pay-order]").click();
  await page.waitForSelector("#paymentContent .payment-qr img");
  await page.clock.runFor(30*60e3+1000);
  await page.waitForSelector("text=QR sudah kedaluwarsa");
  await page.getByRole("button",{name:"Buat QR Baru"}).click();
  await page.waitForSelector("#paymentContent .payment-qr img");
  assert.equal(qrCount,before+2,"renew requests a new QR");
  // Escape closes and stops polling
  const detailCountBefore=createCalls.length;
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#paymentModal").isHidden(),true);
  assert.equal(await page.evaluate(()=>location.hash),"#pesanan","escape must not navigate away");
  await page.clock.runFor(60e3);
  assert.equal(createCalls.length,detailCountBefore);
  await page.close();
}
await run(1280); await run(390);
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Pesanan QRIS payment button browser test passed.");
