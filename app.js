"use strict";

const CATEGORIES = ["Smartphone", "Laptop", "Tablet", "Smartwatch", "Audio", "Accessories"];
const CATEGORY_ICONS = { Smartphone: "📱", Laptop: "💻", Tablet: "▤", Smartwatch: "⌚", Audio: "🎧", Accessories: "⌨" };
const CATEGORY_IMAGES = {
  Smartphone: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=500&q=85",
  Laptop: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=500&q=85",
  Tablet: "https://images.unsplash.com/photo-1561154464-82e9adf32764?auto=format&fit=crop&w=500&q=85",
  Smartwatch: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=85",
  Audio: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=500&q=85",
  Accessories: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=500&q=85"
};
// Local placeholder for product photos that fail to load. It never fails itself, and the
// onerror handler clears itself, so a broken image cannot trigger a request loop.
const IMAGE_FALLBACK = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700" viewBox="0 0 700 700"><rect width="700" height="700" fill="#f5f5f7"/><path d="M290 250h120a18 18 0 0 1 18 18v164a18 18 0 0 1-18 18H290a18 18 0 0 1-18-18V268a18 18 0 0 1 18-18z" fill="none" stroke="#c7c7cc" stroke-width="8"/><circle cx="350" cy="420" r="8" fill="#c7c7cc"/></svg>');
const ORDER_STATUSES = ["Pending", "Paid", "Processing", "Shipped", "Completed", "Cancelled"];
const CHECKOUT_STEPS = ["Pelanggan", "Alamat", "Pengiriman", "Pembayaran", "Tinjau"];
const starterProducts = [
  {id:"00000000-0000-4000-8000-000000000002",brand:"Samsung",name:"Galaxy A56 5G",spec:"8 GB / 256 GB · Kamera 50 MP",price:6199000,originalPrice:6799000,rating:4.8,stock:14,category:"Smartphone",description:"Layar Super AMOLED jernih, kamera 50 MP, dan baterai tahan lama.",needs:["Komunikasi","Hiburan"],badge:"TERLARIS",image:"https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000003",brand:"ASUS",name:"Vivobook 14",spec:"Intel Core i5 · 16 GB · 512 GB SSD",price:8999000,originalPrice:9499000,rating:4.7,stock:8,category:"Laptop",description:"Laptop tipis untuk bekerja dan belajar dengan layar 14 inci.",needs:["Produktivitas","Hiburan"],badge:"PILIHAN",image:"https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000004",brand:"Samsung",name:"Galaxy Tab S9 FE",spec:"10,9 inci · 6 GB / 128 GB · S Pen",price:6499000,rating:4.8,stock:10,category:"Tablet",description:"Tablet serbaguna dengan S Pen untuk catatan, kreasi, dan hiburan.",needs:["Produktivitas","Hiburan"],image:"https://images.unsplash.com/photo-1561154464-82e9adf32764?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000005",brand:"Samsung",name:"Galaxy Watch7",spec:"Bluetooth · 40 mm · GPS",price:3999000,rating:4.7,stock:6,category:"Smartwatch",description:"Pantau aktivitas, tidur, dan kesehatan langsung dari pergelangan.",needs:["Kesehatan"],badge:"BARU",image:"https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000006",brand:"Sony",name:"WH-CH720N",spec:"Wireless · Noise Cancelling · 35 jam",price:1699000,originalPrice:1999000,rating:4.9,stock:18,category:"Audio",description:"Headphone nirkabel ringan dengan peredam bising aktif.",needs:["Hiburan","Produktivitas"],image:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000007",brand:"Logitech",name:"Pebble 2 Combo",spec:"Bluetooth · Multi-device · Silent keys",price:949000,rating:4.7,stock:22,category:"Accessories",description:"Keyboard dan mouse ringkas, senyap, dan mudah dibawa.",needs:["Produktivitas"],image:"https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000008",brand:"Apple",name:"iPhone 15 128GB",spec:"128 GB · Kamera 48 MP · USB-C",price:12999000,originalPrice:13999000,rating:4.9,stock:5,category:"Smartphone",description:"Performa cepat, kamera andal, dan desain yang nyaman digunakan.",needs:["Komunikasi","Hiburan"],image:"https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000009",brand:"Apple",name:"MacBook Air M3",spec:"Apple M3 · 8 GB · 256 GB SSD",price:17999000,rating:4.9,stock:4,category:"Laptop",description:"Ringan, senyap, dan bertenaga untuk produktivitas sepanjang hari.",needs:["Produktivitas"],badge:"PREMIUM",image:"https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000010",brand:"JBL",name:"Flip 6",spec:"Bluetooth · Tahan air IP67 · 12 jam",price:1999000,rating:4.8,stock:0,category:"Audio",description:"Speaker portabel tahan air dengan suara kuat dan jernih.",needs:["Hiburan"],image:"https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=700&q=80"},
  {id:"00000000-0000-4000-8000-000000000011",brand:"Anker",name:"PowerCore 20K",spec:"20.000 mAh · Fast charging · USB-C",price:799000,rating:4.8,stock:31,category:"Accessories",description:"Power bank kapasitas besar dengan pengisian cepat dan aman.",needs:["Komunikasi","Produktivitas"],image:"https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=700&q=80"}
];

const storage = {
  get(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast("Penyimpanan browser penuh. Hapus beberapa foto produk.", "error"); } }
};
let products = starterProducts;
let cart = storage.get("gyd_cart", storage.get("nc_cart", []));
// Session copy is used for immediate UX; durable customer order access uses capability tokens below.
let orders = [];
let orderAccessRecords = storage.get("gyd_order_access", []);
if(!Array.isArray(orderAccessRecords)) orderAccessRecords=[];
let customerOrderCache = new Map();
const PAYMENT_POLL_SECONDS = 8;
let paymentSession = null;
const VA_BANK_NAMES = {bni:"BNI",bri:"BRI",mandiri:"Mandiri",permata:"Permata",cimb:"CIMB Niaga"};
const QRIS_MAX_AMOUNT = 10000000;
// Public checkout config from /api/config: which methods and VA banks are live.
let checkoutConfig = null;
let activeCategory = "Semua";
let recommendation = null;
let detailProductId = null;
let detailQuantity = 1;
let checkoutStep = 1;
let checkoutSubmitting = false;
let checkoutIdempotencyKey = (()=>{try{return sessionStorage.getItem("gyd_checkout_idempotency_key");}catch{return null;}})();
let shippingQuotes = [];
let shippingQuotesLoading = false;
let shippingRatesLive = false;
let shippingRateNotice = "";
let toastTimer;
let appReady = false;
let applyingRoute = false;
let routeEventQueued = false;

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const safeImage = (value) => /^(https?:\/\/|data:image\/)/.test(value || "") ? value : IMAGE_FALLBACK;

function migrateLegacyProducts() {
  const old = storage.get("nc_products", null);
  if (!old?.length) return null;
  return old.map(product => ({ ...product, category: CATEGORIES.includes(product.category) ? product.category : "Accessories", needs: product.needs || ["Produktivitas"] }));
}
function persist() { storage.set("gyd_cart", cart); updateCartCount(); }
function generateCheckoutIdempotencyKey(){
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join("");
}
function ensureCheckoutIdempotencyKey(){
  if(!/^[a-f0-9]{64}$/i.test(String(checkoutIdempotencyKey||""))){
    checkoutIdempotencyKey=generateCheckoutIdempotencyKey();
    try{sessionStorage.setItem("gyd_checkout_idempotency_key",checkoutIdempotencyKey);}catch{}
  }
  return checkoutIdempotencyKey;
}
function clearCheckoutIdempotencyKey(){
  checkoutIdempotencyKey=null;
  try{sessionStorage.removeItem("gyd_checkout_idempotency_key");}catch{}
}
// The payment token lets this browser request a (new) QRIS until the 24-hour payment
// window closes; the server still verifies it on every request.
function rememberOrderAccess(orderNumber,token,paymentToken,bank){
  if(!/^GYD-\d{8}-\d{4,}$/.test(String(orderNumber||""))||!/^[a-f0-9]{64}$/i.test(String(token||"")))return;
  const record={orderNumber,token,savedAt:new Date().toISOString()};
  if(/^[a-f0-9]{64}$/i.test(String(paymentToken||"")))record.paymentToken=paymentToken;
  if(Object.hasOwn(VA_BANK_NAMES,bank||""))record.bank=bank;
  orderAccessRecords=[record,...orderAccessRecords.filter(entry=>entry?.orderNumber!==orderNumber)].slice(0,20);
  storage.set("gyd_order_access",orderAccessRecords);
}
async function fetchCustomerOrderAccess(entry){
  const response=await fetch("/api/orders/detail",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({orderNumber:entry.orderNumber,orderAccessToken:entry.token})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||"Pesanan belum dapat dimuat."),{status:response.status});
  return data;
}
function mapProduct(row) {
  const specifications = row.specifications;
  const spec = typeof specifications === "string" ? specifications : Array.isArray(specifications) ? specifications.join(" · ") : specifications?.summary || (specifications && typeof specifications === "object" ? Object.entries(specifications).map(([key,value]) => `${key}: ${value}`).join(" · ") : "");
  return { id:String(row.id), name:row.name, brand:row.brand || "", category:row.category || "Accessories", description:row.description || "", spec, price:Number(row.price), originalPrice:row.original_price == null ? null : Number(row.original_price), stock:Number(row.stock || 0), image:row.image_url || "", rating:Number(row.rating || 0), isActive:row.is_active !== false, needs: categoryNeeds(row.category) };
}
function categoryNeeds(category) { return ({Smartphone:["Komunikasi","Hiburan"],Laptop:["Produktivitas","Hiburan"],Tablet:["Produktivitas","Hiburan"],Smartwatch:["Kesehatan"],Audio:["Hiburan"],Accessories:["Produktivitas"]})[category] || ["Produktivitas"]; }
async function loadProducts() {
  const resultText = $("resultText");
  const productGrid = $("productGrid");
  if (!resultText || !productGrid) throw new Error("Elemen katalog utama tidak tersedia.");
  resultText.textContent = "Memuat produk dari database…";
  productGrid.innerHTML = '<div class="empty-state"><span class="state-icon">…</span><h3>Memuat produk</h3><p>Mohon tunggu sebentar.</p></div>';
  try {
    const response = await fetch("/api/products", { headers:{ Accept:"application/json" } });
    if (!response.ok) throw new Error((await response.json().catch(()=>null))?.error || "Produk tidak dapat dimuat");
    const payload = await response.json();
    if (!Array.isArray(payload?.products)) throw new Error("Format katalog produk tidak valid.");
    products = payload.products.map(mapProduct).filter(product => product.isActive);
    if (!products.length) throw new Error("Katalog Supabase masih kosong. Jalankan berkas seed SQL.");
  } catch (error) {
    console.error("Supabase product load failed; showing built-in fallback.", error);
    products = [...starterProducts];
    resultText.textContent = "Katalog demo sementara — koneksi database bermasalah.";
    try { showToast("Database belum dapat dihubungi. Menampilkan katalog demo sementara."); } catch (toastError) { console.error("Fallback notification failed", toastError); }
  }
  validCart();
  renderProducts();
  try { persist(); } catch (error) { console.error("Cart initialization failed", error); }
  try { renderShowcases(); } catch (error) { console.error("Optional product showcases failed", error); }
}
function showToast(message) { clearTimeout(toastTimer); $("toast").textContent = message; $("toast").classList.remove("hidden"); toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 2600); }
function updateCartCount() { const count = cart.reduce((sum, item) => sum + item.qty, 0); $("cartCount").textContent = count; $("cartCount").setAttribute("aria-label", `${count} item`); }
function setModal(id, open) { const element = $(id); element.classList.toggle("hidden", !open); element.setAttribute("aria-hidden", String(!open)); document.body.style.overflow = document.querySelector(".modal:not(.hidden), .overlay:not(.hidden)") ? "hidden" : ""; if (open) setTimeout(() => element.querySelector("button, input, select")?.focus(), 0); }

function routeParts() {
  // Midtrans Snap may append "?order_id=...&transaction_status=..." to the finish URL.
  const raw=String(location.hash||"").replace(/^#\/?/,"").replace(/\?.*$/,"");
  if(!raw)return ["beranda"];
  return raw.split("/").filter(Boolean).map(part=>{try{return decodeURIComponent(part);}catch{return part;}});
}
function routeHash(route="beranda") {
  return "#"+String(route||"beranda").replace(/^#\/?/,"").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
function navigateRoute(route="beranda",{replace=false}={}) {
  const target=routeHash(route);
  if(location.hash===target){if(appReady)applyRoute(false);return;}
  if(replace)history.replaceState(null,"",target);else history.pushState(null,"",target);
  if(appReady)applyRoute(false);
}
function closeStoreModals() {
  stopPaymentPolling(); paymentSession=null;
  ["cartDrawer","checkoutModal","productModal","helperModal","successModal","paymentModal"].forEach(id=>setModal(id,false));
}
function showStoreBase() {
  $("storeView").classList.remove("hidden");
  $("adminView").classList.add("hidden");
  $("customerOrdersView").classList.add("hidden");
}
function showOrdersBase() {
  $("storeView").classList.add("hidden");
  $("adminView").classList.add("hidden");
  $("customerOrdersView").classList.remove("hidden");
}
function queueRouteApply() {
  if(routeEventQueued)return;
  routeEventQueued=true;
  queueMicrotask(()=>{routeEventQueued=false;applyRoute(false);});
}
function applyRoute(initial=false) {
  if(!appReady||applyingRoute)return;
  applyingRoute=true;
  try{
    closeStoreModals();
    const parts=routeParts(),root=(parts[0]||"beranda").toLowerCase();
    if(root==="pesanan"){
      showOrdersBase();
      renderCustomerOrders();
      if(!initial)window.scrollTo({top:0,behavior:"smooth"});
      return;
    }

    showStoreBase();

    if(root==="kategori"){
      const category=parts[1];
      if(!CATEGORIES.includes(category)){
        history.replaceState(null,"",routeHash("produk"));
        activeCategory="Semua";recommendation=null;buildNavigation();renderProducts();
      }else{
        activeCategory=category;recommendation=null;$("searchInput").value="";buildNavigation();renderProducts();
      }
      setTimeout(()=>$("productsSection")?.scrollIntoView({behavior:initial?"auto":"smooth"}),0);
      return;
    }

    if(root==="produk"&&parts[1]){
      activeCategory="Semua";buildNavigation();renderProducts();
      if(!products.some(product=>product.id===parts[1])){
        history.replaceState(null,"",routeHash("produk"));
        setTimeout(()=>$("productsSection")?.scrollIntoView({behavior:initial?"auto":"smooth"}),0);
      }else openProductDetail(parts[1],false);
      return;
    }

    if(root==="produk"){
      activeCategory="Semua";buildNavigation();renderProducts();
      setTimeout(()=>$("productsSection")?.scrollIntoView({behavior:initial?"auto":"smooth"}),0);
      return;
    }

    if(root==="keranjang"){
      openCart(false);
      return;
    }

    if(root==="checkout"){
      if(cart.length)startCheckout(false);
      else{
        history.replaceState(null,"",routeHash("keranjang"));
        openCart(false);
        showToast("Keranjang masih kosong.");
      }
      return;
    }

    if(root==="bantu-pilih"){
      setModal("helperModal",true);
      return;
    }

    if(root!=="beranda")history.replaceState(null,"",routeHash("beranda"));
    activeCategory="Semua";recommendation=null;$("searchInput").value="";buildNavigation();renderShowcases();renderProducts();
    if(!initial)window.scrollTo({top:0,behavior:"smooth"});
  }finally{applyingRoute=false;}
}

function buildNavigation() {
  $("categoryNav").innerHTML = ["Semua", ...CATEGORIES].map(category => `<button type="button" data-category="${category}" class="${category === activeCategory ? "active" : ""}">${category === "Semua" ? "Semua Produk" : category}</button>`).join("");
  $("categoryCards").innerHTML = CATEGORIES.map(category => `<button type="button" class="category-card" data-category="${category}"><span class="category-image"><img src="${CATEGORY_IMAGES[category]}" alt="" loading="lazy"></span><strong>${category}</strong><small>Lihat koleksi</small></button>`).join("");
  $("productCategory").innerHTML = CATEGORIES.map(category => `<option>${category}</option>`).join("");
}
function productCard(product, compact = false) {
  const out = product.stock <= 0, low = product.stock > 0 && product.stock <= 5;
  return `<article class="product-card ${compact ? "showcase-card" : ""}" data-product="${escapeHTML(product.id)}" tabindex="0" aria-label="Lihat detail ${escapeHTML(product.name)}"><div class="product-image-wrap"><img class="product-img" src="${safeImage(product.image)}" alt="${escapeHTML(product.name)}" width="700" height="700" loading="lazy" onerror="this.onerror=null;this.src='${IMAGE_FALLBACK}'">${product.badge ? `<span class="product-badge">${escapeHTML(product.badge)}</span>` : ""}<span class="view-detail">Lihat detail</span></div><div class="product-info"><span class="product-brand">${escapeHTML(product.brand || product.category)}</span><h3>${escapeHTML(product.name)}</h3><p class="product-spec">${escapeHTML(product.spec || product.description)}</p><div class="price-row"><div class="price">${money(product.price)}</div>${product.originalPrice ? `<del>${money(product.originalPrice)}</del>` : ""}</div><span class="stock ${out ? "out" : low ? "low" : ""}">${out ? "Stok habis" : low ? `Tersisa ${product.stock} unit` : "Stok tersedia"}</span><div class="product-actions"><button class="secondary" type="button" data-buy="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>Beli Sekarang</button><button class="primary" type="button" data-add="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>+ Keranjang</button></div></div></article>`;
}
function storyCard(product, index = 0) {
  const out = product.stock <= 0;
  return `<article class="story-card story-card-${index + 1}" data-product="${escapeHTML(product.id)}" tabindex="0" aria-label="Lihat detail ${escapeHTML(product.name)}"><div class="story-image"><img src="${safeImage(product.image)}" alt="${escapeHTML(product.name)}" width="900" height="900" loading="lazy"></div><div class="story-card-copy"><span>${escapeHTML(product.brand || product.category)}</span><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.spec || product.description)}</p><strong>${money(product.price)}</strong><div class="story-actions"><button class="story-buy" type="button" data-buy="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>Beli Sekarang</button><button class="story-cart" type="button" data-add="${escapeHTML(product.id)}" ${out ? "disabled" : ""} aria-label="Tambahkan ${escapeHTML(product.name)} ke keranjang">+</button></div></div></article>`;
}
// Slowly scrolling strip of in-stock products under the hero. The list is rendered twice
// so the CSS loop (translateX -50%) is seamless; the copy is hidden from assistive tech.
function renderHeroMarquee() {
  const track = $("heroMarquee");
  if (!track) return;
  const items = products.filter(product => product.stock > 0 && product.image).slice(0, 10);
  if (items.length < 3) { track.closest(".hero-marquee")?.classList.add("hidden"); return; }
  const card = (product, hidden) => `<button type="button" class="marquee-item" data-view-product="${escapeHTML(product.id)}" ${hidden ? 'tabindex="-1" aria-hidden="true"' : ""}><img src="${safeImage(product.image)}" alt="" width="96" height="96" loading="lazy"><span><strong>${escapeHTML(product.name)}</strong><small>${money(product.price)}</small></span></button>`;
  track.innerHTML = items.map(product => card(product, false)).join("") + items.map(product => card(product, true)).join("");
  track.style.setProperty("--marquee-duration", `${Math.max(24, items.length * 6)}s`);
}
function renderShowcases() {
  renderHeroMarquee();
  const phones = products.filter(product => product.category === "Smartphone").slice(0, 4);
  const popular = [...products].filter(product => product.stock > 0).sort((a,b) => (b.rating || 4.7) - (a.rating || 4.7)).slice(0, 4);
  $("smartphoneShowcase").innerHTML = phones.map((product,index) => storyCard(product,index)).join("");
  $("popularShowcase").innerHTML = popular.map((product,index) => storyCard(product,index)).join("");
}
function filteredProducts() {
  const query = $("searchInput").value.trim().toLowerCase();
  let result = products.filter(product => (activeCategory === "Semua" || product.category === activeCategory) && `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query));
  if (recommendation) result = result.filter(product => Number(product.price) <= recommendation.budget && (product.needs || []).includes(recommendation.need));
  const sort = $("sortSelect").value;
  if (sort === "low") result.sort((a,b) => a.price-b.price); else if (sort === "high") result.sort((a,b) => b.price-a.price); else if (sort === "name") result.sort((a,b) => a.name.localeCompare(b.name));
  else result.sort((a,b) => Number(b.stock > 0) - Number(a.stock > 0)); // featured: buyable products first, catalog order otherwise
  return result;
}
function renderProducts() {
  try {
    if (!products.length) {
      $("resultText").textContent = "Katalog belum tersedia.";
      $("productGrid").innerHTML = '<div class="error-state"><span class="state-icon">!</span><h3>Katalog belum dapat dimuat</h3><p>Silakan muat kembali halaman beberapa saat lagi.</p><button class="secondary" type="button" onclick="location.reload()">Muat Ulang</button></div>';
      return;
    }
    const result = filteredProducts();
    const query = $("searchInput").value.trim();
    $("resultText").textContent = recommendation ? `${result.length} pilihan untuk kebutuhan ${recommendation.need.toLowerCase()} sesuai anggaran Anda.` : query || activeCategory !== "Semua" ? `${result.length} produk ditemukan.` : "Produk gadget terbaik dan paling dicari.";
    if (!result.length) { $("productGrid").innerHTML = `<div class="empty-state"><span class="state-icon">⌕</span><h3>Produk belum ditemukan</h3><p>Coba kata pencarian, kategori, atau anggaran yang berbeda.</p><button class="secondary" type="button" data-action="reset-filter">Tampilkan Semua Produk</button></div>`; return; }
    $("productGrid").innerHTML = result.map(product => productCard(product)).join("");
  } catch (error) { console.error(error); $("productGrid").innerHTML = `<div class="error-state"><span class="state-icon">!</span><h3>Produk gagal ditampilkan</h3><p>Silakan coba muat kembali halaman.</p><button class="secondary" type="button" onclick="location.reload()">Muat Ulang</button></div>`; }
}
function selectCategory(category) { if(category==="Semua")navigateRoute("produk");else navigateRoute(`kategori/${category}`); }
function resetFilters() { activeCategory = "Semua"; recommendation = null; $("searchInput").value = ""; $("sortSelect").value = "featured"; navigateRoute("produk"); }

function addToCart(id, openAfter = false, quantity = 1) {
  const product = products.find(item => item.id === id); if (!product || product.stock <= 0) { showToast("Maaf, stok produk sedang habis."); return false; }
  const item = cart.find(entry => entry.id === id);
  const available = product.stock - (item?.qty || 0);
  if (available <= 0) { showToast("Jumlah sudah mencapai stok yang tersedia."); return false; }
  const added = Math.min(Math.max(1, quantity), available);
  item ? item.qty += added : cart.push({ id, qty: added }); persist(); renderCart(); showToast(`${added} × ${product.name} ditambahkan ke keranjang.`); if (openAfter) openCart(); return true;
}
function validCart() { cart = cart.filter(item => { const product = products.find(entry => entry.id === item.id); if (!product || product.stock <= 0 || item.qty <= 0) return false; item.qty = Math.min(item.qty, product.stock); return true; }); return cart; }
function cartSubtotal() { return validCart().reduce((sum, item) => { const product = products.find(entry => entry.id === item.id); return sum + product.price * item.qty; }, 0); }
function renderCart() {
  validCart();
  if (!cart.length) $("cartItems").innerHTML = `<div class="empty-state"><span class="state-icon">🛒</span><h3>Keranjang masih kosong</h3><p>Produk yang Anda pilih akan muncul di sini.</p><button class="secondary" type="button" data-action="close-cart">Mulai Belanja</button></div>`;
  else $("cartItems").innerHTML = cart.map(item => { const product = products.find(entry => entry.id === item.id); return `<div class="cart-row"><button class="cart-product-image" type="button" data-view-product="${escapeHTML(item.id)}" aria-label="Lihat ${escapeHTML(product.name)}"><img src="${safeImage(product.image)}" alt=""></button><div><button class="cart-product-name" type="button" data-view-product="${escapeHTML(item.id)}">${escapeHTML(product.name)}</button><div class="item-price">${money(product.price)}</div><small class="cart-stock">${item.qty === product.stock ? "Jumlah maksimum sesuai stok" : `${product.stock} unit tersedia`}</small><button class="remove-item" type="button" data-remove="${escapeHTML(item.id)}">Hapus</button></div><div class="qty-control" aria-label="Jumlah ${escapeHTML(product.name)}"><button type="button" data-qty="${escapeHTML(item.id)}" data-delta="-1" aria-label="Kurangi jumlah">−</button><span>${item.qty}</span><button type="button" data-qty="${escapeHTML(item.id)}" data-delta="1" aria-label="Tambah jumlah" ${item.qty >= product.stock ? "disabled" : ""}>+</button></div></div>`; }).join("");
  const totalItems = cart.reduce((sum,item) => sum + item.qty, 0); $("cartItemTotal").textContent = `${totalItems} item`; $("cartTotal").textContent = money(cartSubtotal()); $("checkoutButton").disabled = !cart.length; persist();
}
function changeQty(id, delta) { const item = cart.find(entry => entry.id === id), product = products.find(entry => entry.id === id); if (!item || !product) return; if (delta > 0 && item.qty >= product.stock) return showToast("Jumlah sudah mencapai stok yang tersedia."); item.qty += delta; if (item.qty <= 0) cart = cart.filter(entry => entry.id !== id); persist(); renderCart(); }
function openCart(updateRoute=true) { if(updateRoute){navigateRoute("keranjang");return;} renderCart(); setModal("cartDrawer", true); }

function renderProductDetail() {
  const product = products.find(item => item.id === detailProductId); if (!product) return;
  const out = product.stock <= 0;
  const specs = (product.spec || product.description).split("·").map(spec => spec.trim()).filter(Boolean);
  const discount = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  $("productDetail").innerHTML = `<div class="product-detail-layout"><div class="detail-gallery"><img src="${safeImage(product.image)}" alt="${escapeHTML(product.name)}" width="1000" height="1000"><div class="detail-image-note">Foto produk dapat berbeda menurut varian.</div></div><div class="detail-info"><span class="product-brand">${escapeHTML(product.brand || product.category)}</span><h2 id="detailName">${escapeHTML(product.name)}</h2><div class="detail-pricing"><strong>${money(product.price)}</strong>${product.originalPrice ? `<del>${money(product.originalPrice)}</del><span>Hemat ${discount}%</span>` : ""}</div><p class="detail-stock ${out ? "out" : ""}">${out ? "Stok sedang habis" : `✓ Stok tersedia — ${product.stock} unit`}</p><div class="detail-specs"><h3>Spesifikasi utama</h3><ul>${specs.map(spec => `<li>${escapeHTML(spec)}</li>`).join("")}</ul></div><div class="detail-description"><h3>Tentang produk</h3><p>${escapeHTML(product.description)}</p></div><div class="detail-purchase"><div><label for="detailQuantity">Jumlah</label><div class="detail-qty"><button type="button" data-detail-qty="-1" aria-label="Kurangi jumlah">−</button><input id="detailQuantity" value="${detailQuantity}" readonly aria-label="Jumlah produk"><button type="button" data-detail-qty="1" aria-label="Tambah jumlah" ${detailQuantity >= product.stock ? "disabled" : ""}>+</button></div></div><div class="detail-buttons"><button class="secondary" type="button" data-detail-add ${out ? "disabled" : ""}>Tambah ke Keranjang</button><button class="primary" type="button" data-detail-buy ${out ? "disabled" : ""}>Beli Sekarang</button></div></div><div class="detail-assurance"><span>✓ Garansi resmi</span><span>✓ Pengiriman terlindungi</span><span>✓ 7 hari pengembalian</span></div></div></div>`;
  const related = products.filter(item => item.id !== product.id && (item.category === product.category || (item.needs || []).some(need => (product.needs || []).includes(need)))).slice(0,3);
  $("relatedProducts").innerHTML = related.map(item => `<button class="related-card" type="button" data-view-product="${escapeHTML(item.id)}"><img src="${safeImage(item.image)}" alt="" width="300" height="300" loading="lazy"><span><small>${escapeHTML(item.brand || item.category)}</small><strong>${escapeHTML(item.name)}</strong><b>${money(item.price)}</b></span></button>`).join("");
}
function openProductDetail(id,updateRoute=true) { if (!products.some(product => product.id === id)) return; if(updateRoute){navigateRoute(`produk/${id}`);return;} detailProductId=id; detailQuantity=1; renderProductDetail(); setModal("cartDrawer",false); setModal("productModal",true); }
function changeDetailQuantity(delta) { const product=products.find(item=>item.id===detailProductId); if(!product)return; detailQuantity=Math.max(1,Math.min(product.stock,detailQuantity+delta)); renderProductDetail(); }
function addDetailToCart(buyNow=false) { const product=products.find(item=>item.id===detailProductId); if(!product||!addToCart(product.id,false,detailQuantity))return; setModal("productModal",false); if(buyNow) startCheckout(); else openCart(); }

function shippingEta(option) {
  if(option.etaMinDays===0&&option.etaMaxDays===0)return "Siap diambil";
  if(option.etaMinDays===0&&option.etaMaxDays===1)return "Hari ini / maksimal 1 hari";
  if(option.etaMinDays===option.etaMaxDays)return `Estimasi ${option.etaMinDays} hari kerja`;
  return `Estimasi ${option.etaMinDays}–${option.etaMaxDays} hari kerja`;
}
function renderShippingOptions() {
  if(shippingQuotesLoading){
    $("shippingOptions").innerHTML='<div class="loading-shipping">Menghitung opsi pengiriman…</div>';
    return;
  }
  if(!shippingQuotes.length){
    $("shippingOptions").innerHTML='<div class="loading-shipping">Lengkapi alamat untuk memuat opsi pengiriman.</div>';
    return;
  }
  const notice=shippingRatesLive?'<div class="shipping-rate-source">Tarif kurir live via Biteship.</div>':shippingRateNotice?`<div class="shipping-rate-source fallback">${escapeHTML(shippingRateNotice)}</div>`:"";
  $("shippingOptions").innerHTML=notice+shippingQuotes.map((option,index)=>`<label class="choice"><input type="radio" name="shipping" value="${escapeHTML(option.quoteId)}" ${index===0?"checked":""}><span><strong>${escapeHTML(option.name)} — ${option.price?money(option.price):"Gratis"}</strong><small>${escapeHTML(shippingEta(option))}. Tarif dikunci selama 30 menit.</small></span></label>`).join("");
}
async function loadShippingQuotes() {
  shippingQuotesLoading=true;renderShippingOptions();
  try{
    const response=await fetch("/api/shipping/quotes",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({city:$("custCity").value.trim(),postalCode:$("custPostal").value.trim(),items:cart.map(item=>({productId:item.id,quantity:item.qty}))})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"Opsi pengiriman belum dapat dimuat.");
    if(!Array.isArray(result.quotes)||!result.quotes.length)throw new Error("Opsi pengiriman belum tersedia.");
    shippingQuotes=result.quotes;
    shippingRatesLive=Boolean(result.liveRates);
    shippingRateNotice=result.missingShippingSpecs?.length?`Tarif fallback dipakai karena data berat/dimensi belum lengkap untuk: ${result.missingShippingSpecs.join(", ")}.`:(result.rateWarning||"");
  }finally{
    shippingQuotesLoading=false;renderShippingOptions();updateCheckoutTotal();
  }
}
function renderCheckout() {
  shippingQuotes=[];shippingQuotesLoading=false;shippingRatesLive=false;shippingRateNotice="";renderShippingOptions();
  $("checkoutSummary").innerHTML = cart.map(item => { const product = products.find(entry => entry.id === item.id); if (!product) return ""; return `<div class="summary-item"><span>${escapeHTML(product.name)}<small>${item.qty} × ${money(product.price)}</small></span><strong>${money(product.price * item.qty)}</strong></div>`; }).join("");
  checkoutStep=1; checkoutSubmitting=false; clearFieldErrors(); renderCheckoutStep(); updateCheckoutTotal();
}
function selectedShipping() {
  const quoteId=document.querySelector("input[name='shipping']:checked")?.value;
  return shippingQuotes.find(option=>option.quoteId===quoteId)||shippingQuotes[0]||null;
}
function checkoutTotals() { const subtotal=cart.reduce((sum,item)=>{const product=products.find(entry=>entry.id===item.id);return sum+(product?(product.originalPrice||product.price)*item.qty:0);},0); const payable=cartSubtotal(); const discount=Math.max(0,subtotal-payable); const shipping=selectedShipping(); const shippingPrice=shipping?.price||0; return {subtotal,discount,payable,shipping,total:payable+shippingPrice}; }
function updateCheckoutTotal() { const totals=checkoutTotals(); $("summarySubtotal").textContent=money(totals.subtotal); $("summaryDiscount").textContent=totals.discount?`−${money(totals.discount)}`:"Rp0"; $("summaryShipping").textContent=totals.shipping?(totals.shipping.price?money(totals.shipping.price):"Gratis"):"—"; $("summaryTotal").textContent=money(totals.total); applyPaymentAvailability(); if(checkoutStep===5)renderFinalReview(); }
function renderCheckoutStep() { document.querySelectorAll("[data-checkout-step]").forEach(section=>section.classList.toggle("hidden",Number(section.dataset.checkoutStep)!==checkoutStep)); $("checkoutProgress").innerHTML=CHECKOUT_STEPS.map((label,index)=>`<span class="${index+1===checkoutStep?"active":index+1<checkoutStep?"done":""}"><b>${index+1<checkoutStep?"✓":index+1}</b><small>${label}</small></span>`).join(""); $("checkoutBack").classList.toggle("hidden",checkoutStep===1); $("checkoutNext").classList.toggle("hidden",checkoutStep===5); $("checkoutSubmit").classList.toggle("hidden",checkoutStep!==5); $("checkoutError").classList.add("hidden"); if(checkoutStep===5)renderFinalReview(); }
function normalizePhone(value) { const trimmed=String(value||"").trim().replace(/[\s().-]/g,""); if(/^08\d{8,11}$/.test(trimmed))return `62${trimmed.slice(1)}`; if(/^\+?62\d{8,12}$/.test(trimmed))return trimmed.replace(/^\+/,""); return trimmed; }
function clearFieldErrors() { document.querySelectorAll("[data-field-error]").forEach(node=>node.textContent=""); document.querySelectorAll("#checkoutForm [aria-invalid]").forEach(node=>node.removeAttribute("aria-invalid")); }
function checkoutFieldErrors(step) {
  const errors={};
  if(step===1){
    const values={custName:$("custName").value.trim(),custPhone:$("custPhone").value.trim(),custEmail:$("custEmail").value.trim()};
    if(values.custName.length<3)errors.custName="Nama lengkap minimal 3 karakter.";
    if(!/^\+?\d{9,15}$/.test(normalizePhone(values.custPhone)))errors.custPhone="Masukkan nomor WhatsApp yang valid, misalnya 0812… atau +62812…";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.custEmail))errors.custEmail="Masukkan alamat email yang valid.";
  }
  if(step===2){
    const values={custAddress:$("custAddress").value.trim(),custCity:$("custCity").value.trim(),custPostal:$("custPostal").value.trim()};
    if(values.custAddress.length<10)errors.custAddress="Alamat lengkap minimal 10 karakter.";
    if(values.custCity.length<2)errors.custCity="Kota / Kabupaten wajib diisi.";
    if(!/^\d{5}$/.test(values.custPostal))errors.custPostal="Kode pos Indonesia harus terdiri dari 5 angka.";
  }
  return errors;
}
function validateCheckoutStep() { clearFieldErrors(); const section=document.querySelector(`[data-checkout-step="${checkoutStep}"]`); const errors=Object.entries(checkoutFieldErrors(checkoutStep)); for(const [id,message] of errors){document.querySelector(`[data-field-error="${id}"]`).textContent=message;$(id).setAttribute("aria-invalid","true");} const invalid=errors[0]?.[0]&&$(errors[0][0]); if(invalid){$("checkoutError").textContent="Periksa kembali data yang ditandai.";$("checkoutError").classList.remove("hidden");invalid.focus();return false;} const nativeInvalid=[...section.querySelectorAll("input,textarea,select")].find(field=>!field.checkValidity()); if(nativeInvalid){$("checkoutError").textContent="Lengkapi pilihan wajib sebelum melanjutkan.";$("checkoutError").classList.remove("hidden");nativeInvalid.focus();return false;} if(checkoutStep===3&&!document.querySelector("input[name='shipping']:checked")){$("checkoutError").textContent="Pilih metode pengiriman sebelum melanjutkan.";$("checkoutError").classList.remove("hidden");section.querySelector("input[name='shipping']")?.focus();return false;} if(checkoutStep===4&&!document.querySelector("input[name='payment']:checked")){$("checkoutError").textContent="Pilih metode pembayaran sebelum melanjutkan.";$("checkoutError").classList.remove("hidden");section.querySelector("input[name='payment']")?.focus();return false;} return true; }
function advanceCheckout(delta){checkoutStep=Math.max(1,Math.min(CHECKOUT_STEPS.length,checkoutStep+delta));renderCheckoutStep();$("checkoutModal").querySelector(".modal-card").scrollTop=0;}
function changeCheckoutStep(delta) {
  if(checkoutSubmitting||(delta>0&&!validateCheckoutStep()))return;
  if(delta>0&&checkoutStep===2){
    const next=$("checkoutNext");next.disabled=true;next.textContent="Menghitung ongkir…";$("checkoutError").classList.add("hidden");
    loadShippingQuotes().then(()=>advanceCheckout(1)).catch(error=>{$("checkoutError").textContent=error.message||"Opsi pengiriman belum dapat dimuat.";$("checkoutError").classList.remove("hidden");}).finally(()=>{next.disabled=false;next.textContent="Lanjutkan";});
    return;
  }
  advanceCheckout(delta);
}
function vaBankName(code){return VA_BANK_NAMES[code]||String(code||"").toUpperCase();}
function selectedPayment(){return document.querySelector("input[name='payment']:checked")?.value||"Transfer Bank";}
// Snap: the customer picks the bank or e-wallet on the Midtrans page, not here.
function snapCheckout(){return checkoutConfig?.integration==="snap";}
function selectedVaBank(){return selectedPayment()==="Transfer Bank"&&!snapCheckout()?($("vaBank")?.value||null):null;}
function paymentMethodLabel(payment,bank){
  if(payment==="QRIS"&&snapCheckout())return "QRIS / E-Wallet";
  if(payment!=="Transfer Bank")return payment;
  return bank?`Transfer Bank · ${vaBankName(bank)}`:"Transfer Bank (Virtual Account)";
}
async function loadCheckoutConfig(){
  try{
    const response=await fetch("/api/config",{headers:{Accept:"application/json"}});
    const data=await response.json().catch(()=>null);
    if(response.ok&&data?.checkout){
      checkoutConfig=data.checkout;
      const select=$("vaBank");
      if(select&&Array.isArray(checkoutConfig.vaBanks)&&checkoutConfig.vaBanks.length){
        const current=select.value;
        select.innerHTML=checkoutConfig.vaBanks.map(bank=>`<option value="${escapeHTML(bank.code)}">${escapeHTML(bank.name)}</option>`).join("");
        if(checkoutConfig.vaBanks.some(bank=>bank.code===current))select.value=current;
      }
    }
  }catch(error){console.warn("Checkout config unavailable; offering all payment methods",error);}
  applyPaymentAvailability();
}
// Hides methods the store has not enabled and QRIS above the Bank Indonesia cap. The
// server enforces the same rules; this keeps customers away from options that would fail.
function applyPaymentAvailability(){
  const methods=checkoutConfig?.paymentMethods||["Transfer Bank","QRIS","COD"];
  const limit=Number(checkoutConfig?.qrisMaxAmount)||QRIS_MAX_AMOUNT;
  const total=cart.length?checkoutTotals().total:0;
  const overLimit=total>limit;
  // COD is cash on pickup only: a courier cannot be booked before payment, nor asked to collect cash.
  const shipping=selectedShipping();
  const codBlocked=Boolean(shipping)&&shipping.method!=="pickup";
  document.querySelectorAll("[data-payment-option]").forEach(option=>{
    const method=option.dataset.paymentOption,input=option.querySelector("input");
    const offered=methods.includes(method),blocked=(method==="QRIS"&&overLimit)||(method==="COD"&&codBlocked);
    option.classList.toggle("hidden",!offered);
    option.classList.toggle("is-disabled",blocked);
    if(input)input.disabled=!offered||blocked;
  });
  const snap=snapCheckout();
  const note=$("qrisOptionNote");
  if(note)note.textContent=overLimit?`Tidak tersedia untuk total di atas ${money(limit)} (batas QRIS). Gunakan Transfer Bank.`:snap?"Bayar dengan QRIS, GoPay, atau ShopeePay di halaman pembayaran Midtrans.":"Bayar instan dengan e-wallet atau mobile banking. QR tampil setelah pesanan dibuat.";
  const codNote=$("codOptionNote");if(codNote)codNote.textContent=codBlocked?"Hanya untuk pengiriman Ambil di Toko. Kembali ke langkah pengiriman untuk memilihnya.":"Bayar tunai saat mengambil pesanan di toko.";
  const qrisLabel=$("qrisOptionLabel");if(qrisLabel)qrisLabel.textContent=snap?"QRIS / E-Wallet":"QRIS";
  const vaNote=$("vaOptionNote");if(vaNote)vaNote.textContent=snap?"Pilih bank di halaman pembayaran Midtrans setelah pesanan dibuat. Pembayaran terkonfirmasi otomatis.":"Nomor Virtual Account muncul setelah pesanan dibuat. Pembayaran terkonfirmasi otomatis.";
  const checked=document.querySelector("input[name='payment']:checked");
  if(!checked||checked.disabled){const first=[...document.querySelectorAll("input[name='payment']")].find(input=>!input.disabled);if(first)first.checked=true;}
  const picker=$("vaBankPicker");
  if(picker){const showPicker=!snap&&selectedPayment()==="Transfer Bank"&&methods.includes("Transfer Bank");picker.classList.toggle("hidden",!showPicker);const select=$("vaBank");if(select)select.disabled=!showPicker;}
}
function paymentGuidance(payment) { if(payment==="COD")return "Pesanan diterima dan menunggu konfirmasi toko"; if(payment!=="COD"&&snapCheckout())return "Anda diarahkan ke halaman pembayaran Midtrans setelah pesanan dibuat"; if(payment==="QRIS")return "Pembayaran diproses setelah pesanan dibuat"; if(payment==="Transfer Bank")return `Nomor Virtual Account ${vaBankName(selectedVaBank())} muncul setelah pesanan dibuat`; return "Instruksi diberikan setelah pesanan dikonfirmasi"; }
function renderFinalReview() { const shipping=selectedShipping(); const payment=selectedPayment(); const paymentLabel=paymentMethodLabel(payment,selectedVaBank()); $("finalReview").innerHTML=`<div><span>Penerima</span><strong>${escapeHTML($("custName").value.trim())}</strong><small>${escapeHTML($("custPhone").value.trim())} · ${escapeHTML($("custEmail").value.trim())}</small></div><div><span>Alamat</span><strong>${escapeHTML($("custCity").value.trim())}, ${escapeHTML($("custPostal").value.trim())}</strong><small>${escapeHTML($("custAddress").value.trim())}</small></div><div><span>Pengiriman</span><strong>${escapeHTML(shipping?.name||"-")}</strong><small>${escapeHTML(shipping?shippingEta(shipping):"-")} · ${shipping?(shipping.price?money(shipping.price):"Gratis"):"-"}</small></div><div><span>Pembayaran</span><strong>${escapeHTML(paymentLabel)}</strong><small>${escapeHTML(paymentGuidance(payment))}</small></div>`; }
function startCheckout(updateRoute=true) { if (!cart.length) return showToast("Keranjang masih kosong."); ensureCheckoutIdempotencyKey(); if(updateRoute){navigateRoute("checkout");return;} setModal("cartDrawer", false); $("checkoutForm").reset(); renderCheckout(); setModal("checkoutModal", true); }
function checkoutErrorMessage(message, status) { if(status===409)return message||"Stok atau opsi pengiriman sudah berubah. Silakan periksa checkout Anda."; if(status===400||status===422)return message||"Data checkout belum valid. Silakan periksa kembali."; if(!status)return "Koneksi bermasalah. Periksa jaringan Anda lalu coba kembali."; return message||"Pesanan belum dapat diproses. Silakan coba kembali."; }
async function createPaymentIntent(orderNumber,paymentToken,bank=null) {
  if(!orderNumber||!paymentToken)throw new Error("Token pembayaran tidak tersedia.");
  const response=await fetch("/api/payments/create",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({orderNumber,paymentToken,...(bank?{bank}:{})})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok){const failure=new Error(result.error||"Pembayaran belum dapat disiapkan.");failure.status=response.status;failure.code=result.code||null;throw failure;}
  return result;
}
// QRIS payment from "Pesanan Saya". POST /api/payments/create reuses a still-valid QR
// or issues a new attempt, so the same call serves "show QR" and "new QR".
function stopPaymentPolling(){if(paymentSession?.timer)clearInterval(paymentSession.timer);if(paymentSession)paymentSession.timer=null;}
function closePaymentModal(){stopPaymentPolling();paymentSession=null;setModal("paymentModal",false);}
function formatCountdown(ms){const total=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;}
function copyToClipboard(value){
  const done=()=>showToast(`Disalin: ${value}`);
  if(navigator.clipboard?.writeText){navigator.clipboard.writeText(value).then(done).catch(()=>showToast(`Salin manual: ${value}`));return;}
  showToast(`Salin manual: ${value}`);
}
function formatDeadline(ms){return new Date(ms).toLocaleString("id-ID",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"});}
// Payment instructions for a Midtrans VA (or Mandiri Bill Payment), shared by the
// checkout success modal and the Pesanan payment modal.
function vaInstructionsHTML(payment,total){
  const bank=payment.vaBank,mandiri=bank==="mandiri";
  const copy=(value,label)=>`<button class="va-copy" type="button" data-copy="${escapeHTML(value)}" aria-label="Salin ${escapeHTML(label)}">Salin</button>`;
  const rows=[];
  if(mandiri&&payment.billerCode)rows.push(`<div class="va-row"><span>Kode perusahaan (biller code)</span><div class="va-value"><strong>${escapeHTML(payment.billerCode)}</strong>${copy(payment.billerCode,"kode perusahaan")}</div></div>`);
  rows.push(`<div class="va-row"><span>${mandiri?"Kode bayar (bill key)":`Nomor Virtual Account ${escapeHTML(vaBankName(bank))}`}</span><div class="va-value"><strong>${escapeHTML(payment.vaNumber)}</strong>${copy(payment.vaNumber,mandiri?"kode bayar":"nomor Virtual Account")}</div></div>`);
  if(total!=null)rows.push(`<div class="va-row"><span>Jumlah transfer (harus persis)</span><div class="va-value"><strong>${money(total)}</strong>${copy(String(Math.round(Number(total))),"jumlah transfer")}</div></div>`);
  const deadline=Date.parse(payment.expiresAt||"");
  const steps=mandiri
    ?["Buka Livin' by Mandiri atau ATM Mandiri, pilih Bayar lalu Multipayment.","Masukkan kode perusahaan, kemudian kode bayar di atas.","Pastikan nama merchant dan jumlahnya sesuai, lalu konfirmasi."]
    :[`Buka m-banking, internet banking, atau ATM ${vaBankName(bank)} dan pilih transfer ke Virtual Account.`,"Masukkan nomor Virtual Account di atas.","Pastikan nama merchant dan jumlahnya sesuai, lalu konfirmasi."];
  return `<div class="payment-va">${rows.join("")}${Number.isFinite(deadline)?`<small>Bayar sebelum <strong>${escapeHTML(formatDeadline(deadline))}</strong></small>`:""}<ol>${steps.map(step=>`<li>${escapeHTML(step)}</li>`).join("")}</ol></div>`;
}
function renderPaymentState(state){
  const target=$("paymentContent");if(!target||!paymentSession)return;
  const order=paymentSession.orderNumber;
  if(state.kind==="loading"){target.innerHTML=`<div class="payment-state"><span class="state-mark">…</span><p>Menyiapkan pembayaran untuk pesanan <strong>${escapeHTML(order)}</strong>.</p></div>`;return;}
  if(state.kind==="paid"){target.innerHTML=`<div class="payment-state paid"><span class="state-mark">✓</span><p>Pembayaran untuk pesanan <strong>${escapeHTML(order)}</strong> sudah kami terima. Terima kasih!</p></div><div class="payment-actions"><button class="primary full" type="button" data-action="close-payment">Tutup</button></div>`;return;}
  if(state.kind==="snap"){
    target.innerHTML=`<div class="payment-meta"><span>Pesanan ${escapeHTML(order)}</span>${paymentSession.total!=null?`<strong>${money(paymentSession.total)}</strong>`:""}</div><div class="payment-state"><p>Lanjutkan ke halaman pembayaran Midtrans untuk memilih Virtual Account, QRIS, atau e-wallet.</p></div><div class="payment-actions"><a class="primary full" href="${escapeHTML(state.url)}" rel="noopener">Bayar Sekarang</a><button class="secondary full" type="button" data-action="check-payment">Saya Sudah Bayar, Cek Status</button></div><p class="payment-note" id="paymentPollNote">Status diperbarui otomatis setelah pembayaran berhasil.</p>`;
    return;
  }
  if(state.kind==="expired"&&paymentSession.snap){target.innerHTML=`<div class="payment-state error"><span class="state-mark">!</span><p>Link pembayaran sudah kedaluwarsa. Buat link baru untuk melanjutkan. Jika Anda sudah membayar, cek status terlebih dahulu.</p></div><div class="payment-actions"><button class="primary full" type="button" data-action="renew-payment">Buat Link Pembayaran Baru</button><button class="secondary full" type="button" data-action="check-payment">Saya Sudah Bayar, Cek Status</button></div>`;return;}
  if(state.kind==="expired"&&paymentSession.method==="Transfer Bank"){state={kind:"choose-bank",message:"Nomor Virtual Account sudah kedaluwarsa. Pilih bank untuk nomor baru. Jika Anda sudah membayar, cek status terlebih dahulu.",offerCheck:true};}
  if(state.kind==="choose-bank"){
    const banks=checkoutConfig?.vaBanks?.length?checkoutConfig.vaBanks:Object.entries(VA_BANK_NAMES).map(([code,name])=>({code,name}));
    target.innerHTML=`<div class="payment-state"><p>${escapeHTML(state.message||"Pilih bank untuk mendapatkan nomor Virtual Account.")}</p></div><div class="va-bank-choices">${banks.map(bank=>`<button type="button" data-va-bank="${escapeHTML(bank.code)}">${escapeHTML(bank.name)}</button>`).join("")}</div>${state.offerCheck?'<div class="payment-actions"><button class="secondary full" type="button" data-action="check-payment">Saya Sudah Bayar, Cek Status</button></div>':""}`;
    return;
  }
  if(state.kind==="va"){
    target.innerHTML=`<div class="payment-meta"><span>Pesanan ${escapeHTML(order)}</span></div>${vaInstructionsHTML(state.payment,paymentSession.total)}<p class="payment-note" id="paymentPollNote">Status diperbarui otomatis setelah transfer diterima, biasanya dalam beberapa menit.</p><div class="payment-actions"><button class="secondary full" type="button" data-action="check-payment">Saya Sudah Bayar, Cek Status</button></div>`;
    return;
  }
  if(state.kind==="expired"){target.innerHTML=`<div class="payment-state error"><span class="state-mark">!</span><p>QR sudah kedaluwarsa. Buat QR baru untuk melanjutkan pembayaran. Jika Anda sudah membayar, cek status terlebih dahulu.</p></div><div class="payment-actions"><button class="primary full" type="button" data-action="renew-payment">Buat QR Baru</button><button class="secondary full" type="button" data-action="check-payment">Saya Sudah Bayar, Cek Status</button></div>`;return;}
  if(state.kind==="error"){target.innerHTML=`<div class="payment-state error"><span class="state-mark">!</span><p>${escapeHTML(state.message||"Pembayaran belum dapat disiapkan.")}</p></div><div class="payment-actions">${state.retry?'<button class="primary full" type="button" data-action="renew-payment">Coba Lagi</button>':""}<button class="secondary full" type="button" data-action="close-payment">Tutup</button></div>`;return;}
  const expiresAt=paymentSession.expiresAt;
  target.innerHTML=`<div class="payment-meta"><span>Pesanan ${escapeHTML(order)}</span>${paymentSession.total!=null?`<strong>${money(paymentSession.total)}</strong>`:""}</div><div class="payment-qr"><img src="${escapeHTML(state.url)}" alt="QRIS untuk pesanan ${escapeHTML(order)}"><small>Scan dengan aplikasi e-wallet atau mobile banking yang mendukung QRIS.</small>${expiresAt?`<small>Berlaku <span class="payment-countdown" id="paymentCountdown">${formatCountdown(expiresAt-Date.now())}</span></small>`:""}</div><p class="payment-note" id="paymentPollNote">Status diperbarui otomatis setelah pembayaran berhasil.</p><div class="payment-actions"><button class="secondary full" type="button" data-action="check-payment">Saya Sudah Bayar, Cek Status</button></div>`;
}
async function refreshPaymentStatus({manual=false}={}){
  const session=paymentSession;if(!session||session.checking)return;
  const record=orderAccessRecord(session.orderNumber);if(!record)return;
  session.checking=true;
  try{
    const detail=await fetchCustomerOrderAccess(record);
    if(paymentSession!==session)return;
    session.total=Number(detail.total)||session.total;
    const status=String(detail.paymentStatus||"").toLowerCase();
    if(status==="paid"){stopPaymentPolling();renderPaymentState({kind:"paid"});renderCustomerOrders();return;}
    if(["expired","failed"].includes(status)){stopPaymentPolling();renderPaymentState({kind:"expired"});return;}
    if(manual){const note=$("paymentPollNote");if(note)note.textContent="Pembayaran belum terdeteksi. Jika baru saja membayar, tunggu beberapa detik.";else showToast("Pembayaran belum terdeteksi.");}
  }catch(error){
    if(manual&&paymentSession===session)showToast(error.message||"Status pembayaran belum dapat diperiksa.");
  }finally{session.checking=false;}
}
function startPaymentPolling(){
  stopPaymentPolling();
  const session=paymentSession;if(!session)return;
  let ticks=0;
  session.timer=setInterval(()=>{
    if(paymentSession!==session){clearInterval(session.timer);return;}
    const countdown=$("paymentCountdown");
    if(session.expiresAt&&countdown)countdown.textContent=formatCountdown(session.expiresAt-Date.now());
    if(session.expiresAt&&Date.now()>=session.expiresAt){stopPaymentPolling();renderPaymentState({kind:"expired"});return;}
    ticks+=1;
    if(ticks%PAYMENT_POLL_SECONDS===0&&!document.hidden)refreshPaymentStatus();
  },1000);
}
async function openGatewayPayment(orderNumber,{bank=null}={}){
  const record=orderAccessRecord(orderNumber);
  if(!record?.paymentToken){showToast("Pembayaran tidak dapat dibuka dari browser ini.");return;}
  stopPaymentPolling();
  const known=customerOrderCache.get(orderNumber);
  const method=known?.payment==="Transfer Bank"?"Transfer Bank":"QRIS";
  if(bank&&record.bank!==bank){record.bank=bank;storage.set("gyd_order_access",orderAccessRecords);}
  const snap=snapCheckout();
  const session={orderNumber,method,snap,total:known?.total??null,expiresAt:null,timer:null,checking:false};
  paymentSession=session;
  const title=$("paymentTitle");if(title)title.textContent=snap?"Lanjutkan Pembayaran":method==="Transfer Bank"?"Bayar via Transfer Bank":"Bayar dengan QRIS";
  renderPaymentState({kind:"loading"});
  setModal("paymentModal",true);
  try{
    const result=await createPaymentIntent(orderNumber,record.paymentToken,method==="Transfer Bank"&&!snap?(bank||record.bank||null):null);
    if(paymentSession!==session)return;
    const status=String(result.paymentStatus||"").toLowerCase();
    if(status==="paid"){renderPaymentState({kind:"paid"});renderCustomerOrders();return;}
    const expiresAt=Date.parse(result.expiresAt||"");
    session.expiresAt=Number.isFinite(expiresAt)?expiresAt:null;
    if(result.checkoutUrl){
      session.snap=true;
      renderPaymentState({kind:"snap",url:result.checkoutUrl});
      startPaymentPolling();
      // Straight to Midtrans: the modal stays as the fallback if navigation is blocked.
      location.assign(result.checkoutUrl);
      return;
    }
    if(result.vaNumber){
      if(result.vaBank&&record.bank!==result.vaBank){record.bank=result.vaBank;storage.set("gyd_order_access",orderAccessRecords);}
      renderPaymentState({kind:"va",payment:result});
      startPaymentPolling();
      return;
    }
    if(!result.paymentUrl){renderPaymentState({kind:"error",message:"Instruksi pembayaran belum dapat ditampilkan. Silakan coba lagi beberapa saat.",retry:true});return;}
    renderPaymentState({kind:"qr",url:result.paymentUrl});
    startPaymentPolling();
  }catch(error){
    if(paymentSession!==session)return;
    if(["BANK_REQUIRED","BANK_UNAVAILABLE"].includes(error.code)){renderPaymentState({kind:"choose-bank",message:error.code==="BANK_UNAVAILABLE"?error.message:null});return;}
    // 404/409 mean the payment window closed or the order is no longer payable.
    const final=[404,409].includes(error.status);
    renderPaymentState({kind:"error",message:final?`${error.message} Hubungi toko bila perlu bantuan.`:error.message,retry:!final});
    if(final)renderCustomerOrders();
  }
}

async function submitOrder(event) {
  event.preventDefault(); if(checkoutSubmitting||checkoutStep!==5||!validateCheckoutStep())return;
  const shipping=selectedShipping(); if(!shipping)return; const payment=selectedPayment(); const bank=selectedVaBank();
  const customer={full_name:$("custName").value.trim(),whatsapp:normalizePhone($("custPhone").value),email:$("custEmail").value.trim().toLowerCase(),address:$("custAddress").value.trim(),city:$("custCity").value.trim(),postal_code:$("custPostal").value.trim(),notes:$("custNotes").value.trim()};
  const button=$("checkoutSubmit"); checkoutSubmitting=true; button.disabled=true; button.textContent="Memproses pesanan..."; $("checkoutBack").disabled=true; $("checkoutError").classList.add("hidden");
  try {
    const checkoutKey=ensureCheckoutIdempotencyKey();
    const response=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json","Idempotency-Key":checkoutKey},body:JSON.stringify({customer,payment,shippingQuoteId:shipping.quoteId,items:cart.map(item=>({productId:item.id,quantity:item.qty}))})});
    const result=await response.json().catch(()=>({})); if(!response.ok){const failure=new Error(result.error||"");failure.status=response.status;throw failure;}
    const items=cart.map(item=>{const product=products.find(entry=>entry.id===item.id);return{id:item.id,name:product?.name||"Produk",qty:item.qty,price:product?.price||0};});
    let paymentIntent=null,paymentIntentError="";
    if(payment!=="COD"){
      try{paymentIntent=await createPaymentIntent(result.orderNumber,result.paymentToken,bank);}
      catch(paymentError){paymentIntentError=paymentError.message||"Pembayaran belum dapat disiapkan.";console.error("Payment intent preparation failed",{orderNumber:result.orderNumber,status:paymentError.status||null,message:paymentError.message});}
    }
    const order={id:result.orderNumber,createdAt:result.createdAt,customer:{name:customer.full_name,phone:customer.whatsapp,email:customer.email,address:customer.address,city:customer.city,postalCode:customer.postal_code},payment,shipping:result.shippingServiceName||shipping.name,shippingId:shipping.method,shippingProvider:result.shippingProvider||shipping.provider,shippingServiceCode:result.shippingServiceCode||shipping.serviceCode,shippingCost:result.shippingCost,subtotal:result.subtotal,discount:0,total:result.total,status:"Pending",paymentStatus:payment==="COD"?"unpaid":paymentIntent?.paymentStatus||"unpaid",paymentReference:paymentIntent?.paymentReference||null,paymentUrl:paymentIntent?.paymentUrl||null,paymentExpiresAt:paymentIntent?.expiresAt||null,paymentIntentReady:payment==="COD"||Boolean(paymentIntent),items};
    rememberOrderAccess(result.orderNumber,result.orderAccessToken,result.paymentToken,paymentIntent?.vaBank||bank);
    clearCheckoutIdempotencyKey();
    orders=[order,...orders.filter(existing=>existing.id!==order.id)]; cart=[]; persist(); event.target.reset(); setModal("checkoutModal",false);
    const paymentNote=result.reused
      ?"Permintaan checkout sebelumnya sudah diproses. Sistem menampilkan pesanan yang sama dan tidak membuat pesanan duplikat."
      :payment==="COD"
        ?"Pesanan Anda telah diterima. Pembayaran dilakukan saat pesanan diterima."
        :paymentIntent
          ?(paymentIntent.message||"Pembayaran berhasil disiapkan dan menunggu instruksi gateway.")
          :"Pesanan berhasil dibuat, tetapi pembayaran belum dapat disiapkan. Jangan membuat pesanan baru; buka menu Pesanan untuk mencoba membayar lagi.";
    $("successMessage").innerHTML=`<span class="success-detail"><span>Nomor pesanan</span><strong>${escapeHTML(order.id)}</strong></span><span class="success-detail"><span>Nama pelanggan</span><strong>${escapeHTML(customer.full_name)}</strong></span><span class="success-detail"><span>Total</span><strong>${money(order.total)}</strong></span><span class="success-detail"><span>Pembayaran</span><strong>${escapeHTML(paymentMethodLabel(payment,paymentIntent?.vaBank||bank))}</strong></span><span class="success-detail"><span>Status pembayaran</span><strong>${escapeHTML(paymentStatusLabel(order.paymentStatus))}</strong></span><span class="success-detail"><span>Pengiriman</span><strong>${escapeHTML(shipping.name)}</strong></span>${payment==="QRIS"&&order.paymentUrl?`<div class="payment-qr"><strong>Scan QRIS</strong><img src="${escapeHTML(order.paymentUrl)}" alt="QRIS untuk pesanan ${escapeHTML(order.id)}"><small>Selesaikan pembayaran sebelum QR kedaluwarsa. QR dapat dibuka kembali dari menu Pesanan.</small></div>`:""}${payment==="Transfer Bank"&&paymentIntent?.vaNumber?`${vaInstructionsHTML(paymentIntent,order.total)}<small>Nomor ini dapat dibuka kembali dari menu Pesanan.</small>`:""}${paymentIntent?.checkoutUrl?`<a class="primary full payment-checkout-link" href="${escapeHTML(paymentIntent.checkoutUrl)}" rel="noopener">Bayar Sekarang</a><small>Pilih Virtual Account, QRIS, atau e-wallet di halaman Midtrans. Link pembayaran berlaku 24 jam dan dapat dibuka kembali dari menu Pesanan.</small>`:""}<small>${escapeHTML(paymentNote)}</small>${paymentIntentError?`<small>${escapeHTML(paymentIntentError)}</small>`:""}`;
    history.replaceState(null,"",routeHash("pesanan")); setModal("successModal",true); loadProducts();
  } catch(error) { checkoutSubmitting=false; button.disabled=false; $("checkoutBack").disabled=false; button.textContent="Konfirmasi & Buat Pesanan"; $("checkoutError").textContent=checkoutErrorMessage(error.message,error.status); $("checkoutError").classList.remove("hidden"); }
}

function normalizeOrderStatus(status){return ({"Menunggu Pembayaran":"Pending","Dibayar":"Paid","Diproses":"Processing","Dikirim":"Shipped","Selesai":"Completed","Dibatalkan":"Cancelled"})[status]||status||"Pending";}
function statusLabel(status){return ({Pending:"Menunggu Pembayaran",Paid:"Sudah Dibayar",Processing:"Sedang Diproses",Shipped:"Dalam Pengiriman",Completed:"Selesai",Cancelled:"Dibatalkan"})[normalizeOrderStatus(status)]||status;}
function renderOrders(){const target=$("orderList");if(!orders.length){target.innerHTML='<div class="empty-state"><span class="state-icon">▤</span><h3>Belum ada pesanan</h3><p>Pesanan baru akan tampil di sini.</p></div>';return;}target.innerHTML=orders.map(order=>`<article class="admin-order-card"><div class="admin-order-head"><div><span class="overline">${escapeHTML(order.id)}</span><h3>${escapeHTML(order.customer.name)}</h3><p>${new Date(order.createdAt).toLocaleString("id-ID")} · ${escapeHTML(order.customer.phone)}</p></div><strong>${money(order.total)}</strong></div><div class="admin-order-meta"><span><small>Pengiriman</small>${escapeHTML(order.shipping||"Reguler")}</span><span><small>Pembayaran</small>${escapeHTML(order.payment)}</span><span><small>Tujuan</small>${escapeHTML(order.customer.city||order.customer.address||"-")}</span></div><p class="admin-order-items">${order.items.map(item=>`${escapeHTML(item.name)} × ${item.qty}`).join(", ")}</p><label>Status pesanan<select data-order="${escapeHTML(order.id)}" aria-label="Status pesanan ${escapeHTML(order.id)}">${ORDER_STATUSES.map(status=>`<option value="${status}" ${status===normalizeOrderStatus(order.status)?"selected":""}>${statusLabel(status)}</option>`).join("")}</select></label></article>`).join("");}
function customerOrderStatus(status){
  const value=String(status||"").toLowerCase();
  return ({pending:"Menunggu Konfirmasi",confirmed:"Dikonfirmasi",processing:"Sedang Diproses",shipped:"Dalam Pengiriman",completed:"Selesai",cancelled:"Dibatalkan"})[value]||status||"Menunggu Konfirmasi";
}
function paymentStatusLabel(status){
  const value=String(status||"unpaid").toLowerCase();
  return ({unpaid:"Belum dibayar",pending:"Menunggu pembayaran",paid:"Lunas",failed:"Gagal",expired:"Kedaluwarsa",refunded:"Dikembalikan"})[value]||status;
}
function orderAccessRecord(orderNumber){return orderAccessRecords.find(entry=>entry?.orderNumber===orderNumber)||null;}
// Whether this browser can still (re)open a QRIS for the order. The server enforces
// the same rules; this only decides what to show.
function gatewayPaymentOption(order){
  if(!["QRIS","Transfer Bank"].includes(order.payment))return null;
  const paymentStatus=String(order.paymentStatus||"unpaid").toLowerCase();
  if(!["unpaid","pending","expired","failed"].includes(paymentStatus)||["cancelled","completed"].includes(String(order.status||"").toLowerCase()))return null;
  if(!orderAccessRecord(order.id)?.paymentToken)return {note:"Pembayaran hanya dapat dilanjutkan dari browser yang membuat pesanan ini. Hubungi toko bila perlu bantuan."};
  const deadline=Date.parse(order.paymentDeadline||"");
  if(Number.isFinite(deadline)&&deadline<=Date.now())return {note:"Batas waktu pembayaran sudah lewat. Hubungi toko untuk bantuan."};
  const label=snapCheckout()
    ?(paymentStatus==="pending"?"Lanjutkan Pembayaran":"Bayar Sekarang")
    :order.payment==="Transfer Bank"
    ?(paymentStatus==="pending"?"Lihat Nomor Virtual Account":"Bayar via Transfer Bank")
    :(paymentStatus==="pending"?"Tampilkan QRIS":"Bayar dengan QRIS");
  return {canPay:true,label,deadline:Number.isFinite(deadline)?deadline:null};
}
function customerOrderActions(order){
  const option=gatewayPaymentOption(order);
  const pay=option?.canPay
    ?`<button class="primary" type="button" data-pay-order="${escapeHTML(order.id)}">${escapeHTML(option.label)}</button>${option.deadline?`<small>Bayar sebelum ${escapeHTML(new Date(option.deadline).toLocaleString("id-ID",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}))}</small>`:""}`
    :option?.note?`<small class="payment-note">${escapeHTML(option.note)}</small>`:"";
  const track=order.trackingUrl?`<a class="secondary" href="${escapeHTML(order.trackingUrl)}" target="_blank" rel="noopener">Lacak Pengiriman</a>`:"";
  return pay||track?`<div class="customer-order-actions">${pay}${track}</div>`:"";
}
function customerOrderModel(order){
  if(order?.orderNumber)return {id:order.orderNumber,createdAt:order.createdAt,status:order.status,payment:order.paymentMethod,paymentStatus:order.paymentStatus,paymentDeadline:order.paymentDeadline||null,shipping:order.shippingServiceName||order.shippingServiceCode||"Pengiriman",shippingStatus:order.shippingStatus,shippingCost:order.shippingCost,total:order.total,trackingNumber:order.trackingNumber,trackingUrl:/^https:\/\//i.test(String(order.trackingUrl||""))?order.trackingUrl:null,items:(order.items||[]).map(item=>({name:item.name,qty:item.quantity,price:item.unitPrice,subtotal:item.subtotal}))};
  return {...order,shippingStatus:order.shippingStatus||null,trackingNumber:order.trackingNumber||null,trackingUrl:/^https:\/\//i.test(String(order.trackingUrl||""))?order.trackingUrl:null};
}
function renderCustomerOrderCards(target,list){
  if(!list.length){target.innerHTML='<div class="orders-empty"><span>▤</span><h2>Belum ada pesanan</h2><p>Pesanan yang dibuat dari browser ini akan muncul di sini.</p><button class="primary" type="button" data-action="show-store">Mulai Belanja</button></div>';return;}
  customerOrderCache=new Map(list.map(raw=>{const order=customerOrderModel(raw);return [order.id,order];}));
  target.innerHTML=list.map(raw=>{const order=customerOrderModel(raw);return `<article class="customer-order-card"><header><div><span>Nomor pesanan</span><strong>${escapeHTML(order.id)}</strong></div><div><span>Tanggal</span><strong>${new Date(order.createdAt).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}</strong></div><span class="order-status status-${String(order.status||"pending").toLowerCase()}">${escapeHTML(customerOrderStatus(order.status))}</span></header><div class="customer-order-body"><div class="customer-order-items">${(order.items||[]).map(item=>`<div><span>${escapeHTML(item.name)} <small>× ${item.qty}</small></span><strong>${money(item.subtotal??item.price*item.qty)}</strong></div>`).join("")}</div><div class="customer-order-summary"><dl><div><dt>Pengiriman</dt><dd>${escapeHTML(order.shipping||"Reguler")}</dd></div>${order.shippingStatus?`<div><dt>Status kiriman</dt><dd>${escapeHTML(order.shippingStatus)}</dd></div>`:""}${order.trackingNumber?`<div><dt>Resi</dt><dd>${escapeHTML(order.trackingNumber)}</dd></div>`:""}<div><dt>Pembayaran</dt><dd>${escapeHTML(order.payment||"-")} · ${escapeHTML(paymentStatusLabel(order.paymentStatus))}</dd></div><div><dt>Total</dt><dd>${money(order.total)}</dd></div></dl>${customerOrderActions(order)}</div></div></article>`;}).join("");
}
async function renderCustomerOrders(){
  const target=$("customerOrderList");
  const session=[...orders];
  if(!orderAccessRecords.length){renderCustomerOrderCards(target,session);return;}
  target.innerHTML='<div class="orders-empty"><span>…</span><h2>Memuat pesanan</h2><p>Mengambil status terbaru pesanan Anda.</p></div>';
  const results=await Promise.allSettled(orderAccessRecords.slice(0,20).map(fetchCustomerOrderAccess));
  const remote=results.filter(result=>result.status==="fulfilled").map(result=>result.value);
  const remoteIds=new Set(remote.map(order=>order.orderNumber));
  const merged=[...remote,...session.filter(order=>!remoteIds.has(order.id))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  renderCustomerOrderCards(target,merged);
}

function handleAction(action) {
  switch(action){
    case "show-store": navigateRoute("beranda"); break;
    case "show-orders": navigateRoute("pesanan"); break;
    case "show-admin": window.location.href="./admin.html#produk"; break;
    case "open-cart": navigateRoute("keranjang"); break;
    case "close-cart": navigateRoute("beranda"); break;
    case "checkout": navigateRoute("checkout"); break;
    case "checkout-next": changeCheckoutStep(1); break;
    case "checkout-back": changeCheckoutStep(-1); break;
    case "close-checkout": navigateRoute("keranjang"); break;
    case "close-product": navigateRoute("produk"); break;
    case "open-helper": navigateRoute("bantu-pilih"); break;
    case "close-helper": navigateRoute("beranda"); break;
    case "close-success": setModal("successModal",false); navigateRoute("beranda"); break;
    case "success-orders": setModal("successModal",false); navigateRoute("pesanan"); break;
    case "scroll-products": navigateRoute("produk"); break;
    case "reset-filter": resetFilters(); break;
    case "close-payment": closePaymentModal(); break;
    case "check-payment": refreshPaymentStatus({manual:true}); break;
    case "renew-payment": if(paymentSession)openGatewayPayment(paymentSession.orderNumber); break;
    case "reset-product": $("productForm").reset(); $("editId").value=""; $("productFormTitle").textContent="Tambah Produk"; break;
  }
}
document.addEventListener("click", event => { const action=event.target.closest("[data-action]")?.dataset.action;if(action)handleAction(action);const category=event.target.closest("[data-category]")?.dataset.category;if(category)selectCategory(category);const payOrder=event.target.closest("[data-pay-order]")?.dataset.payOrder;if(payOrder)openGatewayPayment(payOrder);const vaBank=event.target.closest("[data-va-bank]")?.dataset.vaBank;if(vaBank&&paymentSession)openGatewayPayment(paymentSession.orderNumber,{bank:vaBank});const copyValue=event.target.closest("[data-copy]")?.dataset.copy;if(copyValue)copyToClipboard(copyValue);const add=event.target.closest("[data-add]")?.dataset.add;if(add)addToCart(add);const buy=event.target.closest("[data-buy]")?.dataset.buy;if(buy&&addToCart(buy))startCheckout();const qty=event.target.closest("[data-qty]");if(qty)changeQty(qty.dataset.qty,Number(qty.dataset.delta));const detailQty=event.target.closest("[data-detail-qty]")?.dataset.detailQty;if(detailQty)changeDetailQuantity(Number(detailQty));if(event.target.closest("[data-detail-add]"))addDetailToCart();if(event.target.closest("[data-detail-buy]"))addDetailToCart(true);const remove=event.target.closest("[data-remove]")?.dataset.remove;if(remove){cart=cart.filter(item=>item.id!==remove);persist();renderCart();showToast("Produk dihapus dari keranjang.");}const view=event.target.closest("[data-view-product]")?.dataset.viewProduct;if(view)openProductDetail(view);const productCard=event.target.closest("[data-product]");if(productCard&&!event.target.closest("button,a,input,select"))openProductDetail(productCard.dataset.product);const edit=event.target.closest("[data-edit]")?.dataset.edit;if(edit)editProduct(edit);const del=event.target.closest("[data-delete]")?.dataset.delete;if(del)deleteProduct(del);const tab=event.target.closest("[data-admin-tab]")?.dataset.adminTab;if(tab)setAdminTab(tab); });
document.addEventListener("change", event => { if(event.target.matches("input[name='shipping'],input[name='payment'],#vaBank"))updateCheckoutTotal();if(event.target.id==="sortSelect")renderProducts();if(event.target.matches("[data-order]")){const order=orders.find(item=>item.id===event.target.dataset.order);if(order){order.status=event.target.value;persist();renderCustomerOrders();showToast("Status pesanan diperbarui.");}} });
document.addEventListener("keydown", event => { if(event.key === "Escape"&&!$("paymentModal")?.classList.contains("hidden")){closePaymentModal();return;} if(event.key === "Escape"){const root=routeParts()[0];if(root==="checkout")navigateRoute("keranjang");else if(root==="produk"&&routeParts()[1])navigateRoute("produk");else if(["keranjang","bantu-pilih"].includes(root))navigateRoute("beranda");else ["cartDrawer","checkoutModal","productModal","helperModal","successModal"].forEach(id=>setModal(id,false));}if((event.key==="Enter"||event.key===" ")&&event.target.matches("[data-product]")){event.preventDefault();openProductDetail(event.target.dataset.product);} });
function bindElementEvent(id, type, handler) { const element=$(id); if (!element) { console.warn(`Optional UI element #${id} is unavailable.`); return; } element.addEventListener(type, handler); }
bindElementEvent("searchForm", "submit", event => { event.preventDefault(); recommendation=null;activeCategory="Semua";buildNavigation();navigateRoute("produk"); });
bindElementEvent("searchInput", "input", () => { recommendation=null;renderProducts(); });
bindElementEvent("checkoutForm", "submit", submitOrder);
bindElementEvent("helperForm", "submit", event => { event.preventDefault(); recommendation={need:new FormData(event.target).get("need"),budget:Number($("budgetSelect")?.value)};activeCategory="Semua";if($("searchInput"))$("searchInput").value="";buildNavigation();renderProducts();setModal("helperModal",false);navigateRoute("produk");showToast("Rekomendasi khusus Anda sudah siap."); });

function initializeMotion() {
  const header = document.querySelector(".site-header");
  const revealItems = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) revealItems.forEach(item => item.classList.add("is-visible"));
  else { const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: .12 }); revealItems.forEach(item => observer.observe(item)); }
  let ticking = false;
  window.addEventListener("scroll", () => { if (!ticking) requestAnimationFrame(() => { header?.classList.toggle("scrolled", window.scrollY > 24); if (!matchMedia("(prefers-reduced-motion: reduce)").matches && window.innerWidth > 680) { const heroImage = document.querySelector(".hero-device"); if (heroImage && window.scrollY < 600) heroImage.style.transform = `translateY(${Math.min(window.scrollY * .035, 14)}px) scale(1.01)`; } ticking = false; }); ticking = true; }, { passive:true });
}

window.addEventListener("hashchange",queueRouteApply);
window.addEventListener("popstate",queueRouteApply);

async function initializeApp() {
  try { buildNavigation(); } catch (error) { console.error("Navigation initialization failed", error); }
  try { persist(); } catch (error) { console.error("Cart initialization failed", error); }
  try { initializeMotion(); } catch (error) { console.error("Motion initialization failed", error); }
  await loadProducts();
  appReady=true;
  applyRoute(true);
}
initializeApp().catch(error => console.error("Storefront product initialization failed", error));
loadCheckoutConfig();
