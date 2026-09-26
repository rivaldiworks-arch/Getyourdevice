// Browser test for the printable shipping label (Phase 8D). Opens the admin panel with
// mocked Supabase and /api/shipping/label, prints a label, checks the print layout
// (only the 100x150 mm label is printed), and decodes the waybill barcode from a
// screenshot of the rendered label with ZXing, as a courier scanner would.
// Requires: npm install --no-save playwright @zxing/library
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require=createRequire(import.meta.url);
const zxingPath=process.env.ZXING_UMD||require.resolve("@zxing/library/umd/index.min.js");
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

// Waybill shapes seen across Indonesian couriers: numeric, prefixed, mixed, dashed.
const WAYBILLS=["JNE0012345678","JP1234567890","SPXID0123456789012","0012345678901234","TLJR-1234567","CM12345678901"];
const order={id:"o-label",order_number:"GYD-20260926-0200",created_at:"2026-09-26T08:00:00Z",status:"processing",payment_method:"QRIS",payment_status:"paid",
  shipping_method:"regular",shipping_provider:"biteship",shipping_service_code:"jne:reg",shipping_service_name:"JNE Reguler",shipping_order_id:"bs-1",
  shipping_tracking_id:"trk-1",tracking_number:WAYBILLS[0],customer_name:"Oslo",customer_phone:"6281288451500",shipping_address:"Jl. Rawamangun Muka No. 5",
  city:"Jakarta Timur",postal_code:"13220",subtotal:1000,shipping_cost:9000,total:10000};

async function openAdmin(width,labelResponse){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:2});
  const calls=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(url=>!url.href.startsWith(origin)&&!url.href.startsWith(DB),route=>route.abort());
  await page.route(`${origin}/api/config`,route=>route.fulfill({json:{supabaseUrl:DB,supabaseAnonKey:"anon"}}));
  await page.route(`${origin}/api/shipping/label`,route=>{calls.push(route.request().postDataJSON());return route.fulfill(labelResponse());});
  await page.route(`${DB}/**`,route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.includes("/token")) return route.fulfill({json:{access_token:"tok",refresh_token:"ref",expires_in:3600,user:{id:"admin-1"}}});
    if(path.endsWith("/admin_profiles")) return route.fulfill({json:[{id:"admin-1",role:"admin"}]});
    if(path.endsWith("/orders")) return route.fulfill({json:[order]});
    if(path.endsWith("/order_items")) return route.fulfill({json:[{order_id:order.id,product_name:"Galaxy A56 5G",quantity:1,product_price:1000}]});
    return route.fulfill({json:[]});
  });
  await page.addInitScript(()=>{localStorage.setItem("gyd_admin_session",JSON.stringify({refresh_token:"ref"}));window.__prints=0;window.print=()=>{window.__prints++;};});
  await page.goto(`${origin}/admin.html#pesanan/${order.id}`);
  await page.waitForSelector("#orderDialog[open] [data-shipping-label]");
  return {page,calls};
}
const labelData=trackingNumber=>({orderNumber:order.order_number,createdAt:order.created_at,trackingNumber,courier:{company:"jne",type:"reg",name:"JNE Reguler"},environment:"live",
  recipient:{name:"Oslo",phone:"6281288451500",address:"Jl. Rawamangun Muka No. 5, RT 01/RW 02, Kel. Rawamangun, Kec. Pulo Gadung",city:"Jakarta Timur",postalCode:"13220",note:"Titip satpam"},
  sender:{name:"GETYOURDEVICE",contact:"Rivaldi",phone:"081234567890",address:"Jl. Pemuda No. 1, Rawamangun, Jakarta Timur",postalCode:"13220"},
  items:[{name:"Galaxy A56 5G",quantity:1},{name:"Mouse Wireless",quantity:2}],weightGrams:690});

async function decodeLabelBarcode(page){
  // Screenshot the label as printed (print media, real CSS size), then decode the image.
  const png=await page.locator("#printArea .label-barcode").screenshot();
  if(!await page.evaluate(()=>Boolean(window.ZXing)))await page.addScriptTag({path:zxingPath});
  return page.evaluate(async base64=>{
    const img=new Image();img.src=`data:image/png;base64,${base64}`;await img.decode();
    const canvas=document.createElement("canvas");canvas.width=img.width+80;canvas.height=img.height+80;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,40,40);
    const {HTMLCanvasElementLuminanceSource,BinaryBitmap,HybridBinarizer,MultiFormatReader,DecodeHintType,BarcodeFormat}=window.ZXing;
    const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.CODE_128]],[DecodeHintType.TRY_HARDER,true]]);
    const reader=new MultiFormatReader();reader.setHints(hints);
    const result=reader.decode(new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas))));
    return {text:result.getText(),format:result.getBarcodeFormat()};
  },png.toString("base64"));
}

async function run(width){
  let current=WAYBILLS[0];
  const {page,calls}=await openAdmin(width,()=>({json:labelData(current)}));
  const button=page.locator("[data-shipping-label]");
  assert.equal(await button.innerText(),"Cetak Label");
  await button.click();
  await page.waitForFunction(()=>window.__prints===1);
  assert.deepEqual(calls[0],{orderId:order.id});
  const text=await page.locator("#printArea").innerText();
  for(const expected of [/JNE/,/REG/,/No\. Resi/,/Oslo/,/6281288451500/,/Jakarta Timur 13220/,/GETYOURDEVICE/,/081234567890/,/GYD-20260926-0200/,/690 g/,/3 barang/,/Mouse Wireless × 2/,/Titip satpam/])assert.match(text,expected);
  assert.equal(await page.title(),"Admin — GETYOURDEVICE","title restored after printing");
  assert.equal(await page.locator("#dashboardView").isVisible(),true);
  assert.equal(await page.locator("#printArea").isVisible(),false,"the label is only visible when printing");

  await page.emulateMedia({media:"print"});
  // Printed output: only the label, at 100x150 mm (96 px/in => 378 x 567 CSS px).
  const box=await page.locator("#printArea .shipping-label").boundingBox();
  assert.ok(Math.abs(box.width-378)<=2&&Math.abs(box.height-567)<=2,`label is 100x150 mm, got ${box.width}x${box.height}`);
  assert.equal(await page.locator("#orderDialog").isVisible(),false,"the order dialog is not printed");
  assert.equal(await page.locator("#dashboardView").isVisible(),false,"the admin UI is not printed");
  const overflow=await page.evaluate(()=>{const label=document.querySelector(".shipping-label");return [...label.children].some(child=>child.getBoundingClientRect().bottom>label.getBoundingClientRect().bottom+1);});
  assert.equal(overflow,false,"every label section fits on the label");
  if(shotDir) await page.locator("#printArea .shipping-label").screenshot({path:`${shotDir}/label-${width}.png`});

  for(const waybill of WAYBILLS){
    current=waybill;
    if(waybill!==WAYBILLS[0]){
      await page.emulateMedia({media:"screen"});
      await button.click();
      await page.waitForFunction(n=>window.__prints===n,WAYBILLS.indexOf(waybill)+1);
      await page.emulateMedia({media:"print"});
    }
    const decoded=await decodeLabelBarcode(page);
    assert.equal(decoded.text,waybill,`scanner reads ${waybill}`);
  }
  await page.emulateMedia({media:"screen"});

  // Waybill not issued yet: the admin sees why, nothing is printed.
  current=null;
  const pending=await openAdmin(width,()=>({status:409,json:{error:"Nomor resi belum diterbitkan kurir. Coba lagi beberapa saat lagi.",code:"WAYBILL_PENDING"}}));
  await pending.page.locator("[data-shipping-label]").click();
  await pending.page.waitForFunction(()=>/belum diterbitkan kurir/.test(document.querySelector("#shippingActionMessage")?.textContent||""));
  assert.equal(await pending.page.evaluate(()=>window.__prints),0);
  assert.equal(await pending.page.locator("[data-shipping-label]").isEnabled(),true);
  await pending.page.close();
  await page.close();
}

await run(1280);
await run(390);
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Shipping label browser test passed.");
