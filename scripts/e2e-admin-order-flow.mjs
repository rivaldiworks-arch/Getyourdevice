// Browser test for the admin order flow panel (Phase 8C): admins get only the steps
// that belong to an order's stage instead of a free-form status dropdown. Serves the
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
const shotDir=process.env.E2E_SCREENSHOT_DIR||null;
const errors=[];
const browser=await chromium.launch();
const TRANSITIONS={pending:["confirmed","cancelled"],confirmed:["processing","shipped","completed","cancelled"],processing:["shipped","completed","cancelled"],shipped:["completed","cancelled"],completed:[],cancelled:[]};

const base={created_at:"2026-09-26T08:00:00Z",customer_name:"Oslo",customer_phone:"6281288451500",customer_email:"oslo@example.com",shipping_address:"Jakarta, rawamangun",city:"jakarta timur",postal_code:"13220",subtotal:1000,shipping_cost:0,total:1000};
function fixtures(){
  return [
    {...base,id:"o-unpaid",order_number:"GYD-20260926-0101",status:"pending",payment_method:"QRIS",payment_status:"unpaid",shipping_method:"regular",shipping_provider:"biteship",payment_access_expires_at:"2026-09-27T08:00:00Z"},
    {...base,id:"o-pickup",order_number:"GYD-20260926-0102",status:"confirmed",payment_method:"QRIS",payment_status:"paid",shipping_method:"pickup",shipping_provider:"internal"},
    {...base,id:"o-courier",order_number:"GYD-20260926-0103",status:"confirmed",payment_method:"Transfer Bank",payment_status:"paid",shipping_method:"regular",shipping_provider:"biteship"},
    {...base,id:"o-cod",order_number:"GYD-20260926-0104",status:"pending",payment_method:"COD",payment_status:"unpaid",shipping_method:"pickup",shipping_provider:"internal"},
    {...base,id:"o-auto",order_number:"GYD-20260926-0105",status:"cancelled",payment_method:"QRIS",payment_status:"unpaid",shipping_method:"regular",shipping_provider:"biteship",auto_cancelled_at:"2026-09-26T09:00:00Z"},
    {...base,id:"o-fallback",order_number:"GYD-20260926-0106",status:"confirmed",payment_method:"QRIS",payment_status:"paid",shipping_method:"regular",shipping_provider:"internal"}
  ];
}

async function openAdmin(width,{rejectPatch=false}={}) {
  const page=await browser.newPage({viewport:{width,height:900}});
  const orders=fixtures(),patches=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",dialog=>dialog.accept());
  await page.route(url=>!url.href.startsWith(origin)&&!url.href.startsWith(DB),route=>route.abort());
  await page.route(`${origin}/api/config`,route=>route.fulfill({json:{supabaseUrl:DB,supabaseAnonKey:"anon"}}));
  await page.route(`${DB}/**`,async route=>{
    const url=new URL(route.request().url()),method=route.request().method(),table=url.pathname.replace(/^\/(rest|auth)\/v1\//,"");
    if(table.startsWith("token")) return route.fulfill({json:{access_token:"tok",refresh_token:"ref",expires_in:3600,user:{id:"admin-1",email:"admin@example.com"}}});
    if(table==="admin_profiles") return route.fulfill({json:[{id:"admin-1",full_name:"Admin",role:"admin"}]});
    if(table==="orders"&&method==="PATCH"){
      const id=url.searchParams.get("id").replace(/^eq\./,""),body=route.request().postDataJSON(),order=orders.find(row=>row.id===id);
      patches.push({id,...body});
      if(rejectPatch||!TRANSITIONS[order.status].includes(body.status)) return route.fulfill({status:400,json:{code:"P0001",message:"INVALID_ORDER_STATUS_TRANSITION"}});
      order.status=body.status;
      return route.fulfill({status:204,body:""});
    }
    if(table==="orders"){
      // Items are embedded in the orders request, like PostgREST does for select=*,order_items(*).
      const items=[{order_id:"o-pickup",product_id:"p-1",product_name:"iPhone 15 128GB",quantity:1,subtotal:1000},{order_id:"o-courier",product_id:"p-2",product_name:"Galaxy Tab S9 FE",quantity:2,subtotal:800},{order_id:"o-courier",product_id:"p-3",product_name:"Case",quantity:1,subtotal:200}];
      return route.fulfill({json:orders.map(order=>({...order,order_items:items.filter(item=>item.order_id===order.id),payments:[]}))});
    }
    if(table==="products") return route.fulfill({json:[{id:"p-1",image_url:"https://img.example.test/iphone.png"},{id:"p-2",image_url:"https://img.example.test/missing.png"}]});
    return route.fulfill({json:[]});
  });
  await page.addInitScript(()=>localStorage.setItem("gyd_admin_session",JSON.stringify({refresh_token:"ref"})));
  return {page,orders,patches};
}
async function openOrder(page,id){
  await page.goto(`${origin}/admin.html#pesanan/${id}`);
  await page.waitForSelector("#orderDialog[open] .order-status-panel");
  return page.locator("#orderDetailContent .order-status-panel").filter({hasText:"Alur pesanan"});
}
const labels=async panel=>panel.locator("[data-order-action]").allInnerTexts();

async function run(width){
  {
    const {page,patches}=await openAdmin(width);
    let panel=await openOrder(page,"o-unpaid");
    assert.equal(await page.locator("#orderDetailStatus").count(),0,"no free-form status dropdown");
    assert.match(await panel.innerText(),/dibatalkan otomatis/);
    assert.deepEqual(await labels(panel),["Batalkan Pesanan"]);

    panel=await openOrder(page,"o-courier");
    assert.match(await panel.innerText(),/Buat Pengiriman Biteship/);
    assert.deepEqual(await labels(panel),["Batalkan Pesanan"],"courier orders advance through Biteship, not by hand");

    panel=await openOrder(page,"o-fallback");
    assert.deepEqual(await labels(panel),["Tandai Sudah Dikirim","Batalkan Pesanan"],"fallback-rate orders are shipped by hand");

    panel=await openOrder(page,"o-cod");
    assert.deepEqual(await labels(panel),["Konfirmasi Pesanan","Tandai Sudah Diambil & Dibayar","Batalkan Pesanan"]);

    panel=await openOrder(page,"o-auto");
    assert.match(await panel.innerText(),/Dibatalkan otomatis/);
    assert.deepEqual(await labels(panel),[],"cancelled is final");

    panel=await openOrder(page,"o-pickup");
    assert.deepEqual(await labels(panel),["Tandai Sudah Diambil","Batalkan Pesanan"]);
    if(shotDir) await panel.locator("xpath=..").screenshot({path:`${shotDir}/admin-flow-${width}.png`});
    await panel.getByRole("button",{name:"Tandai Sudah Diambil"}).click();
    await page.waitForFunction(()=>/Pesanan selesai/.test(document.querySelector("#orderDetailContent")?.textContent||""));
    assert.deepEqual(patches,[{id:"o-pickup",status:"completed"}]);
    panel=page.locator("#orderDetailContent .order-status-panel").filter({hasText:"Alur pesanan"});
    assert.deepEqual(await labels(panel),[],"completed is final");
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,"no horizontal scroll");
    await page.close();
  }
  {
    // The database refuses a stale step (e.g. the order moved meanwhile).
    const {page}=await openAdmin(width,{rejectPatch:true});
    const panel=await openOrder(page,"o-pickup");
    await panel.getByRole("button",{name:"Batalkan Pesanan"}).click();
    await page.waitForFunction(()=>/tidak sesuai alur pesanan/.test(document.querySelector("#orderStatusMessage")?.textContent||""));
    assert.equal(await panel.getByRole("button",{name:"Batalkan Pesanan"}).isEnabled(),true,"buttons come back after a refusal");
    await page.close();
  }
}

// Order notifications: the first poll records a baseline; later polls announce new
// orders and payments with a badge and a list linking to the order.
async function notifications(width){
  const {page,orders}=await openAdmin(width);
  await page.goto(`${origin}/admin.html#pesanan`);
  await page.waitForSelector("#notifyButton");
  await page.waitForFunction(()=>/Diperbarui/.test(document.querySelector("#notifyStatus")?.textContent||""));
  assert.equal(await page.locator("#notifyCount").isHidden(),true,"existing orders do not raise notifications");
  orders.push({...orders[0],id:"o-new",order_number:"GYD-20260928-0201",created_at:new Date().toISOString(),status:"pending",payment_method:"QRIS",payment_status:"unpaid",customer_name:"Sari"});
  orders.find(order=>order.id==="o-unpaid").payment_status="paid";
  await page.evaluate(()=>pollOrderNotifications());
  await page.waitForSelector("#notifyCount:not(.hidden)");
  assert.equal(await page.locator("#notifyCount").innerText(),"2");
  assert.match(await page.title(),/^\(2\) /,"unread count shows in the tab title");
  await page.locator("#notifyButton").click();
  const items=await page.locator("#notifyList li").allInnerTexts();
  assert.ok(items.some(text=>/Pesanan baru/.test(text)&&/GYD-20260928-0201/.test(text)&&/Sari/.test(text)),"new order listed");
  assert.ok(items.some(text=>/Pembayaran diterima/.test(text)&&/GYD-20260926-0101/.test(text)),"payment listed");
  assert.equal(await page.locator('#notifyList a[href="#pesanan/o-new"]').count(),1,"entries link to the order");
  await page.locator("#notifyMarkRead").click();
  assert.equal(await page.locator("#notifyCount").isHidden(),true,"mark as read clears the badge");
  await page.evaluate(()=>pollOrderNotifications());
  assert.equal(await page.locator("#notifyList li.unread").count(),0,"an unchanged poll adds nothing");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,"no horizontal scroll with the bell");
  await page.close();
}

await run(1280);
await run(390);
// The order list shows products, both statuses, the next step and its button, so
// routine work happens without opening the detail dialog.
const PIXEL=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==","base64");
async function orderList(width){
  const {page,patches}=await openAdmin(width);
  await page.route("https://img.example.test/**",route=>route.request().url().endsWith("/iphone.png")?route.fulfill({contentType:"image/png",body:PIXEL}):route.fulfill({status:404,body:""}));
  await page.goto(`${origin}/admin.html#pesanan`);
  await page.waitForSelector(".order-row");
  const stats=await page.locator(".order-stat").allInnerTexts();
  assert.match(stats[0],/Perlu diproses\s*4/i,"confirmed orders plus the COD pickup need the admin");
  assert.match(stats[1],/Menunggu bayar\s*1/i);
  const row=id=>page.locator(`[data-order-row="${id}"]`);
  const pickup=await row("o-pickup").innerText();
  assert.match(pickup,/iPhone 15 128GB/,"product name in the row");
  assert.match(pickup,/Dikonfirmasi/);assert.match(pickup,/Lunas/);assert.match(pickup,/Ambil di toko/);
  assert.equal(await row("o-pickup").locator('img[src="https://img.example.test/iphone.png"]').count(),1,"product photo in the row");
  await page.waitForFunction(()=>document.querySelector('[data-order-row="o-courier"] .thumb-fallback'));
  assert.equal(await row("o-courier").locator(".order-products img").count(),0,"a photo that fails to load becomes the placeholder");
  assert.match(await row("o-courier").innerText(),/\+1 produk lain/);
  assert.equal(await row("o-courier").locator("[data-shipping-book]").count(),1,"courier orders can be booked from the list");
  assert.equal(await page.locator('.order-row [data-order-action="cancel"]').count(),0,"cancelling stays in the detail dialog");
  // The quick view narrows the list; clicking it again clears it.
  await page.locator('[data-order-view="awaiting"]').click();
  assert.deepEqual(await page.locator(".order-row").evaluateAll(rows=>rows.map(r=>r.dataset.orderRow)),["o-unpaid"]);
  await page.locator('[data-order-view="awaiting"]').click();
  assert.equal(await page.locator(".order-row").count(),6);
  // Search covers product names.
  await page.fill("#orderSearch","galaxy tab");
  assert.deepEqual(await page.locator(".order-row").evaluateAll(rows=>rows.map(r=>r.dataset.orderRow)),["o-courier"]);
  await page.fill("#orderSearch","");
  // The row button advances the order without the dialog.
  await row("o-pickup").getByRole("button",{name:"Tandai Sudah Diambil"}).click();
  await page.waitForFunction(()=>/Selesai/.test(document.querySelector('[data-order-row="o-pickup"]')?.textContent||""));
  assert.deepEqual(patches,[{id:"o-pickup",status:"completed"}]);
  assert.equal(await page.locator("#orderDialog[open]").count(),0,"no dialog was needed");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`no horizontal scroll at ${width}px`);
  await page.close();
}
for(const width of [1440,1180,834,390])await orderList(width);
// Status shows once, the phone number stays off the list, filters and 50-per-page paging.
async function listFilters(width){
  const {page,orders}=await openAdmin(width);
  const done=orders.find(order=>order.id==="o-pickup");done.status="completed";
  for(let n=0;n<60;n++)orders.push({...orders[0],id:`o-bulk-${n}`,order_number:`GYD-20260920-${String(n+1).padStart(4,"0")}`,created_at:new Date(Date.UTC(2026,8,20,8,0,60-n)).toISOString(),status:"completed",payment_status:"paid"});
  const queries=[];page.on("request",request=>{if(/\/rest\/v1\/orders\?select=\*,order_items/.test(request.url()))queries.push(decodeURIComponent(request.url()));});
  await page.goto(`${origin}/admin.html#pesanan`);
  await page.waitForSelector(".order-row");
  const completed=await page.locator('[data-order-row="o-pickup"] .order-state').innerText();
  assert.equal(completed.match(/Selesai/g).length,1,"a completed order says Selesai once");
  assert.doesNotMatch(await page.locator(".order-list").innerText(),/6281288451500/,"phone numbers stay off the list");
  assert.equal(await page.locator('[data-order-row="o-pickup"] a.wa-chip[href="https://wa.me/6281288451500"]').count(),1,"one WhatsApp button per customer");
  // 66 orders: 50 on the first page, 16 on the second.
  assert.equal(await page.locator(".order-row").count(),50);
  assert.match(await page.locator("#orderMessage").innerText(),/1–50 dari 66/);
  await page.locator("#orderPager").getByRole("button",{name:"Berikutnya ›"}).click();
  assert.equal(await page.locator(".order-row").count(),16);
  assert.match(await page.locator("#orderPager").innerText(),/Halaman 2 dari 2/);
  assert.equal(await page.locator("#orderPager").getByRole("button",{name:"Berikutnya ›"}).isDisabled(),true);
  // Status tabs carry counts and filter; switching resets to page 1.
  await page.locator('[data-status-tab="pending"]').click();
  assert.match(await page.locator('[data-status-tab="pending"]').innerText(),/Menunggu\s*2/);
  assert.deepEqual((await page.locator(".order-row").evaluateAll(rows=>rows.map(r=>r.dataset.orderRow))).sort(),["o-cod","o-unpaid"]);
  assert.equal(await page.locator("#orderPager button").count(),0,"no pager for one page");
  await page.locator('[data-status-tab="all"]').click();
  // Date presets narrow the request itself.
  await page.selectOption("#orderDateFilter","7d");
  await page.waitForFunction(n=>document.querySelector("#orderMessage")?.textContent&&true,queries.length);
  await page.waitForTimeout(200);
  assert.match(queries.at(-1),/&and=\(created_at\.gte\.[^,)]+\)$/,"7-day preset asks for orders since six days ago");
  await page.selectOption("#orderDateFilter","custom");
  assert.equal(await page.locator("#orderDateCustom").isVisible(),true);
  await page.fill("#orderDateFrom","2026-09-01");
  await page.fill("#orderDateTo","2026-09-28");
  await page.locator("#orderDateTo").dispatchEvent("change");
  await page.waitForTimeout(200);
  assert.match(queries.at(-1),/&and=\(created_at\.gte\.[^,]+,created_at\.lt\.[^)]+\)$/,"custom range bounds both ends");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`no horizontal scroll at ${width}px`);
  await page.close();
}
for(const width of [1180,390])await listFilters(width);
await notifications(1280);
await notifications(390);
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Admin order flow browser test passed.");
