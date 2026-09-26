// Browser test for the storefront home layout (Phase 9 design refresh): no horizontal
// scroll on phone, tablet and desktop, a readable blue hero with a yellow primary action,
// one SVG icon set instead of mixed glyphs/emoji, and a two-column product grid on phones.
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
const categories=["Smartphone","Laptop","Tablet","Smartwatch","Audio","Accessories"];
const products=categories.flatMap((category,c)=>[0,1].map(n=>({id:`00000000-0000-4000-8000-0000000001${c}${n}`,name:`${category} ${n+1}`,brand:"Brand",category,
  description:"Deskripsi produk.",specifications:{summary:"Spesifikasi"},price:1000000*(c+1)+n*50000,original_price:null,stock:5+n,image_url:`https://images.example.test/${category}-${n}.jpg`,rating:4.8,is_active:true})));
const errors=[];
const browser=await chromium.launch();
const luminance=rgb=>{const [r,g,b]=rgb.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};

for(const width of [1440,834,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route(`${origin}/api/**`,route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==="/api/products") return route.fulfill({json:{products}});
    if(path==="/api/config") return route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y",checkout:{paymentMethods:["Transfer Bank","QRIS","COD"],vaBanks:[],qrisMaxAmount:10000000,integration:"snap"}}});
    return route.fulfill({status:503,json:{}});
  });
  await page.goto(origin);
  await page.waitForSelector("#productGrid .product-card");
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`no horizontal scroll at ${width}px`);

  const hero=await page.evaluate(()=>{
    const section=document.querySelector(".store-hero"),p=section.querySelector(".hero-copy>p"),button=section.querySelector(".primary");
    const style=el=>getComputedStyle(el);
    // The hero background is a gradient; judge contrast against its lighter end colour.
    const heroBg="rgb(20, 70, 160)";
    return {bg:style(section).backgroundImage.includes("gradient")?heroBg:style(section).backgroundColor,text:style(p).color,title:style(section.querySelector("h1")).color,button:style(button).backgroundColor,buttonText:style(button).color,
      titleCenter:Math.abs(section.querySelector("h1").getBoundingClientRect().left+section.querySelector("h1").getBoundingClientRect().width/2-innerWidth/2)};
  });
  assert.ok(contrast(hero.text,hero.bg)>=4.5,`hero text is readable (${hero.text} on ${hero.bg})`);
  assert.ok(contrast(hero.title,hero.bg)>=7,"hero title has strong contrast");
  assert.equal(hero.button,"rgb(255, 198, 41)","primary action is the yellow pill on the blue hero");
  assert.ok(contrast(hero.buttonText,hero.button)>=4.5,"primary button text is readable");
  assert.ok(hero.titleCenter<=24,"hero title is centered");

  const glyphs=await page.evaluate(()=>[...document.querySelectorAll(".header-actions .action-symbol,.benefits article>span,.why-grid article>span,.search-wrap button")]
    .filter(el=>!el.querySelector("svg.ui-icon")).map(el=>el.textContent.trim()));
  assert.deepEqual(glyphs,[],"every header/service icon comes from the SVG icon set");
  assert.doesNotMatch(await page.locator("footer").innerText(),/Demo toko statis|Admin Toko/,"no demo or admin wording in the public footer");
  assert.equal(await page.locator(".hero-media, .hero-caption").count(),0,"no borrowed brand photo in the hero");

  if(width===390){
    const columns=await page.evaluate(()=>getComputedStyle(document.querySelector("#productGrid")).gridTemplateColumns.split(" ").length);
    assert.equal(columns,2,"two product columns on phones");
    const carousel=await page.evaluate(()=>{const grid=document.querySelector("#popularShowcase");return {flow:getComputedStyle(grid).gridAutoFlow,scrolls:grid.scrollWidth>grid.clientWidth};});
    assert.equal(carousel.flow,"column");
    assert.equal(carousel.scrolls,true,"showcases scroll sideways on phones");
  }
  // Hero motion: floating gadgets and a moving strip of real, in-stock products.
  assert.ok(await page.locator(".hero-art .hero-gadget").count()>=4,"animated gadget line-art in the hero");
  const track=page.locator("#heroMarquee");
  const items=await track.locator(".marquee-item").count();
  const visibleItems=await track.locator('.marquee-item:not([aria-hidden="true"])').count();
  assert.equal(items,visibleItems*2,"the strip is duplicated for a seamless loop");
  assert.equal(visibleItems,products.filter(p=>p.stock>0).length<=10?products.filter(p=>p.stock>0&&p.image_url).length:10);
  const x0=await track.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41);
  await page.waitForTimeout(600);
  const x1=await track.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41);
  assert.ok(x1<x0,"the product strip moves");
  await track.locator('.marquee-item:not([aria-hidden="true"])').first().click({force:true});
  await page.waitForSelector("#productModal:not(.hidden)");
  await page.keyboard.press("Escape");
  await page.locator('#productModal [data-action="close-product"]').click().catch(()=>{});
  // Header actions still work.
  await page.locator('.header-actions [data-action="open-cart"]').click();
  await page.waitForSelector("#cartDrawer:not(.hidden)");
  await page.close();
}

// Reduced motion: nothing animates.
{
  const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:"reduce"});
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route(`${origin}/api/**`,route=>new URL(route.request().url()).pathname==="/api/products"?route.fulfill({json:{products}}):route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y"}}));
  await page.goto(origin);
  await page.waitForSelector("#heroMarquee .marquee-item");
  const names=await page.evaluate(()=>[...document.querySelectorAll(".hero-gadget,.marquee-track")].map(el=>getComputedStyle(el).animationName));
  assert.ok(names.every(name=>name==="none"),"no hero animation with reduced motion");
  await page.close();
}
assert.deepEqual(errors,[],"no page errors");
await browser.close(); server.close();
console.log("Storefront home layout browser test passed.");
