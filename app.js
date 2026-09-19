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
const SHIPPING = [
  { id: "regular", name: "Reguler", detail: "Estimasi 3–5 hari kerja", price: 25000 },
  { id: "express", name: "Express", detail: "Estimasi 1–2 hari kerja", price: 50000 },
  { id: "sameday", name: "Same Day / Instant", detail: "Tiba hari ini untuk area yang didukung", price: 85000 },
  { id: "pickup", name: "Ambil di Toko", detail: "Siap diambil dalam 2 jam", price: 0 }
];
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
// Orders are session-only here: Supabase, not localStorage, is the durable source of truth.
let orders = [];
let activeCategory = "Semua";
let recommendation = null;
let detailProductId = null;
let detailQuantity = 1;
let checkoutStep = 1;
let checkoutSubmitting = false;
let toastTimer;

const $ = (id) => document.getElementById(id);
const money = (value) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value || 0);
const escapeHTML = (value = "") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const safeImage = (value) => /^(https?:\/\/|data:image\/)/.test(value || "") ? value : "https://placehold.co/700x700/eef1f5/172033?text=GETYOURDEVICE";

function migrateLegacyProducts() {
  const old = storage.get("nc_products", null);
  if (!old?.length) return null;
  return old.map(product => ({ ...product, category: CATEGORIES.includes(product.category) ? product.category : "Accessories", needs: product.needs || ["Produktivitas"] }));
}
function persist() { storage.set("gyd_cart", cart); updateCartCount(); }
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

function buildNavigation() {
  $("categoryNav").innerHTML = ["Semua", ...CATEGORIES].map(category => `<button type="button" data-category="${category}" class="${category === activeCategory ? "active" : ""}">${category === "Semua" ? "Semua Produk" : category}</button>`).join("");
  $("categoryCards").innerHTML = CATEGORIES.map(category => `<button type="button" class="category-card" data-category="${category}"><span class="category-image"><img src="${CATEGORY_IMAGES[category]}" alt="" loading="lazy"></span><strong>${category}</strong><small>Lihat koleksi</small></button>`).join("");
  $("productCategory").innerHTML = CATEGORIES.map(category => `<option>${category}</option>`).join("");
}
function productCard(product, compact = false) {
  const out = product.stock <= 0, low = product.stock > 0 && product.stock <= 5;
  return `<article class="product-card ${compact ? "showcase-card" : ""}" data-product="${escapeHTML(product.id)}" tabindex="0" aria-label="Lihat detail ${escapeHTML(product.name)}"><div class="product-image-wrap"><img class="product-img" src="${safeImage(product.image)}" alt="${escapeHTML(product.name)}" width="700" height="700" loading="lazy" onerror="this.src='https://placehold.co/700x700/eef1f5/172033?text=GETYOURDEVICE'">${product.badge ? `<span class="product-badge">${escapeHTML(product.badge)}</span>` : ""}<span class="view-detail">Lihat detail</span></div><div class="product-info"><span class="product-brand">${escapeHTML(product.brand || product.category)}</span><h3>${escapeHTML(product.name)}</h3><p class="product-spec">${escapeHTML(product.spec || product.description)}</p><div class="rating" aria-label="Rating ${product.rating || 4.7} dari 5"><span aria-hidden="true">★</span> ${product.rating || "4.7"} <small>(${Math.max(12, product.stock * 7 + 9)})</small></div><div class="price-row"><div class="price">${money(product.price)}</div>${product.originalPrice ? `<del>${money(product.originalPrice)}</del>` : ""}</div><span class="stock ${out ? "out" : low ? "low" : ""}">${out ? "Stok habis" : low ? `Tersisa ${product.stock} unit` : "Stok tersedia"}</span><div class="product-actions"><button class="secondary" type="button" data-buy="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>Beli Sekarang</button><button class="primary" type="button" data-add="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>+ Keranjang</button></div></div></article>`;
}
function storyCard(product, index = 0) {
  const out = product.stock <= 0;
  return `<article class="story-card story-card-${index + 1}" data-product="${escapeHTML(product.id)}" tabindex="0" aria-label="Lihat detail ${escapeHTML(product.name)}"><div class="story-image"><img src="${safeImage(product.image)}" alt="${escapeHTML(product.name)}" width="900" height="900" loading="lazy"></div><div class="story-card-copy"><span>${escapeHTML(product.brand || product.category)}</span><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.spec || product.description)}</p><strong>${money(product.price)}</strong><div class="story-actions"><button class="story-buy" type="button" data-buy="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>Beli Sekarang</button><button class="story-cart" type="button" data-add="${escapeHTML(product.id)}" ${out ? "disabled" : ""} aria-label="Tambahkan ${escapeHTML(product.name)} ke keranjang">+</button></div></div></article>`;
}
function renderShowcases() {
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
function selectCategory(category) { activeCategory = category; recommendation = null; $("searchInput").value = ""; buildNavigation(); renderProducts(); $("productsSection").scrollIntoView({ behavior: "smooth" }); }
function resetFilters() { activeCategory = "Semua"; recommendation = null; $("searchInput").value = ""; $("sortSelect").value = "featured"; buildNavigation(); renderProducts(); }

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
function openCart() { renderCart(); setModal("cartDrawer", true); }

function renderProductDetail() {
  const product = products.find(item => item.id === detailProductId); if (!product) return;
  const out = product.stock <= 0;
  const specs = (product.spec || product.description).split("·").map(spec => spec.trim()).filter(Boolean);
  const discount = product.originalPrice ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  $("productDetail").innerHTML = `<div class="product-detail-layout"><div class="detail-gallery"><img src="${safeImage(product.image)}" alt="${escapeHTML(product.name)}" width="1000" height="1000"><div class="detail-image-note">Foto produk dapat berbeda menurut varian.</div></div><div class="detail-info"><span class="product-brand">${escapeHTML(product.brand || product.category)}</span><h2 id="detailName">${escapeHTML(product.name)}</h2><div class="detail-rating"><span aria-hidden="true">★</span><strong>${product.rating || "4.7"}</strong><small>${Math.max(12, product.stock * 7 + 9)} ulasan</small></div><div class="detail-pricing"><strong>${money(product.price)}</strong>${product.originalPrice ? `<del>${money(product.originalPrice)}</del><span>Hemat ${discount}%</span>` : ""}</div><p class="detail-stock ${out ? "out" : ""}">${out ? "Stok sedang habis" : `✓ Stok tersedia — ${product.stock} unit`}</p><div class="detail-specs"><h3>Spesifikasi utama</h3><ul>${specs.map(spec => `<li>${escapeHTML(spec)}</li>`).join("")}</ul></div><div class="detail-description"><h3>Tentang produk</h3><p>${escapeHTML(product.description)}</p></div><div class="detail-purchase"><div><label for="detailQuantity">Jumlah</label><div class="detail-qty"><button type="button" data-detail-qty="-1" aria-label="Kurangi jumlah">−</button><input id="detailQuantity" value="${detailQuantity}" readonly aria-label="Jumlah produk"><button type="button" data-detail-qty="1" aria-label="Tambah jumlah" ${detailQuantity >= product.stock ? "disabled" : ""}>+</button></div></div><div class="detail-buttons"><button class="secondary" type="button" data-detail-add ${out ? "disabled" : ""}>Tambah ke Keranjang</button><button class="primary" type="button" data-detail-buy ${out ? "disabled" : ""}>Beli Sekarang</button></div></div><div class="detail-assurance"><span>✓ Garansi resmi</span><span>✓ Pengiriman terlindungi</span><span>✓ 7 hari pengembalian</span></div></div></div>`;
  const related = products.filter(item => item.id !== product.id && (item.category === product.category || (item.needs || []).some(need => (product.needs || []).includes(need)))).slice(0,3);
  $("relatedProducts").innerHTML = related.map(item => `<button class="related-card" type="button" data-view-product="${escapeHTML(item.id)}"><img src="${safeImage(item.image)}" alt="" width="300" height="300" loading="lazy"><span><small>${escapeHTML(item.brand || item.category)}</small><strong>${escapeHTML(item.name)}</strong><b>${money(item.price)}</b></span></button>`).join("");
}
function openProductDetail(id) { if (!products.some(product => product.id === id)) return; detailProductId=id; detailQuantity=1; renderProductDetail(); setModal("cartDrawer",false); setModal("productModal",true); }
function changeDetailQuantity(delta) { const product=products.find(item=>item.id===detailProductId); if(!product)return; detailQuantity=Math.max(1,Math.min(product.stock,detailQuantity+delta)); renderProductDetail(); }
function addDetailToCart(buyNow=false) { const product=products.find(item=>item.id===detailProductId); if(!product||!addToCart(product.id,false,detailQuantity))return; setModal("productModal",false); if(buyNow) startCheckout(); else openCart(); }

function renderCheckout() {
  $("shippingOptions").innerHTML = SHIPPING.map((option, index) => `<label class="choice"><input type="radio" name="shipping" value="${option.id}" ${index === 0 ? "checked" : ""}><span><strong>${option.name} — ${option.price ? money(option.price) : "Gratis"}</strong><small>${option.detail}. Biaya tetap sementara, bukan tarif kurir langsung.</small></span></label>`).join("");
  $("checkoutSummary").innerHTML = cart.map(item => { const product = products.find(entry => entry.id === item.id); if (!product) return ""; return `<div class="summary-item"><span>${escapeHTML(product.name)}<small>${item.qty} × ${money(product.price)}</small></span><strong>${money(product.price * item.qty)}</strong></div>`; }).join("");
  checkoutStep=1; checkoutSubmitting=false; clearFieldErrors(); renderCheckoutStep(); updateCheckoutTotal();
}
function selectedShipping() { return SHIPPING.find(option => option.id === document.querySelector("input[name='shipping']:checked")?.value) || SHIPPING[0]; }
function checkoutTotals() { const subtotal=cart.reduce((sum,item)=>{const product=products.find(entry=>entry.id===item.id);return sum+(product?(product.originalPrice||product.price)*item.qty:0);},0); const payable=cartSubtotal(); const discount=Math.max(0,subtotal-payable); const shipping=selectedShipping(); return {subtotal,discount,payable,shipping,total:payable+shipping.price}; }
function updateCheckoutTotal() { const totals=checkoutTotals(); $("summarySubtotal").textContent=money(totals.subtotal); $("summaryDiscount").textContent=totals.discount?`−${money(totals.discount)}`:"Rp0"; $("summaryShipping").textContent=totals.shipping.price?money(totals.shipping.price):"Gratis"; $("summaryTotal").textContent=money(totals.total); if(checkoutStep===5)renderFinalReview(); }
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
function changeCheckoutStep(delta) { if(checkoutSubmitting||(delta>0&&!validateCheckoutStep()))return; checkoutStep=Math.max(1,Math.min(CHECKOUT_STEPS.length,checkoutStep+delta)); renderCheckoutStep(); $("checkoutModal").querySelector(".modal-card").scrollTop=0; }
function paymentGuidance(payment) { if(payment==="COD")return "Pesanan diterima dan menunggu konfirmasi toko"; if(payment==="QRIS")return "Pembayaran diproses setelah pesanan dibuat"; return "Instruksi diberikan setelah pesanan dikonfirmasi"; }
function renderFinalReview() { const shipping=selectedShipping(); const payment=document.querySelector("input[name='payment']:checked")?.value||"Transfer Bank"; $("finalReview").innerHTML=`<div><span>Penerima</span><strong>${escapeHTML($("custName").value.trim())}</strong><small>${escapeHTML($("custPhone").value.trim())} · ${escapeHTML($("custEmail").value.trim())}</small></div><div><span>Alamat</span><strong>${escapeHTML($("custCity").value.trim())}, ${escapeHTML($("custPostal").value.trim())}</strong><small>${escapeHTML($("custAddress").value.trim())}</small></div><div><span>Pengiriman</span><strong>${escapeHTML(shipping.name)}</strong><small>${escapeHTML(shipping.detail)} · ${shipping.price?money(shipping.price):"Gratis"}</small></div><div><span>Pembayaran</span><strong>${escapeHTML(payment)}</strong><small>${escapeHTML(paymentGuidance(payment))}</small></div>`; }
function startCheckout() { if (!cart.length) return showToast("Keranjang masih kosong."); setModal("cartDrawer", false); $("checkoutForm").reset(); renderCheckout(); setModal("checkoutModal", true); }
function checkoutErrorMessage(message, status) { if(status===409)return "Stok salah satu produk sudah berubah. Silakan periksa keranjang Anda."; if(status===400||status===422)return message||"Data checkout belum valid. Silakan periksa kembali."; if(!status)return "Koneksi bermasalah. Periksa jaringan Anda lalu coba kembali."; return message||"Pesanan belum dapat diproses. Silakan coba kembali."; }
async function submitOrder(event) {
  event.preventDefault(); if(checkoutSubmitting||checkoutStep!==5||!validateCheckoutStep())return;
  const shipping=selectedShipping(); const payment=document.querySelector("input[name='payment']:checked")?.value||"Transfer Bank";
  const customer={full_name:$("custName").value.trim(),whatsapp:normalizePhone($("custPhone").value),email:$("custEmail").value.trim().toLowerCase(),address:$("custAddress").value.trim(),city:$("custCity").value.trim(),postal_code:$("custPostal").value.trim(),notes:$("custNotes").value.trim()};
  const button=$("checkoutSubmit"); checkoutSubmitting=true; button.disabled=true; button.textContent="Memproses pesanan..."; $("checkoutBack").disabled=true; $("checkoutError").classList.add("hidden");
  try {
    const response=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({customer,payment,shippingId:shipping.id,items:cart.map(item=>({productId:item.id,quantity:item.qty}))})});
    const result=await response.json().catch(()=>({})); if(!response.ok){const failure=new Error(result.error||"");failure.status=response.status;throw failure;}
    const items=cart.map(item=>{const product=products.find(entry=>entry.id===item.id);return{id:item.id,name:product?.name||"Produk",qty:item.qty,price:product?.price||0};});
    const order={id:result.orderNumber,createdAt:result.createdAt,customer:{name:customer.full_name,phone:customer.whatsapp,email:customer.email,address:customer.address,city:customer.city,postalCode:customer.postal_code},payment,shipping:shipping.name,shippingId:shipping.id,shippingCost:result.shippingCost,subtotal:result.subtotal,discount:0,total:result.total,status:"Pending",items};
    orders.unshift(order); cart=[]; persist(); event.target.reset(); setModal("checkoutModal",false);
    const paymentNote=payment==="COD"?"Pesanan Anda telah diterima dan sedang menunggu konfirmasi toko.":payment==="QRIS"?"Pilihan QRIS telah dicatat. Pembayaran diproses setelah pesanan dibuat; pesanan tetap menunggu konfirmasi.":"Instruksi pembayaran akan diberikan setelah pesanan dikonfirmasi.";
    $("successMessage").innerHTML=`<span class="success-detail"><span>Nomor pesanan</span><strong>${escapeHTML(order.id)}</strong></span><span class="success-detail"><span>Nama pelanggan</span><strong>${escapeHTML(customer.full_name)}</strong></span><span class="success-detail"><span>Total</span><strong>${money(order.total)}</strong></span><span class="success-detail"><span>Pembayaran</span><strong>${escapeHTML(payment)}</strong></span><span class="success-detail"><span>Pengiriman</span><strong>${escapeHTML(shipping.name)}</strong></span><small>${escapeHTML(paymentNote)}</small>`;
    setModal("successModal",true); loadProducts();
  } catch(error) { checkoutSubmitting=false; button.disabled=false; $("checkoutBack").disabled=false; button.textContent="Konfirmasi & Buat Pesanan"; $("checkoutError").textContent=checkoutErrorMessage(error.message,error.status); $("checkoutError").classList.remove("hidden"); }
}

function normalizeOrderStatus(status){return ({"Menunggu Pembayaran":"Pending","Dibayar":"Paid","Diproses":"Processing","Dikirim":"Shipped","Selesai":"Completed","Dibatalkan":"Cancelled"})[status]||status||"Pending";}
function statusLabel(status){return ({Pending:"Menunggu Pembayaran",Paid:"Sudah Dibayar",Processing:"Sedang Diproses",Shipped:"Dalam Pengiriman",Completed:"Selesai",Cancelled:"Dibatalkan"})[normalizeOrderStatus(status)]||status;}
function renderOrders(){const target=$("orderList");if(!orders.length){target.innerHTML='<div class="empty-state"><span class="state-icon">▤</span><h3>Belum ada pesanan</h3><p>Pesanan baru akan tampil di sini.</p></div>';return;}target.innerHTML=orders.map(order=>`<article class="admin-order-card"><div class="admin-order-head"><div><span class="overline">${escapeHTML(order.id)}</span><h3>${escapeHTML(order.customer.name)}</h3><p>${new Date(order.createdAt).toLocaleString("id-ID")} · ${escapeHTML(order.customer.phone)}</p></div><strong>${money(order.total)}</strong></div><div class="admin-order-meta"><span><small>Pengiriman</small>${escapeHTML(order.shipping||"Reguler")}</span><span><small>Pembayaran</small>${escapeHTML(order.payment)}</span><span><small>Tujuan</small>${escapeHTML(order.customer.city||order.customer.address||"-")}</span></div><p class="admin-order-items">${order.items.map(item=>`${escapeHTML(item.name)} × ${item.qty}`).join(", ")}</p><label>Status pesanan<select data-order="${escapeHTML(order.id)}" aria-label="Status pesanan ${escapeHTML(order.id)}">${ORDER_STATUSES.map(status=>`<option value="${status}" ${status===normalizeOrderStatus(order.status)?"selected":""}>${statusLabel(status)}</option>`).join("")}</select></label></article>`).join("");}
function renderCustomerOrders(){const target=$("customerOrderList");if(!orders.length){target.innerHTML='<div class="orders-empty"><span>▤</span><h2>Belum ada pesanan</h2><p>Pesanan yang Anda buat akan tersimpan dan muncul di halaman ini.</p><button class="primary" type="button" data-action="show-store">Mulai Belanja</button></div>';return;}target.innerHTML=orders.map(order=>`<article class="customer-order-card"><header><div><span>Nomor pesanan</span><strong>${escapeHTML(order.id)}</strong></div><div><span>Tanggal</span><strong>${new Date(order.createdAt).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}</strong></div><span class="order-status status-${normalizeOrderStatus(order.status).toLowerCase()}">${escapeHTML(statusLabel(order.status))}</span></header><div class="customer-order-body"><div class="customer-order-items">${order.items.map(item=>`<div><span>${escapeHTML(item.name)} <small>× ${item.qty}</small></span><strong>${money(item.price*item.qty)}</strong></div>`).join("")}</div><dl><div><dt>Pengiriman</dt><dd>${escapeHTML(order.shipping||"Reguler")}</dd></div><div><dt>Pembayaran</dt><dd>${escapeHTML(order.payment)}</dd></div><div><dt>Total</dt><dd>${money(order.total)}</dd></div></dl></div></article>`).join("");}

function handleAction(action) {
  switch(action){
    case "show-store": $("storeView").classList.remove("hidden"); $("adminView").classList.add("hidden"); $("customerOrdersView").classList.add("hidden"); renderShowcases(); renderProducts(); window.scrollTo({top:0,behavior:"smooth"}); break;
    case "show-orders": $("storeView").classList.add("hidden"); $("adminView").classList.add("hidden"); $("customerOrdersView").classList.remove("hidden"); renderCustomerOrders(); window.scrollTo({top:0,behavior:"smooth"}); break;
    case "show-admin": window.location.href="./admin.html"; break;
    case "open-cart": openCart(); break;
    case "close-cart": setModal("cartDrawer",false); break;
    case "checkout": startCheckout(); break;
    case "checkout-next": changeCheckoutStep(1); break;
    case "checkout-back": changeCheckoutStep(-1); break;
    case "close-checkout": setModal("checkoutModal",false); break;
    case "close-product": setModal("productModal",false); break;
    case "open-helper": setModal("helperModal",true); break;
    case "close-helper": setModal("helperModal",false); break;
    case "close-success": setModal("successModal",false); $("storeView").classList.remove("hidden"); $("adminView").classList.add("hidden"); $("customerOrdersView").classList.add("hidden"); renderShowcases(); renderProducts(); window.scrollTo({top:0,behavior:"smooth"}); break;
    case "success-orders": setModal("successModal",false); $("storeView").classList.add("hidden"); $("adminView").classList.add("hidden"); $("customerOrdersView").classList.remove("hidden"); renderCustomerOrders(); window.scrollTo({top:0,behavior:"smooth"}); break;
    case "scroll-products": $("productsSection").scrollIntoView({behavior:"smooth"}); break;
    case "reset-filter": resetFilters(); break;
    case "reset-product": $("productForm").reset(); $("editId").value=""; $("productFormTitle").textContent="Tambah Produk"; break;
  }
}
document.addEventListener("click", event => { const action=event.target.closest("[data-action]")?.dataset.action;if(action)handleAction(action);const category=event.target.closest("[data-category]")?.dataset.category;if(category)selectCategory(category);const add=event.target.closest("[data-add]")?.dataset.add;if(add)addToCart(add);const buy=event.target.closest("[data-buy]")?.dataset.buy;if(buy&&addToCart(buy))startCheckout();const qty=event.target.closest("[data-qty]");if(qty)changeQty(qty.dataset.qty,Number(qty.dataset.delta));const detailQty=event.target.closest("[data-detail-qty]")?.dataset.detailQty;if(detailQty)changeDetailQuantity(Number(detailQty));if(event.target.closest("[data-detail-add]"))addDetailToCart();if(event.target.closest("[data-detail-buy]"))addDetailToCart(true);const remove=event.target.closest("[data-remove]")?.dataset.remove;if(remove){cart=cart.filter(item=>item.id!==remove);persist();renderCart();showToast("Produk dihapus dari keranjang.");}const view=event.target.closest("[data-view-product]")?.dataset.viewProduct;if(view)openProductDetail(view);const productCard=event.target.closest("[data-product]");if(productCard&&!event.target.closest("button,a,input,select"))openProductDetail(productCard.dataset.product);const edit=event.target.closest("[data-edit]")?.dataset.edit;if(edit)editProduct(edit);const del=event.target.closest("[data-delete]")?.dataset.delete;if(del)deleteProduct(del);const tab=event.target.closest("[data-admin-tab]")?.dataset.adminTab;if(tab)setAdminTab(tab); });
document.addEventListener("change", event => { if(event.target.matches("input[name='shipping'],input[name='payment']"))updateCheckoutTotal();if(event.target.id==="sortSelect")renderProducts();if(event.target.matches("[data-order]")){const order=orders.find(item=>item.id===event.target.dataset.order);if(order){order.status=event.target.value;persist();renderCustomerOrders();showToast("Status pesanan diperbarui.");}} });
document.addEventListener("keydown", event => { if(event.key === "Escape"){["cartDrawer","checkoutModal","productModal","helperModal","successModal"].forEach(id=>setModal(id,false));}if((event.key==="Enter"||event.key===" ")&&event.target.matches("[data-product]")){event.preventDefault();openProductDetail(event.target.dataset.product);} });
function bindElementEvent(id, type, handler) { const element=$(id); if (!element) { console.warn(`Optional UI element #${id} is unavailable.`); return; } element.addEventListener(type, handler); }
bindElementEvent("searchForm", "submit", event => { event.preventDefault(); recommendation=null;activeCategory="Semua";buildNavigation();renderProducts();$("productsSection")?.scrollIntoView({behavior:"smooth"}); });
bindElementEvent("searchInput", "input", () => { recommendation=null;renderProducts(); });
bindElementEvent("checkoutForm", "submit", submitOrder);
bindElementEvent("helperForm", "submit", event => { event.preventDefault(); recommendation={need:new FormData(event.target).get("need"),budget:Number($("budgetSelect")?.value)};activeCategory="Semua";if($("searchInput"))$("searchInput").value="";buildNavigation();renderProducts();setModal("helperModal",false);$("productsSection")?.scrollIntoView({behavior:"smooth"});showToast("Rekomendasi khusus Anda sudah siap."); });

function initializeMotion() {
  const header = document.querySelector(".site-header");
  const revealItems = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) revealItems.forEach(item => item.classList.add("is-visible"));
  else { const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: .12 }); revealItems.forEach(item => observer.observe(item)); }
  let ticking = false;
  window.addEventListener("scroll", () => { if (!ticking) requestAnimationFrame(() => { header?.classList.toggle("scrolled", window.scrollY > 24); if (!matchMedia("(prefers-reduced-motion: reduce)").matches && window.innerWidth > 680) { const heroImage = document.querySelector(".hero-device"); if (heroImage && window.scrollY < 600) heroImage.style.transform = `translateY(${Math.min(window.scrollY * .035, 14)}px) scale(1.01)`; } ticking = false; }); ticking = true; }, { passive:true });
}

async function initializeApp() {
  try { buildNavigation(); } catch (error) { console.error("Navigation initialization failed", error); }
  try { persist(); } catch (error) { console.error("Cart initialization failed", error); }
  try { initializeMotion(); } catch (error) { console.error("Motion initialization failed", error); }
  await loadProducts();
}
initializeApp().catch(error => console.error("Storefront product initialization failed", error));
