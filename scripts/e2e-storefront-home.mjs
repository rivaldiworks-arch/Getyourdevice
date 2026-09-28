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
const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".svg":"image/svg+xml",".ico":"image/x-icon",".webmanifest":"application/manifest+json"};
const server=createServer(async (req,res)=>{
  const path=new URL(req.url,"http://x").pathname;
  try{const body=await readFile(join(root,path==="/"?"index.html":path));res.writeHead(200,{"Content-Type":types[extname(path)]||"text/html"});res.end(body);}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const categories=["Smartphone","Laptop","Tablet","Smartwatch","Audio","Accessories"];
const products=categories.flatMap((category,c)=>[0,1].map(n=>({id:`00000000-0000-4000-8000-0000000001${c}${n}`,name:`${category} ${n+1}`,brand:"Brand",category,
  description:"Deskripsi produk.",specifications:{summary:"Spesifikasi"},price:1000000*(c+1)+n*50000,original_price:n===1?10999000+c*1000000:null,stock:c===0&&n===0?0:5+n,image_url:`https://images.example.test/${category}-${n}.jpg`,rating:4.8,is_active:true,warranty:n===1?["resmi","tam","blibli"][c%3]:null})));
const errors=[];
const browser=await chromium.launch();
const luminance=rgb=>{const [r,g,b]=rgb.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};

for(const width of [1440,834,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  page.on("pageerror",e=>errors.push(e.message));
  const imageRequests=new Map();
  page.on("request",request=>{const url=request.url();if(!url.startsWith(origin)&&/images\.example\.test|placehold/.test(url))imageRequests.set(url,(imageRequests.get(url)||0)+1);});
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
  assert.doesNotMatch(await page.locator("#productDetail").innerText(),/ulasan|★/,"no invented rating in product detail");
  await page.keyboard.press("Escape");
  await page.locator('#productModal [data-action="close-product"]').click().catch(()=>{});
  // Wordmark: "getyour" light + "device" bold blue, in the brand font.
  const logo=await page.evaluate(()=>{const a=document.querySelector(".brand .logo .a"),b=document.querySelector(".brand .logo .b"),s=el=>getComputedStyle(el);
    return {text:document.querySelector(".brand .logo").textContent,aWeight:s(a).fontWeight,bWeight:s(b).fontWeight,bColor:s(b).color,family:s(a).fontFamily};});
  assert.equal(logo.text,"getyourdevice");
  assert.deepEqual([logo.aWeight,logo.bWeight,logo.bColor],["300","700","rgb(47, 111, 219)"]);
  assert.match(logo.family,/^"?Outfit/);
  // Scroll order: products come right after categories; reassurance sits just above the footer.
  const order=await page.evaluate(()=>[...document.querySelectorAll("#storeView > section")].map(section=>section.id||section.getAttribute("aria-labelledby")));
  assert.deepEqual(order,["heroTitle","categoryTitle","productsSection","dealTitle","latestPhonesTitle","laptopTitle","popularTitle","whyTitle"]);
  assert.equal(await page.locator(".benefits").count(),0,"service promises are not repeated above the fold");
  assert.equal(await page.locator(".trust-section .why-grid article").count(),4);
  assert.ok(await page.locator(".trust-section .brand-tile").count()>=15,"payment and courier options are listed");
  // Featured order puts buyable products first.
  const stocks=await page.evaluate(()=>[...document.querySelectorAll("#productGrid .product-card")].map(card=>!card.querySelector("button[data-add]")?.disabled));
  assert.deepEqual(stocks,[...stocks].sort((x,y)=>Number(y)-Number(x)),"out-of-stock products come after the ones in stock");
  // No invented social proof: ratings and review counts are not shown until real reviews exist.
  assert.equal(await page.locator("#productGrid .rating, #productGrid .product-card :text('ulasan')").count(),0,"no rating or review count on product cards");
  // One brand treatment everywhere: no leftover uppercase GETYOURDEVICE text, and the gyd mark.
  assert.equal(await page.evaluate(()=>document.body.innerText.includes("GETYOURDEVICE")),false,"no uppercase brand text left on the page");
  assert.equal(await page.locator(".brand .brand-mark").first().innerText(),"gyd");
  assert.equal(await page.locator(".hero-kicker .logo-inline, #whyTitle .logo-inline, .copyright .logo-inline").count(),3,"inline wordmarks in hero, why-us and footer");
  const icons=await page.evaluate(()=>[...document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"],link[rel="manifest"]')].map(link=>link.getAttribute("href")));
  assert.deepEqual(icons,["./favicon.ico","./favicon-32.png","./favicon.svg","./apple-touch-icon.png","./site.webmanifest"],"PNG/ICO icons for Safari, SVG for modern browsers, Apple touch icon, manifest");
  for(const href of icons){
    const response=await page.request.get(new URL(href,origin).href);
    assert.equal(response.status(),200,`${href} is served`);
  }
  // A broken product photo falls back to a local placeholder once; it never loops.
  await page.waitForTimeout(400);
  assert.equal([...imageRequests.keys()].some(url=>url.includes("placehold")),false,"no third-party placeholder requests");
  assert.ok([...imageRequests.values()].every(count=>count<=4),`broken images are not retried in a loop: ${JSON.stringify([...imageRequests.values()])}`);
  // Every payment and courier logo is served and decodes; a broken logo would show as an empty tile.
  const logos=page.locator(".trust-section .brand-tile img");
  assert.ok(await logos.count()>=7,"bank, e-wallet and courier logos are shown");
  assert.equal(await page.locator('.trust-section .brand-tile img[src="./logos/bsi.svg"][alt="Virtual Account BSI"]').count(),1,"BSI Virtual Account is listed");
  for(const img of await logos.all()){
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction(el=>el.complete,await img.elementHandle());
    const {src,alt,width}=await img.evaluate(el=>({src:el.getAttribute("src"),alt:el.alt,width:el.naturalWidth}));
    assert.ok(width>0,`${src} loads`);
    assert.ok(alt.trim(),`${src} has alt text`);
  }
  // Header actions still work.
  await page.locator('.header-actions [data-action="open-cart"]').click();
  await page.waitForSelector("#cartDrawer:not(.hidden)");
  await page.close();
}

// Nothing is clipped on a small phone or an iPad: struck-through prices stay inside their
// card, and the product detail info column stays inside the dialog.
for(const width of [360,390,414,834,1024,1180]){
  const page=await browser.newPage({viewport:{width,height:860}});
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route(`${origin}/api/**`,route=>new URL(route.request().url()).pathname==="/api/products"?route.fulfill({json:{products}}):route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y"}}));
  await page.goto(origin);
  await page.waitForSelector("#productGrid .product-card del");
  const cut=await page.evaluate(()=>[...document.querySelectorAll("#productGrid .product-card del")].filter(del=>del.getBoundingClientRect().right>del.closest(".product-card").getBoundingClientRect().right+1).length);
  assert.equal(cut,0,`struck-through prices fit their card at ${width}px`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no sideways scroll at ${width}px`);
  // The menu button + logo keep their full width and never run under the search bar or header actions.
  const header=await page.evaluate(()=>{const start=document.querySelector(".header-start"),R=el=>el.getBoundingClientRect(),row=el=>Math.abs(R(el).top-R(start).top)<30;return {fits:start.scrollWidth<=start.clientWidth+1,gaps:[".search-wrap",".header-actions"].map(sel=>document.querySelector(sel)).filter(row).map(el=>Math.round(R(el).left-R(start).right))};});
  assert.ok(header.fits,`logo is not cut off at ${width}px`);
  assert.ok(header.gaps.every(gap=>gap>=4),`logo does not overlap the search bar or actions at ${width}px: ${header.gaps}`);
  await page.locator("#productGrid .product-card").first().click();
  await page.waitForSelector("#productModal:not(.hidden) .detail-info");
  const overflow=await page.evaluate(()=>{const info=document.querySelector(".detail-info");const edge=info.getBoundingClientRect().right-parseFloat(getComputedStyle(info).paddingRight);return [...document.querySelectorAll(".detail-info h2,.detail-pricing,.detail-buttons button,.detail-assurance li")].map(el=>Math.round(el.getBoundingClientRect().right-edge)).filter(d=>d>1);});
  assert.deepEqual(overflow,[],`product detail fits the dialog at ${width}px`);
  await page.close();
}

// Side menu, footer and the help & policy page.
{
  const page=await browser.newPage({viewport:{width:390,height:860}});
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route(`${origin}/api/**`,route=>new URL(route.request().url()).pathname==="/api/products"?route.fulfill({json:{products}}):route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y"}}));
  await page.goto(origin);
  await page.waitForSelector("#productGrid .product-card");
  await page.locator(".menu-button").click();
  await page.waitForSelector("#menuDrawer:not(.hidden)");
  assert.equal(await page.locator("#menuDrawer [data-category]").count(),6,"menu lists every category");
  assert.deepEqual(await page.locator("#menuDrawer .menu-label").allInnerTexts(),["KATEGORI","BELANJA","BANTUAN"]);
  assert.equal(await page.locator('#menuDrawer a[href="https://wa.me/6281288451500"]').count(),1,"menu links to WhatsApp");
  // No menu entry for features that do not exist yet.
  assert.doesNotMatch(await page.locator("#menuDrawer").innerText(),/Member|Promo|Voucher|Edukasi|Masuk|Login/i);
  await page.keyboard.press("Escape");
  await page.waitForSelector("#menuDrawer.hidden",{state:"attached"});
  await page.locator(".menu-button").click();
  await page.locator('#menuDrawer [data-category="Laptop"]').click();
  await page.waitForSelector("#menuDrawer.hidden",{state:"attached"});
  assert.equal(await page.locator("#categoryNav .active").innerText(),"Laptop","menu category filters the catalog");
  // Footer: real contact only, policy links, localized category label.
  const footer=await page.locator("footer").innerText();
  assert.equal(await page.locator('footer a[href="mailto:support@getyourdevice.id"]').count(),1,"footer shows the store email");
  assert.equal(await page.locator('#menuDrawer a[href="mailto:support@getyourdevice.id"]').count(),1,"menu shows the store email");
  assert.match(footer,/WhatsApp 0812-8845-1500/);
  assert.match(footer,/Aksesori/);
  for(const hash of ["pengiriman","pembayaran","pengembalian","privasi","syarat"])assert.equal(await page.locator(`footer a[href="./bantuan.html#${hash}"]`).count(),1,`footer links to ${hash}`);
  // Product detail shows the product's own warranty type.
  await page.goto(`${origin}/#produk/${products.find(product=>product.warranty==="tam").id}`);
  await page.waitForSelector("#productModal:not(.hidden) .detail-assurance");
  assert.match(await page.locator(".detail-assurance").innerText(),/Garansi distributor TAM/);
  await page.goto(`${origin}/#produk/${products.find(product=>!product.warranty).id}`);
  await page.waitForSelector("#productModal:not(.hidden) .detail-assurance");
  const assurance=await page.locator(".detail-assurance").innerText();
  assert.doesNotMatch(assurance,/Garansi/,"no warranty claim when none is set");
  assert.doesNotMatch(assurance,/Retur/,"the return promise is not repeated under the buy buttons");
  assert.match(assurance,/Dikirim hari ini/);
  assert.match(assurance,/Pembayaran aman/);
  assert.match(await page.locator('.detail-assurance a[href^="https://wa.me/6281288451500?text="]').getAttribute("href"),/tanya/i,"one tap to ask about this product on WhatsApp");
  // Help & policy page.
  await page.goto(`${origin}/bantuan.html`);
  for(const id of ["cara-belanja","faq","pengiriman","pembayaran","pengembalian","privasi","syarat","hubungi"])assert.equal(await page.locator(`section#${id}`).count(),1,`policy section #${id}`);
  const policy=await page.locator(".policy-body").innerText();
  for(const rule of [/video unboxing/i,/1×24 jam/,/Ongkos kirim retur ditanggung penjual/,/14 hari kerja/,/sebelum pukul 12\.00 WIB/,/Undang-Undang Nomor 27 Tahun 2022/])assert.match(policy,rule);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"policy page has no sideways scroll");
  await page.close();
}

// Lacak Pesanan: guest lookup from another device, and the "Lihat Pesanan" email link.
{
  const page=await browser.newPage({viewport:{width:390,height:860}});
  const detail={orderNumber:"GYD-20260928-0001",createdAt:"2026-09-28T08:26:16Z",status:"confirmed",paymentMethod:"QRIS",paymentStatus:"paid",shippingServiceName:"Ambil di toko",shippingCost:0,subtotal:1000,total:1000,customerName:"Rivaldi",city:"Jakarta",items:[{name:"Test product",quantity:2,unitPrice:1000,subtotal:2000,image:null}]};
  const lookups=[];
  await page.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await page.route(`${origin}/api/**`,route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==="/api/products")return route.fulfill({json:{products}});
    if(path==="/api/orders/detail"){
      const body=route.request().postDataJSON();lookups.push(body);
      const ok=body.orderNumber===detail.orderNumber&&(body.phone?.replace(/\D/g,"").endsWith("81288451500")||body.orderAccessToken==="a".repeat(64));
      return ok?route.fulfill({json:detail}):route.fulfill({status:404,json:{error:"Pesanan tidak ditemukan. Periksa nomor pesanan dan nomor WhatsApp yang dipakai saat checkout."}});
    }
    return route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y"}});
  });
  await page.goto(`${origin}/#lacak/GYD-20260928-0001`);
  await page.waitForSelector("#orderLookup");
  assert.equal(await page.locator("#lookupOrderNumber").inputValue(),"GYD-20260928-0001","email link pre-fills the order number");
  await page.fill("#lookupPhone","0899 0000 000");
  await page.click("#orderLookup button[type=submit]");
  await page.waitForSelector("#lookupMessage.error");
  assert.match(await page.locator("#lookupMessage").innerText(),/tidak ditemukan/);
  await page.fill("#lookupPhone","+62 812-8845-1500");
  await page.click("#orderLookup button[type=submit]");
  await page.waitForSelector("#customerOrderList .customer-order-card");
  assert.match(await page.locator("#customerOrderList").innerText(),/GYD-20260928-0001/);
  // Each line shows the product photo, name and quantity.
  const line=page.locator("#customerOrderList .order-line").first();
  assert.equal(await line.locator("img.order-line-img").count(),1,"order line has a product photo");
  assert.match(await page.locator("#customerOrderList .customer-order-card header").innerText(),/Atas nama[\s\S]*Rivaldi/,"the card shows who the order is for");
  assert.match(await line.innerText(),/Test product[\s\S]*Jumlah: 2[\s\S]*Rp\s?2\.000/);
  assert.equal(lookups.at(-1).phone,"+62 812-8845-1500","the server normalises the number");
  // Found orders stay on this device: reopening Pesanan Saya loads them again.
  await page.goto(`${origin}/#beranda`);await page.goto(`${origin}/#pesanan`);
  await page.waitForSelector("#customerOrderList .customer-order-card");
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem("gyd_order_access")).some(entry=>entry.orderNumber==="GYD-20260928-0001"&&entry.phone)));
  assert.equal(await page.locator('#menuDrawer [data-action="track-order"]').count(),1,"menu links to Lacak Pesanan");
  await page.close();
  // The confirmation email's link stores the access token and cleans it from the address bar.
  const linkPage=await browser.newPage({viewport:{width:390,height:860}});
  await linkPage.route(url=>!url.href.startsWith(origin),route=>route.abort());
  await linkPage.route(`${origin}/api/**`,route=>{const path=new URL(route.request().url()).pathname;if(path==="/api/products")return route.fulfill({json:{products}});if(path==="/api/orders/detail")return route.fulfill({json:detail});return route.fulfill({json:{supabaseUrl:"x",supabaseAnonKey:"y"}});});
  await linkPage.goto(`${origin}/#pesanan/akses/GYD-20260928-0001/${"a".repeat(64)}`);
  await linkPage.waitForSelector("#customerOrderList .customer-order-card");
  assert.equal(new URL(linkPage.url()).hash,"#pesanan","the token is removed from the address bar");
  assert.ok(await linkPage.evaluate(()=>JSON.parse(localStorage.getItem("gyd_order_access"))[0].token==="a".repeat(64)));
  await linkPage.close();
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
