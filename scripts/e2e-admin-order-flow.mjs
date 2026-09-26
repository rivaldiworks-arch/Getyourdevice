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
    if(table==="orders") return route.fulfill({json:orders});
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

await run(1280);
await run(390);
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Admin order flow browser test passed.");
