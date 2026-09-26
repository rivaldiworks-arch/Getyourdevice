// Browser test for Midtrans Snap checkout: the storefront hands payment off to the
// Midtrans hosted page instead of rendering QR/VA itself. Covers checkout (no bank
// picker, "Bayar Sekarang" link), paying from "Pesanan Saya", and returning from Snap's
// finish redirect. Serves the static storefront, mocks /api/* and the Snap page.
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
  try{const body=await readFile(join(root,path==="/"?"index.html":path));res.writeHead(200,{"Content-Type":types[extname(path)]||"text/html"});res.end(body);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const shotDir=process.env.E2E_SCREENSHOT_DIR||null;

const MOUSE="00000000-0000-4000-8000-000000000007"; // Rp949.000
const SNAP_URL="https://app.sandbox.midtrans.com/snap/v4/redirection/11111111-2222-4333-8444-555555555555";
const CONFIG={paymentMethods:["Transfer Bank","QRIS","COD"],vaBanks:[{code:"bni",name:"BNI"},{code:"bri",name:"BRI"}],qrisMaxAmount:10000000,integration:"snap"};
const T=c=>c.repeat(64);
const errors=[];
const browser=await chromium.launch();

async function openPage({width,cart=[],access=[],orders={}}) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const calls={orders:[],payments:[],snapVisits:0};
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route("https://app.sandbox.midtrans.com/**",route=>{calls.snapVisits++;return route.fulfill({contentType:"text/html",body:"<title>Midtrans Snap</title><h1>Snap</h1>"});});
  await page.route("**/api/**",async route=>{
    const url=new URL(route.request().url());
    const body=route.request().postDataJSON?.()||{};
    if(url.pathname==="/api/config") return route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y",checkout:CONFIG}});
    if(url.pathname==="/api/shipping/quotes") return route.fulfill({json:{quotes:[{quoteId:"11111111-1111-4111-8111-111111111111",name:"Reguler",price:25000,etaMinDays:2,etaMaxDays:3,method:"regular",provider:"internal",serviceCode:"REG"},{quoteId:"33333333-3333-4333-8333-333333333333",name:"Ambil di Toko",price:0,etaMinDays:0,etaMaxDays:0,method:"pickup",provider:"internal",serviceCode:"PUP"}],liveRates:false}});
    if(url.pathname==="/api/orders"){
      calls.orders.push(body);
      return route.fulfill({status:201,json:{orderNumber:"GYD-20260926-0300",createdAt:new Date().toISOString(),subtotal:949000,shippingCost:25000,total:974000,orderAccessToken:T("a"),paymentToken:T("b"),reused:false}});
    }
    if(url.pathname==="/api/payments/create"){
      calls.payments.push(body);
      return route.fulfill({status:201,json:{paymentStatus:"unpaid",checkoutUrl:SNAP_URL,expiresAt:new Date(Date.now()+24*3600e3).toISOString(),message:"Halaman pembayaran Midtrans siap. Lanjutkan untuk memilih cara bayar."}});
    }
    if(url.pathname==="/api/orders/detail") return route.fulfill({json:orders[body.orderNumber]});
    return route.fulfill({status:503,json:{error:"offline"}});
  });
  await page.addInitScript(({cart,access})=>{
    localStorage.setItem("gyd_cart",JSON.stringify(cart));
    localStorage.setItem("gyd_order_access",JSON.stringify(access));
  },{cart,access});
  return {page,calls};
}

async function run(width) {
  // 1. Checkout: no bank picker, Transfer Bank order goes to the Snap page.
  {
    const {page,calls}=await openPage({width,cart:[{id:MOUSE,qty:1}]});
    await page.goto(`${origin}/#checkout`);
    await page.waitForSelector("#checkoutModal:not(.hidden)");
    await page.fill("#custName","Budi Santoso");
    await page.fill("#custPhone","081234567890");
    await page.fill("#custEmail","budi@example.com");
    await page.click("#checkoutNext");
    await page.fill("#custAddress","Jalan Merdeka No. 10");
    await page.fill("#custCity","Jakarta");
    await page.fill("#custPostal","10110");
    await page.click("#checkoutNext");
    await page.waitForSelector("input[name='shipping']");
    await page.click("#checkoutNext");
    await page.waitForSelector("[data-checkout-step='4']:not(.hidden)");
    assert.equal(await page.locator("#vaBankPicker").isHidden(),true,"Snap picks the bank, so the store does not");
    assert.equal(await page.locator("input[name='payment'][value='COD']").isDisabled(),true,"COD is not offered for courier delivery");
    assert.match(await page.locator("#codOptionNote").innerText(),/Ambil di Toko/);
    assert.equal(await page.locator("#qrisOptionLabel").innerText(),"QRIS / E-Wallet");
    assert.match(await page.locator("#vaOptionNote").innerText(),/halaman pembayaran Midtrans/);
    if(shotDir) await page.screenshot({path:`${shotDir}/snap-step4-${width}.png`});
    await page.click("#checkoutNext");
    const review=await page.locator("#finalReview").innerText();
    assert.match(review,/Transfer Bank \(Virtual Account\)/);
    assert.match(review,/halaman pembayaran Midtrans/);
    await page.check("#reviewConsent");
    await page.click("#checkoutSubmit");
    const link=page.locator("#successMessage a.payment-checkout-link");
    await link.waitFor();
    assert.equal(await link.innerText(),"Bayar Sekarang");
    assert.equal(await link.getAttribute("href"),SNAP_URL);
    assert.deepEqual(calls.payments[0],{orderNumber:"GYD-20260926-0300",paymentToken:T("b")},"no bank is sent on Snap");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,"no horizontal scroll");
    if(shotDir) await page.screenshot({path:`${shotDir}/snap-success-${width}.png`});
    await Promise.all([page.waitForURL(SNAP_URL),link.click()]);
    assert.equal(calls.snapVisits,1);
    await page.close();
  }
  // 1b. Choosing "Ambil di Toko" makes COD (cash on pickup) available.
  {
    const {page}=await openPage({width,cart:[{id:MOUSE,qty:1}]});
    await page.goto(`${origin}/#checkout`);
    await page.waitForSelector("#checkoutModal:not(.hidden)");
    await page.fill("#custName","Budi Santoso");
    await page.fill("#custPhone","081234567890");
    await page.fill("#custEmail","budi@example.com");
    await page.click("#checkoutNext");
    await page.fill("#custAddress","Jalan Merdeka No. 10");
    await page.fill("#custCity","Jakarta");
    await page.fill("#custPostal","10110");
    await page.click("#checkoutNext");
    await page.waitForSelector("input[name='shipping']");
    await page.click("input[name='shipping'][value='33333333-3333-4333-8333-333333333333']");
    await page.click("#checkoutNext");
    await page.waitForSelector("[data-checkout-step='4']:not(.hidden)");
    const cod=page.locator("input[name='payment'][value='COD']");
    assert.equal(await cod.isDisabled(),false,"COD is available for store pickup");
    await cod.check();
    assert.match(await page.locator("#codOptionNote").innerText(),/mengambil pesanan di toko/);
    await page.close();
  }
  // 2. Pesanan: "Bayar Sekarang" goes straight to Snap; returning from Snap's finish
  //    redirect (which appends a query to the hash) lands back on Pesanan.
  {
    const order={orderNumber:"GYD-20260926-0301",createdAt:new Date().toISOString(),status:"pending",paymentMethod:"QRIS",paymentStatus:"unpaid",
      paymentDeadline:new Date(Date.now()+20*3600e3).toISOString(),shippingServiceName:"Reguler",shippingCost:25000,subtotal:949000,total:974000,
      items:[{name:"Mouse",quantity:1,unitPrice:949000,subtotal:949000}]};
    const {page,calls}=await openPage({width,access:[{orderNumber:order.orderNumber,token:T("c"),paymentToken:T("d")}],orders:{[order.orderNumber]:order}});
    await page.goto(`${origin}/#pesanan?order_id=GYD-20260926-0301-abcdef012345&status_code=201&transaction_status=pending`);
    const button=page.locator("[data-pay-order]");
    await button.waitFor();
    assert.equal(await page.locator("#customerOrdersView").isVisible(),true,"the Snap finish URL opens Pesanan");
    assert.equal(await button.innerText(),"Bayar Sekarang");
    await Promise.all([page.waitForURL(SNAP_URL),button.click()]);
    assert.deepEqual(calls.payments,[{orderNumber:order.orderNumber,paymentToken:T("d")}]);
    await page.close();
  }
}

await run(1280);
await run(390);
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Midtrans Snap checkout browser test passed.");
