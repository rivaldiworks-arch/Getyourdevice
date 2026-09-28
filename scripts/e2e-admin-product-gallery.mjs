// Browser test for the admin product gallery and specification list (Phase 8L): photos are
// cropped in the browser to square 1200x1200 or landscape 1600x1200 JPEGs, at least 3 are
// required, the first is the cover (image_url), and specifications are entered one per line.
// Requires the playwright package: npm install --no-save playwright
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
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

// Minimal solid-colour PNG encoder for test fixtures.
function crc32(buffer){let c,crc=0xffffffff;for(const byte of buffer){c=(crc^byte)&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);out.write(type,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type),data])),8+data.length);return out;}
function png(width,height){
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const rows=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*(width*3+1)+1+x*3;rows[i]=200;rows[i+1]=40;rows[i+2]=90;}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(rows)),chunk("IEND",Buffer.alloc(0))]);
}
function jpegSize(buffer){for(let i=2;i<buffer.length;){if(buffer[i]!==0xff){i++;continue;}const marker=buffer[i+1],length=buffer.readUInt16BE(i+2);if(marker>=0xc0&&marker<=0xc3)return {height:buffer.readUInt16BE(i+5),width:buffer.readUInt16BE(i+7)};i+=2+length;}return null;}

const browser=await chromium.launch();
const errors=[];
async function openAdmin(width,existing){
  const page=await browser.newPage({viewport:{width,height:1000}});
  const uploads=[],saves=[],deletes=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("dialog",dialog=>dialog.accept());
  await page.route(url=>!url.href.startsWith(origin)&&!url.href.startsWith(DB),route=>route.abort());
  await page.route(`${origin}/api/config`,route=>route.fulfill({json:{supabaseUrl:DB,supabaseAnonKey:"anon"}}));
  await page.route(`${DB}/**`,route=>{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    if(url.pathname.includes("/token"))return route.fulfill({json:{access_token:"tok",refresh_token:"ref",expires_in:3600,user:{id:"admin-1"}}});
    if(url.pathname.endsWith("/admin_profiles"))return route.fulfill({json:[{id:"admin-1",full_name:"Admin",role:"admin"}]});
    if(url.pathname.startsWith("/storage/v1/object/product-images/")){
      if(method==="POST"){uploads.push({type:request.headers()["content-type"],size:request.postDataBuffer().length,dims:jpegSize(request.postDataBuffer())});return route.fulfill({json:{Key:"ok"}});}
      if(method==="DELETE"){deletes.push(url.pathname);return route.fulfill({json:{}});}
    }
    if(url.pathname.endsWith("/products")&&["POST","PATCH"].includes(method)){saves.push({method,body:request.postDataJSON()});return route.fulfill({status:201,body:""});}
    if(url.pathname.endsWith("/products"))return route.fulfill({json:existing?[existing]:[]});
    return route.fulfill({json:[]});
  });
  await page.addInitScript(()=>localStorage.setItem("gyd_admin_session",JSON.stringify({refresh_token:"ref"})));
  return {page,uploads,saves,deletes};
}
const fill=async page=>{
  await page.fill("#name","Galaxy Tab S9 FE");await page.fill("#brand","Samsung");await page.fill("#category","Tablet");
  await page.fill("#price","6499000");await page.fill("#stock","5");
  await page.fill("#specifications","10,9 inci\n6 GB / 128 GB\nS Pen");
};

for(const width of [1180,390]){
  // New product: 2 photos are refused, the 3rd unlocks saving; sizes and cover are right.
  const {page,uploads,saves}=await openAdmin(width);
  await page.goto(`${origin}/admin.html#produk/baru`);
  await page.waitForSelector("#productDialog[open]");
  assert.match(await page.locator("label",{hasText:"Spesifikasi utama"}).innerText(),/Satu per baris/,"specifications are a plain list, not JSON");
  await fill(page);
  await page.setInputFiles("#imageFile",[{name:"wide.png",mimeType:"image/png",buffer:png(800,450)},{name:"tall.png",mimeType:"image/png",buffer:png(300,500)}]);
  await page.waitForFunction(()=>document.querySelectorAll("#imagePreview .gallery-item img").length===2);
  const shapes=await page.locator("#imagePreview .gallery-item").evaluateAll(items=>items.map(item=>item.className));
  assert.deepEqual(shapes.map(c=>/shape-(\w+)/.exec(c)[1]),["landscape","square"],"orientation picks the shape");
  assert.match(await page.locator(".gallery-count").innerText(),/tambah 1 lagi/);
  await page.locator("#saveProductButton").click();
  await page.waitForFunction(()=>/minimal 3 foto/.test(document.querySelector("#formError")?.textContent||""));
  assert.equal(saves.length,0,"a product with fewer than 3 photos is not saved");
  assert.equal(uploads.length,0,"nothing is uploaded before the gallery is complete");
  await page.setInputFiles("#imageFile",[{name:"third.png",mimeType:"image/png",buffer:png(500,500)}]);
  await page.waitForFunction(()=>document.querySelectorAll("#imagePreview .gallery-item img").length===3);
  // Switch the second photo to landscape and move the third to the front (cover).
  await page.locator('[data-gallery-item="1"][data-gallery-shape="landscape"]').click();
  await page.waitForFunction(()=>document.querySelectorAll("#imagePreview .gallery-item")[1].classList.contains("shape-landscape")&&!document.querySelector("[data-gallery-shape]:disabled"));
  await page.locator('[data-gallery-item="2"][data-gallery-move="-1"]').click();
  await page.locator('[data-gallery-item="1"][data-gallery-move="-1"]').click();
  assert.equal(await page.locator(".gallery-item").first().locator(".gallery-cover").count(),1,"first photo is marked as cover");
  await page.locator("#saveProductButton").click();
  await page.waitForFunction(n=>!document.querySelector("#productDialog[open]"),null,{timeout:10000});
  assert.equal(uploads.length,3);
  assert.ok(uploads.every(upload=>upload.type==="image/jpeg"),"photos are uploaded as JPEG");
  assert.deepEqual(uploads.map(upload=>`${upload.dims.width}x${upload.dims.height}`),["1200x1200","1600x1200","1600x1200"],"only the two sizes exist");
  assert.ok(uploads.every(upload=>upload.size<5*1024*1024));
  const body=saves[0].body;
  assert.equal(saves[0].method,"POST");
  assert.deepEqual(body.images.map(image=>image.shape),["square","landscape","landscape"]);
  assert.equal(body.image_url,body.images[0].url,"the cover is also the image_url");
  assert.deepEqual(body.specifications,{summary:"10,9 inci · 6 GB / 128 GB · S Pen"});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`no horizontal scroll at ${width}px`);
  await page.close();
}
{
  // Existing product with one legacy photo: it stays, two new ones are added, a removed
  // photo is deleted from storage after saving, and specifications load as lines.
  const legacy=`${DB}/storage/v1/object/public/product-images/products/p1/old.jpg`;
  const removed=`${DB}/storage/v1/object/public/product-images/products/p1/gone.jpg`;
  const product={id:"p1",name:"WH-CH720N",brand:"Sony",category:"Audio",description:"Headphone",specifications:{summary:"Wireless · Noise Cancelling · 35 jam"},price:1699000,original_price:null,stock:17,image_url:legacy,images:[{url:legacy,shape:"square"},{url:removed,shape:"landscape"}],rating:0,is_active:true,warranty:null};
  const {page,uploads,saves,deletes}=await openAdmin(1180,product);
  await page.goto(`${origin}/admin.html#produk/p1`);
  await page.waitForSelector("#productDialog[open]");
  assert.equal(await page.inputValue("#specifications"),"Wireless\nNoise Cancelling\n35 jam");
  assert.equal(await page.locator("#imagePreview .gallery-item").count(),2);
  await page.locator('[data-gallery-remove="1"]').click();
  await page.setInputFiles("#imageFile",[{name:"a.png",mimeType:"image/png",buffer:png(400,400)},{name:"b.png",mimeType:"image/png",buffer:png(640,480)}]);
  await page.waitForFunction(()=>document.querySelectorAll("#imagePreview .gallery-item img").length===3);
  await page.locator("#saveProductButton").click();
  await page.waitForFunction(()=>!document.querySelector("#productDialog[open]"),null,{timeout:10000});
  assert.equal(uploads.length,2,"only new photos are uploaded");
  assert.equal(saves[0].method,"PATCH");
  assert.equal(saves[0].body.images[0].url,legacy,"the kept legacy photo stays the cover");
  assert.equal(saves[0].body.images.length,3);
  assert.deepEqual(deletes,["/storage/v1/object/product-images/products/p1/gone.jpg"],"the removed photo is deleted from storage");
  await page.close();
}
assert.deepEqual(errors,[],`no page errors: ${errors.join(" | ")}`);
await browser.close();server.close();
console.log("Admin product gallery browser test passed.");
