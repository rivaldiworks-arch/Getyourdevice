// Browser test for Transfer Bank via Midtrans Virtual Account: the full checkout from
// cart to VA instructions, payment-method availability (config + the QRIS Rp10.000.000
// cap), and paying a Transfer Bank order from "Pesanan Saya". Serves the static
// storefront, mocks /api/*, and drives Chromium at desktop and phone widths.
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

const IPHONE="00000000-0000-4000-8000-000000000008"; // Rp12.999.000
const MOUSE="00000000-0000-4000-8000-000000000007";  // Rp949.000
const BANKS=[{code:"bni",name:"BNI"},{code:"bri",name:"BRI"},{code:"mandiri",name:"Mandiri"},{code:"permata",name:"Permata"},{code:"cimb",name:"CIMB Niaga"}];
const T=c=>c.repeat(64);
const errors=[];
const browser=await chromium.launch();

function vaFor(bank) {
  const expiresAt=new Date(Date.now()+24*3600e3).toISOString();
  if(bank==="mandiri") return {paymentStatus:"pending",paymentMethod:"Transfer Bank",vaBank:"mandiri",vaNumber:"70012345678",billerCode:"70012",expiresAt,message:"Nomor Virtual Account siap digunakan."};
  return {paymentStatus:"pending",paymentMethod:"Transfer Bank",vaBank:bank,vaNumber:`8808${bank.length}123456789`,expiresAt,message:"Nomor Virtual Account siap digunakan."};
}

async function openPage({width,config,cart=[],access=[],orders={}}) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const calls={orders:[],payments:[]};
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route("**/api/**",async route=>{
    const url=new URL(route.request().url());
    const body=route.request().postDataJSON?.()||{};
    if(url.pathname==="/api/config") return route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y",checkout:config}});
    if(url.pathname==="/api/shipping/quotes") return route.fulfill({json:{quotes:[{quoteId:"11111111-1111-4111-8111-111111111111",name:"Reguler",price:25000,etaMinDays:2,etaMaxDays:3,method:"regular",provider:"internal",serviceCode:"REG"}],liveRates:false}});
    if(url.pathname==="/api/orders"){
      calls.orders.push(body);
      const subtotal=body.items.reduce((sum,item)=>sum+(item.productId===IPHONE?12999000:949000)*item.quantity,0);
      return route.fulfill({status:201,json:{orderNumber:"GYD-20260926-0100",createdAt:new Date().toISOString(),subtotal,shippingCost:25000,total:subtotal+25000,orderAccessToken:T("a"),paymentToken:T("b"),reused:false}});
    }
    if(url.pathname==="/api/payments/create"){
      calls.payments.push(body);
      if(!body.bank) return route.fulfill({status:400,json:{error:"Pilih bank untuk mendapatkan nomor Virtual Account.",code:"BANK_REQUIRED"}});
      return route.fulfill({status:201,json:vaFor(body.bank)});
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

async function goToPaymentStep(page) {
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
}

async function run(width) {
  // 1. Full checkout: QRIS hidden by config, Transfer Bank default, Mandiri Bill Payment.
  {
    const {page,calls}=await openPage({width,config:{paymentMethods:["Transfer Bank","COD"],vaBanks:BANKS,qrisMaxAmount:10000000},cart:[{id:IPHONE,qty:1}]});
    await goToPaymentStep(page);
    assert.equal(await page.locator("[data-payment-option='QRIS']").isHidden(),true,"QRIS hidden when the store disables it");
    assert.equal(await page.locator("input[name='payment'][value='Transfer Bank']").isChecked(),true,"Transfer Bank is the default");
    assert.equal(await page.locator("#vaBankPicker").isVisible(),true);
    assert.deepEqual(await page.locator("#vaBank option").allTextContents(),BANKS.map(bank=>bank.name));
    await page.selectOption("#vaBank","mandiri");
    await page.click("input[name='payment'][value='COD']");
    assert.equal(await page.locator("#vaBankPicker").isHidden(),true,"bank picker only shows for Transfer Bank");
    await page.click("input[name='payment'][value='Transfer Bank']");
    await page.click("#checkoutNext");
    assert.match(await page.locator("#finalReview").innerText(),/Transfer Bank · Mandiri/);
    await page.check("#reviewConsent");
    await page.click("#checkoutSubmit");
    await page.waitForSelector("#successModal:not(.hidden) .payment-va");
    const success=await page.locator("#successMessage").innerText();
    assert.match(success,/Kode perusahaan/);
    assert.match(success,/70012345678/);
    assert.match(success,/Rp\s?13\.024\.000/);
    assert.match(success,/Transfer Bank · Mandiri/);
    assert.equal(calls.orders[0].payment,"Transfer Bank");
    assert.equal(calls.payments[0].bank,"mandiri");
    const record=await page.evaluate(()=>JSON.parse(localStorage.getItem("gyd_order_access"))[0]);
    assert.equal(record.bank,"mandiri","the bank is remembered for paying again from Pesanan");
    await page.locator("#successMessage [data-copy='70012345678']").click();
    await page.waitForFunction(()=>/Disalin|Salin manual/.test(document.querySelector("#toast")?.textContent||""));
    if(shotDir) await page.screenshot({path:`${shotDir}/va-success-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,"no horizontal scroll");
    await page.close();
  }
  // 2. QRIS enabled but blocked above Rp10.000.000; available for a small cart.
  {
    const config={paymentMethods:["Transfer Bank","QRIS","COD"],vaBanks:BANKS,qrisMaxAmount:10000000};
    const big=await openPage({width,config,cart:[{id:IPHONE,qty:1}]});
    await goToPaymentStep(big.page);
    const qris=big.page.locator("input[name='payment'][value='QRIS']");
    assert.equal(await qris.isDisabled(),true,"QRIS is disabled above the Rp10.000.000 cap");
    assert.match(await big.page.locator("#qrisOptionNote").innerText(),/batas QRIS/);
    if(shotDir) await big.page.screenshot({path:`${shotDir}/va-step4-${width}.png`});
    await big.page.close();
    const small=await openPage({width,config,cart:[{id:MOUSE,qty:1}]});
    await goToPaymentStep(small.page);
    assert.equal(await small.page.locator("input[name='payment'][value='QRIS']").isDisabled(),false,"QRIS stays available below the cap");
    await small.page.close();
  }
  // 3. Pesanan: a Transfer Bank order without a remembered bank asks for one first.
  {
    const order={orderNumber:"GYD-20260926-0200",createdAt:new Date().toISOString(),status:"pending",paymentMethod:"Transfer Bank",paymentStatus:"unpaid",
      paymentDeadline:new Date(Date.now()+20*3600e3).toISOString(),shippingServiceName:"Reguler",shippingCost:25000,subtotal:6199000,total:6224000,
      items:[{name:"Galaxy A56 5G",quantity:1,unitPrice:6199000,subtotal:6199000}]};
    const orders={[order.orderNumber]:order};
    const {page,calls}=await openPage({width,config:{paymentMethods:["Transfer Bank","COD"],vaBanks:BANKS,qrisMaxAmount:10000000},
      access:[{orderNumber:order.orderNumber,token:T("c"),paymentToken:T("d")}],orders});
    await page.goto(`${origin}/#pesanan`);
    const button=page.locator("[data-pay-order]");
    await button.waitFor();
    assert.equal(await button.innerText(),"Bayar via Transfer Bank");
    await button.click();
    await page.waitForSelector("#paymentContent .va-bank-choices");
    assert.equal(await page.locator("#paymentTitle").innerText(),"Bayar via Transfer Bank");
    await page.locator("[data-va-bank='bri']").click();
    await page.waitForSelector("#paymentContent .payment-va");
    assert.match(await page.locator("#paymentContent").innerText(),/Nomor Virtual Account BRI/);
    assert.deepEqual(calls.payments.map(call=>call.bank??null),[null,"bri"],"first asks without a bank, then with the chosen one");
    const record=await page.evaluate(()=>JSON.parse(localStorage.getItem("gyd_order_access"))[0]);
    assert.equal(record.bank,"bri");
    if(shotDir) await page.screenshot({path:`${shotDir}/va-modal-${width}.png`});
    // Transfer lands: the modal reports it via the status poll.
    order.paymentStatus="paid";
    await page.getByRole("button",{name:"Saya Sudah Bayar, Cek Status"}).click();
    await page.waitForSelector("#paymentContent .payment-state.paid");
    await page.close();
  }
}

await run(1280);
await run(390);
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Transfer Bank Virtual Account browser test passed.");
