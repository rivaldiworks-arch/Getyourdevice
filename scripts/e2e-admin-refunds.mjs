// Browser test for recording refunds in the admin (Phase 8K): the "perlu refund" banner,
// the refund panel in the order detail and the record_payment_refund RPC call. Serves the
// static admin page, mocks /api/config and the Supabase REST/Auth endpoints, and drives
// Chromium at desktop and phone widths.
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

const base={created_at:"2026-09-29T08:00:00Z",customer_name:"Oslo",customer_phone:"6281288451500",customer_email:"oslo@example.com",shipping_address:"Jakarta",city:"jakarta timur",postal_code:"13220",subtotal:11000,shipping_cost:0,payment_method:"QRIS",shipping_method:"regular",shipping_provider:"biteship"};
const pay=(id,orderId,amount,fields={})=>({id,order_id:orderId,provider:"midtrans",payment_method:"QRIS",status:"paid",amount,provider_reference:`GYD-${id}`,external_transaction_id:`tx-${id}`,paid_at:"2026-09-29T08:01:00Z",created_at:"2026-09-29T08:00:30Z",...fields});
function fixtures(){
  const orders=[
    {...base,id:"o-cancelled",order_number:"GYD-20260929-0003",total:11000,status:"cancelled",payment_status:"paid"},
    {...base,id:"o-double",order_number:"GYD-20260929-0004",total:9000,status:"confirmed",payment_status:"paid"},
    {...base,id:"o-normal",order_number:"GYD-20260929-0005",total:5000,status:"confirmed",payment_status:"paid"},
    {...base,id:"o-auto",order_number:"GYD-20260929-0006",total:7000,status:"cancelled",payment_status:"expired",auto_cancelled_at:"2026-09-30T08:00:00Z"}
  ];
  const payments=[
    pay("p-cancelled","o-cancelled",11000),
    pay("p-double-1","o-double",9000,{created_at:"2026-09-29T08:00:10Z"}),
    pay("p-double-2","o-double",9000,{created_at:"2026-09-29T08:00:20Z"}),
    pay("p-normal","o-normal",5000),
    pay("p-auto","o-auto",7000,{status:"expired",paid_at:null})
  ];
  return {orders,payments};
}

async function openAdmin(width,{rpcError=null}={}) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const {orders,payments}=fixtures(),calls=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",dialog=>dialog.accept());
  await page.route(url=>!url.href.startsWith(origin)&&!url.href.startsWith(DB),route=>route.abort());
  await page.route(`${origin}/api/config`,route=>route.fulfill({json:{supabaseUrl:DB,supabaseAnonKey:"anon"}}));
  await page.route(`${DB}/**`,async route=>{
    const url=new URL(route.request().url()),method=route.request().method(),table=url.pathname.replace(/^\/(rest|auth)\/v1\//,"");
    if(table.startsWith("token")) return route.fulfill({json:{access_token:"tok",refresh_token:"ref",expires_in:3600,user:{id:"admin-1",email:"admin@example.com"}}});
    if(table==="admin_profiles") return route.fulfill({json:[{id:"admin-1",full_name:"Admin",role:"admin"}]});
    if(table==="rpc/record_payment_refund"&&method==="POST"){
      const body=route.request().postDataJSON();calls.push(body);
      if(rpcError) return route.fulfill({status:400,json:{code:"P0001",message:rpcError}});
      const payment=payments.find(row=>row.id===body.p_payment_id);
      Object.assign(payment,{status:"refunded",refund_amount:body.p_amount,refund_method:body.p_method,refund_reference:body.p_reference||null,refund_note:body.p_note||null,refunded_at:"2026-10-02T03:00:00Z"});
      const order=orders.find(row=>row.id===payment.order_id);
      if(!payments.some(row=>row.order_id===order.id&&row.status==="paid"))order.payment_status="refunded";
      return route.fulfill({json:payment});
    }
    if(table==="orders") return route.fulfill({json:orders.map(order=>({...order,order_items:[],payments:payments.filter(row=>row.order_id===order.id)}))});
    return route.fulfill({json:[]});
  });
  await page.addInitScript(()=>localStorage.setItem("gyd_admin_session",JSON.stringify({refresh_token:"ref"})));
  return {page,calls};
}
const rowIds=page=>page.locator(".order-row").evaluateAll(rows=>rows.map(row=>row.dataset.orderRow));
const noHorizontalScroll=async (page,width)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`no horizontal scroll at ${width}px`);

async function run(width){
  {
    const {page,calls}=await openAdmin(width);
    await page.goto(`${origin}/admin.html#pesanan`);
    await page.waitForSelector(".order-row");
    // The cancelled paid order owes Rp11.000; the double-paid order owes one extra Rp9.000.
    const banner=page.locator(".refund-banner");
    assert.match(await banner.innerText(),/2 pesanan perlu refund · Rp\s?20\.000/);
    assert.match(await page.locator('[data-order-row="o-cancelled"]').innerText(),/Sudah dibayar: proses refund/);
    assert.match(await page.locator('[data-order-row="o-double"]').innerText(),/Dibayar 2×: refund kelebihannya/);
    await banner.click();
    assert.deepEqual((await rowIds(page)).sort(),["o-cancelled","o-double"],"the banner filters to orders owing money");
    await noHorizontalScroll(page,width);
    await page.locator(".refund-banner").click();
    assert.equal(await page.locator(".order-row").count(),4,"clicking again shows every order");

    // Record the refund of the cancelled order.
    await page.goto(`${origin}/admin.html#pesanan/o-cancelled`);
    const panel=page.locator("#orderDetailContent .refund-panel");
    await panel.waitFor();
    assert.match(await panel.innerText(),/dibatalkan tetapi sudah dibayar/);
    await panel.getByText("Catat Refund").click();
    const form=panel.locator('[data-refund-form="p-cancelled"]');
    assert.equal(await form.locator('[name="amount"]').inputValue(),"11000","the full payment is the default amount");
    await form.locator('[name="reference"]').fill("RF-77");
    await form.locator('[name="note"]').fill("Pesanan dibatalkan pembeli");
    await noHorizontalScroll(page,width);
    await form.getByRole("button",{name:"Simpan Refund"}).click();
    await page.waitForSelector("#orderDetailContent .refund-item.done");
    assert.deepEqual(calls,[{p_payment_id:"p-cancelled",p_amount:11000,p_method:"midtrans",p_reference:"RF-77",p_note:"Pesanan dibatalkan pembeli"}]);
    const done=await page.locator("#orderDetailContent .refund-panel").innerText();
    assert.match(done,/Rp\s?11\.000 dikembalikan/);
    assert.match(done,/Dashboard Midtrans/);assert.match(done,/Ref\. RF-77/);assert.match(done,/Pesanan dibatalkan pembeli/);
    assert.match(done,/Semua refund untuk pesanan ini sudah dicatat/);
    assert.equal(await page.locator("#orderDetailContent [data-refund-form]").count(),0,"nothing left to refund");

    // Double payment: both attempts can be refunded until one is.
    await page.goto(`${origin}/admin.html#pesanan/o-double`);
    const double=page.locator("#orderDetailContent .refund-panel");
    await double.waitFor();
    assert.match(await double.innerText(),/dibayar 2 kali/);
    assert.equal(await double.locator("[data-refund-form]").count(),2);
    await double.locator(".refund-form-toggle").nth(1).locator("summary").click();
    const second=double.locator('[data-refund-form="p-double-2"]');
    await second.locator('[name="amount"]').fill("8500");
    await second.locator('[name="method"]').selectOption("bank_transfer");
    await second.getByRole("button",{name:"Simpan Refund"}).click();
    await page.waitForSelector("#orderDetailContent .refund-item.done");
    assert.deepEqual(calls.at(-1),{p_payment_id:"p-double-2",p_amount:8500,p_method:"bank_transfer",p_reference:"",p_note:""});
    assert.equal(await page.locator("#orderDetailContent [data-refund-form]").count(),0,"the remaining payment is the order's own");
    assert.match(await page.locator("#orderDetailContent").innerText(),/Lunas/,"the order stays paid");

    // Orders being fulfilled normally, and unpaid cancellations, have no refund panel.
    await page.goto(`${origin}/admin.html#pesanan/o-normal`);
    await page.waitForSelector("#orderDialog[open] .order-status-panel");
    assert.equal(await page.locator("#orderDetailContent .refund-panel").count(),0);
    await page.goto(`${origin}/admin.html#pesanan/o-auto`);
    await page.waitForSelector("#orderDialog[open] .order-status-panel");
    assert.equal(await page.locator("#orderDetailContent .refund-panel").count(),0);

    await page.goto(`${origin}/admin.html#pesanan`);
    await page.waitForSelector(".order-row");
    assert.equal(await page.locator(".refund-banner").count(),0,"the banner disappears once nothing is owed");
    assert.match(await page.locator('[data-order-row="o-cancelled"]').innerText(),/Refund sudah dicatat/);
    await page.close();
  }
  {
    // The database refuses: the message explains why and the button comes back.
    const {page}=await openAdmin(width,{rpcError:"REFUND_REQUIRES_CANCELLED_ORDER"});
    await page.goto(`${origin}/admin.html#pesanan/o-cancelled`);
    const panel=page.locator("#orderDetailContent .refund-panel");
    await panel.waitFor();
    await panel.getByText("Catat Refund").click();
    await panel.getByRole("button",{name:"Simpan Refund"}).click();
    await page.waitForFunction(()=>/Batalkan pesanan dulu/.test(document.querySelector("#refundMessage")?.textContent||""));
    assert.equal(await panel.getByRole("button",{name:"Simpan Refund"}).isEnabled(),true);
    await page.close();
  }
}

await run(1280);
await run(390);
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Admin refunds browser test passed.");
