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
  { id: "pickup", name: "Ambil di Toko", detail: "Siap diambil dalam 2 jam", price: 0 }
];
const starterProducts = [
  {id:"phone-01",brand:"Samsung",name:"Galaxy A56 5G",spec:"8 GB / 256 GB · Kamera 50 MP",price:6199000,originalPrice:6799000,rating:4.8,stock:14,category:"Smartphone",description:"Layar Super AMOLED jernih, kamera 50 MP, dan baterai tahan lama.",needs:["Komunikasi","Hiburan"],badge:"TERLARIS",image:"https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=700&q=80"},
  {id:"laptop-01",brand:"ASUS",name:"Vivobook 14",spec:"Intel Core i5 · 16 GB · 512 GB SSD",price:8999000,originalPrice:9499000,rating:4.7,stock:8,category:"Laptop",description:"Laptop tipis untuk bekerja dan belajar dengan layar 14 inci.",needs:["Produktivitas","Hiburan"],badge:"PILIHAN",image:"https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=700&q=80"},
  {id:"tablet-01",brand:"Samsung",name:"Galaxy Tab S9 FE",spec:"10,9 inci · 6 GB / 128 GB · S Pen",price:6499000,rating:4.8,stock:10,category:"Tablet",description:"Tablet serbaguna dengan S Pen untuk catatan, kreasi, dan hiburan.",needs:["Produktivitas","Hiburan"],image:"https://images.unsplash.com/photo-1561154464-82e9adf32764?auto=format&fit=crop&w=700&q=80"},
  {id:"watch-01",brand:"Samsung",name:"Galaxy Watch7",spec:"Bluetooth · 40 mm · GPS",price:3999000,rating:4.7,stock:6,category:"Smartwatch",description:"Pantau aktivitas, tidur, dan kesehatan langsung dari pergelangan.",needs:["Kesehatan"],badge:"BARU",image:"https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=80"},
  {id:"audio-01",brand:"Sony",name:"WH-CH720N",spec:"Wireless · Noise Cancelling · 35 jam",price:1699000,originalPrice:1999000,rating:4.9,stock:18,category:"Audio",description:"Headphone nirkabel ringan dengan peredam bising aktif.",needs:["Hiburan","Produktivitas"],image:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80"},
  {id:"acc-01",brand:"Logitech",name:"Pebble 2 Combo",spec:"Bluetooth · Multi-device · Silent keys",price:949000,rating:4.7,stock:22,category:"Accessories",description:"Keyboard dan mouse ringkas, senyap, dan mudah dibawa.",needs:["Produktivitas"],image:"https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=700&q=80"},
  {id:"phone-02",brand:"Apple",name:"iPhone 15 128GB",spec:"128 GB · Kamera 48 MP · USB-C",price:12999000,originalPrice:13999000,rating:4.9,stock:5,category:"Smartphone",description:"Performa cepat, kamera andal, dan desain yang nyaman digunakan.",needs:["Komunikasi","Hiburan"],image:"https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=700&q=80"},
  {id:"laptop-02",brand:"Apple",name:"MacBook Air M3",spec:"Apple M3 · 8 GB · 256 GB SSD",price:17999000,rating:4.9,stock:4,category:"Laptop",description:"Ringan, senyap, dan bertenaga untuk produktivitas sepanjang hari.",needs:["Produktivitas"],badge:"PREMIUM",image:"https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=700&q=80"},
  {id:"audio-02",brand:"JBL",name:"Flip 6",spec:"Bluetooth · Tahan air IP67 · 12 jam",price:1999000,rating:4.8,stock:0,category:"Audio",description:"Speaker portabel tahan air dengan suara kuat dan jernih.",needs:["Hiburan"],image:"https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=700&q=80"},
  {id:"acc-02",brand:"Anker",name:"PowerCore 20K",spec:"20.000 mAh · Fast charging · USB-C",price:799000,rating:4.8,stock:31,category:"Accessories",description:"Power bank kapasitas besar dengan pengisian cepat dan aman.",needs:["Komunikasi","Produktivitas"],image:"https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=700&q=80"}
];

const storage = {
  get(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast("Penyimpanan browser penuh. Hapus beberapa foto produk.", "error"); } }
};
let products = storage.get("gyd_products", null) || migrateLegacyProducts() || starterProducts;
let cart = storage.get("gyd_cart", storage.get("nc_cart", []));
let orders = storage.get("gyd_orders", storage.get("nc_orders", []));
let activeCategory = "Semua";
let recommendation = null;
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
function persist() { storage.set("gyd_products", products); storage.set("gyd_cart", cart); storage.set("gyd_orders", orders); updateCartCount(); }
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
  return `<article class="product-card ${compact ? "showcase-card" : ""}"><div class="product-image-wrap"><img class="product-img" src="${safeImage(product.image)}" alt="${escapeHTML(product.name)}" width="700" height="700" loading="lazy" onerror="this.src='https://placehold.co/700x700/eef1f5/172033?text=GETYOURDEVICE'">${product.badge ? `<span class="product-badge">${escapeHTML(product.badge)}</span>` : ""}</div><div class="product-info"><span class="product-brand">${escapeHTML(product.brand || product.category)}</span><h3>${escapeHTML(product.name)}</h3><p class="product-spec">${escapeHTML(product.spec || product.description)}</p><div class="rating" aria-label="Rating ${product.rating || 4.7} dari 5"><span aria-hidden="true">★</span> ${product.rating || "4.7"} <small>(${Math.max(12, product.stock * 7 + 9)})</small></div><div class="price-row"><div class="price">${money(product.price)}</div>${product.originalPrice ? `<del>${money(product.originalPrice)}</del>` : ""}</div><span class="stock ${out ? "out" : low ? "low" : ""}">${out ? "Stok habis" : low ? `Tersisa ${product.stock} unit` : "Stok tersedia"}</span><div class="product-actions"><button class="secondary" type="button" data-buy="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>Beli Sekarang</button><button class="primary" type="button" data-add="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>+ Keranjang</button></div></div></article>`;
}
function storyCard(product, index = 0) {
  const out = product.stock <= 0;
  return `<article class="story-card story-card-${index + 1}"><div class="story-image"><img src="${safeImage(product.image)}" alt="${escapeHTML(product.name)}" width="900" height="900" loading="lazy"></div><div class="story-card-copy"><span>${escapeHTML(product.brand || product.category)}</span><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.spec || product.description)}</p><strong>${money(product.price)}</strong><div class="story-actions"><button class="story-buy" type="button" data-buy="${escapeHTML(product.id)}" ${out ? "disabled" : ""}>Beli Sekarang</button><button class="story-cart" type="button" data-add="${escapeHTML(product.id)}" ${out ? "disabled" : ""} aria-label="Tambahkan ${escapeHTML(product.name)} ke keranjang">+</button></div></div></article>`;
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
    const result = filteredProducts();
    const query = $("searchInput").value.trim();
    $("resultText").textContent = recommendation ? `${result.length} pilihan untuk kebutuhan ${recommendation.need.toLowerCase()} sesuai anggaran Anda.` : query || activeCategory !== "Semua" ? `${result.length} produk ditemukan.` : "Produk gadget terbaik dan paling dicari.";
    if (!result.length) { $("productGrid").innerHTML = `<div class="empty-state"><span class="state-icon">⌕</span><h3>Produk belum ditemukan</h3><p>Coba kata pencarian, kategori, atau anggaran yang berbeda.</p><button class="secondary" type="button" data-action="reset-filter">Tampilkan Semua Produk</button></div>`; return; }
    $("productGrid").innerHTML = result.map(product => productCard(product)).join("");
  } catch (error) { console.error(error); $("productGrid").innerHTML = `<div class="error-state"><span class="state-icon">!</span><h3>Produk gagal ditampilkan</h3><p>Silakan coba muat kembali halaman.</p><button class="secondary" type="button" onclick="location.reload()">Muat Ulang</button></div>`; }
}
function selectCategory(category) { activeCategory = category; recommendation = null; $("searchInput").value = ""; buildNavigation(); renderProducts(); $("productsSection").scrollIntoView({ behavior: "smooth" }); }
function resetFilters() { activeCategory = "Semua"; recommendation = null; $("searchInput").value = ""; $("sortSelect").value = "featured"; buildNavigation(); renderProducts(); }

function addToCart(id, openAfter = false) {
  const product = products.find(item => item.id === id); if (!product || product.stock <= 0) return showToast("Maaf, stok produk sedang habis.");
  const item = cart.find(entry => entry.id === id);
  if (item && item.qty >= product.stock) return showToast("Jumlah sudah mencapai stok yang tersedia.");
  item ? item.qty++ : cart.push({ id, qty: 1 }); persist(); renderCart(); showToast(`${product.name} masuk ke keranjang.`); if (openAfter) { openCart(); }
}
function validCart() { cart = cart.filter(item => products.some(product => product.id === item.id)); return cart; }
function cartSubtotal() { return validCart().reduce((sum, item) => { const product = products.find(entry => entry.id === item.id); return sum + product.price * item.qty; }, 0); }
function renderCart() {
  validCart();
  if (!cart.length) $("cartItems").innerHTML = `<div class="empty-state"><span class="state-icon">🛒</span><h3>Keranjang masih kosong</h3><p>Produk yang Anda pilih akan muncul di sini.</p><button class="secondary" type="button" data-action="close-cart">Mulai Belanja</button></div>`;
  else $("cartItems").innerHTML = cart.map(item => { const product = products.find(entry => entry.id === item.id); return `<div class="cart-row"><img src="${safeImage(product.image)}" alt=""><div><strong>${escapeHTML(product.name)}</strong><div class="item-price">${money(product.price)}</div><button class="remove-item" type="button" data-remove="${escapeHTML(item.id)}">Hapus</button></div><div class="qty-control" aria-label="Jumlah ${escapeHTML(product.name)}"><button type="button" data-qty="${escapeHTML(item.id)}" data-delta="-1" aria-label="Kurangi jumlah">−</button><span>${item.qty}</span><button type="button" data-qty="${escapeHTML(item.id)}" data-delta="1" aria-label="Tambah jumlah">+</button></div></div>`; }).join("");
  $("cartTotal").textContent = money(cartSubtotal()); $("checkoutButton").disabled = !cart.length; persist();
}
function changeQty(id, delta) { const item = cart.find(entry => entry.id === id), product = products.find(entry => entry.id === id); if (!item || !product) return; if (delta > 0 && item.qty >= product.stock) return showToast("Jumlah sudah mencapai stok yang tersedia."); item.qty += delta; if (item.qty <= 0) cart = cart.filter(entry => entry.id !== id); persist(); renderCart(); }
function openCart() { renderCart(); setModal("cartDrawer", true); }

function renderCheckout() {
  $("shippingOptions").innerHTML = SHIPPING.map((option, index) => `<label class="choice"><input type="radio" name="shipping" value="${option.id}" ${index === 0 ? "checked" : ""}><span><strong>${option.name} — ${option.price ? money(option.price) : "Gratis"}</strong><small>${option.detail}</small></span></label>`).join("");
  $("checkoutSummary").innerHTML = cart.map(item => { const product = products.find(entry => entry.id === item.id); return `<div class="summary-item"><span>${escapeHTML(product.name)}<small>${item.qty} × ${money(product.price)}</small></span><strong>${money(product.price * item.qty)}</strong></div>`; }).join(""); updateCheckoutTotal();
}
function selectedShipping() { return SHIPPING.find(option => option.id === document.querySelector("input[name='shipping']:checked")?.value) || SHIPPING[0]; }
function updateCheckoutTotal() { const subtotal = cartSubtotal(), shipping = selectedShipping(); $("summarySubtotal").textContent = money(subtotal); $("summaryShipping").textContent = shipping.price ? money(shipping.price) : "Gratis"; $("summaryTotal").textContent = money(subtotal + shipping.price); }
function startCheckout() { if (!cart.length) return showToast("Keranjang masih kosong."); setModal("cartDrawer", false); renderCheckout(); setModal("checkoutModal", true); }
function submitOrder(event) {
  event.preventDefault(); const shipping = selectedShipping(); const payment = document.querySelector("input[name='payment']:checked").value;
  const items = cart.map(item => { const product = products.find(entry => entry.id === item.id); return { id:item.id, name:product.name, qty:item.qty, price:product.price }; });
  const order = { id:`GYD-${Date.now().toString().slice(-8)}`, createdAt:new Date().toISOString(), customer:{name:$("custName").value.trim(),phone:$("custPhone").value.trim(),email:$("custEmail").value.trim(),address:$("custAddress").value.trim()}, payment, shipping:shipping.name, shippingCost:shipping.price, total:cartSubtotal()+shipping.price, status:"Menunggu Pembayaran", items };
  orders.unshift(order); items.forEach(item => { const product = products.find(entry => entry.id === item.id); product.stock = Math.max(0, product.stock-item.qty); }); cart = []; persist(); renderProducts(); event.target.reset(); setModal("checkoutModal", false); $("successMessage").textContent = `Nomor pesanan ${order.id}. Total ${money(order.total)}. Detail pembayaran akan dikirim setelah sistem backend terhubung.`; setModal("successModal", true);
}

function showStore() { $("storeView").classList.remove("hidden"); $("adminView").classList.add("hidden"); renderShowcases(); renderProducts(); window.scrollTo({top:0,behavior:"smooth"}); }
function showAdmin() { $("storeView").classList.add("hidden"); $("adminView").classList.remove("hidden"); setAdminTab("products"); window.scrollTo({top:0,behavior:"smooth"}); }
function setAdminTab(tab) { const productsTab = tab === "products"; $("adminProducts").classList.toggle("hidden", !productsTab); $("adminOrders").classList.toggle("hidden", productsTab); $("tabProducts").classList.toggle("active", productsTab); $("tabOrders").classList.toggle("active", !productsTab); productsTab ? renderAdminProducts() : renderOrders(); }
const fileToDataURL = file => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file); });
async function saveProduct(event) { event.preventDefault(); const id=$("editId").value, file=$("productImage").files[0]; let image=""; if (file) image=await fileToDataURL(file); const payload={name:$("productName").value.trim(),price:Number($("productPrice").value),stock:Number($("productStock").value),category:$("productCategory").value,description:$("productDescription").value.trim(),needs:["Produktivitas"]}; if(id){const product=products.find(item=>item.id===id);Object.assign(product,payload);if(image)product.image=image;showToast("Produk berhasil diperbarui.");}else{products.unshift({id:crypto.randomUUID(),...payload,image:image||"https://placehold.co/700x700/eef1f5/172033?text=GETYOURDEVICE"});showToast("Produk berhasil ditambahkan.");}persist();resetProductForm();renderAdminProducts(); }
function resetProductForm(){ $("productForm").reset(); $("editId").value=""; $("productFormTitle").textContent="Tambah Produk"; }
function editProduct(id){const product=products.find(item=>item.id===id);if(!product)return;$("editId").value=product.id;$("productName").value=product.name;$("productPrice").value=product.price;$("productStock").value=product.stock;$("productCategory").value=product.category;$("productDescription").value=product.description||"";$("productFormTitle").textContent="Edit Produk";$("productForm").scrollIntoView({behavior:"smooth"});}
function deleteProduct(id){if(!confirm("Hapus produk ini dari toko?"))return;products=products.filter(item=>item.id!==id);cart=cart.filter(item=>item.id!==id);persist();renderAdminProducts();showToast("Produk telah dihapus.");}
function renderAdminProducts(){const target=$("adminProductList");if(!products.length){target.innerHTML='<div class="empty-state"><h3>Belum ada produk</h3></div>';return;}target.innerHTML=products.map(product=>`<div class="admin-item"><img class="admin-thumb" src="${safeImage(product.image)}" alt=""><div><strong>${escapeHTML(product.name)}</strong><small>${money(product.price)} · Stok ${product.stock}</small></div><div class="admin-item-actions"><button class="mini" type="button" data-edit="${escapeHTML(product.id)}">Edit</button><button class="mini danger" type="button" data-delete="${escapeHTML(product.id)}">Hapus</button></div></div>`).join("");}
function renderOrders(){const target=$("orderList");if(!orders.length){target.innerHTML='<div class="empty-state"><span class="state-icon">▤</span><h3>Belum ada pesanan</h3><p>Pesanan baru akan tampil di sini.</p></div>';return;}target.innerHTML=orders.map(order=>`<article class="order-card"><div><strong>${escapeHTML(order.id)} — ${escapeHTML(order.customer.name)}</strong><p>${new Date(order.createdAt).toLocaleString("id-ID")} · ${escapeHTML(order.customer.phone)}</p><p>${order.items.map(item=>`${escapeHTML(item.name)} × ${item.qty}`).join(", ")}</p><strong>${money(order.total)}</strong> · ${escapeHTML(order.payment)} · ${escapeHTML(order.shipping||"Reguler")}</div><select data-order="${escapeHTML(order.id)}" aria-label="Status pesanan ${escapeHTML(order.id)}">${["Menunggu Pembayaran","Dibayar","Diproses","Dikirim","Selesai","Dibatalkan"].map(status=>`<option ${status===order.status?"selected":""}>${status}</option>`).join("")}</select></article>`).join("");}

function handleAction(action) { const actions={"show-store":showStore,"show-admin":showAdmin,"open-cart":openCart,"close-cart":()=>setModal("cartDrawer",false),checkout:startCheckout,"close-checkout":()=>setModal("checkoutModal",false),"open-helper":()=>setModal("helperModal",true),"close-helper":()=>setModal("helperModal",false),"close-success":()=>{setModal("successModal",false);showStore();},"scroll-products":()=>$("productsSection").scrollIntoView({behavior:"smooth"}),"reset-filter":resetFilters,"reset-product":resetProductForm}; actions[action]?.(); }
document.addEventListener("click", event => { const action=event.target.closest("[data-action]")?.dataset.action;if(action)handleAction(action);const category=event.target.closest("[data-category]")?.dataset.category;if(category)selectCategory(category);const add=event.target.closest("[data-add]")?.dataset.add;if(add)addToCart(add);const buy=event.target.closest("[data-buy]")?.dataset.buy;if(buy)addToCart(buy,true);const qty=event.target.closest("[data-qty]");if(qty)changeQty(qty.dataset.qty,Number(qty.dataset.delta));const remove=event.target.closest("[data-remove]")?.dataset.remove;if(remove){cart=cart.filter(item=>item.id!==remove);persist();renderCart();}const edit=event.target.closest("[data-edit]")?.dataset.edit;if(edit)editProduct(edit);const del=event.target.closest("[data-delete]")?.dataset.delete;if(del)deleteProduct(del);const tab=event.target.closest("[data-admin-tab]")?.dataset.adminTab;if(tab)setAdminTab(tab); });
document.addEventListener("change", event => { if(event.target.matches("input[name='shipping']"))updateCheckoutTotal();if(event.target.id==="sortSelect")renderProducts();if(event.target.matches("[data-order]")){const order=orders.find(item=>item.id===event.target.dataset.order);if(order){order.status=event.target.value;persist();showToast("Status pesanan diperbarui.");}} });
document.addEventListener("keydown", event => { if(event.key === "Escape"){["cartDrawer","checkoutModal","helperModal","successModal"].forEach(id=>setModal(id,false));} });
$("searchForm").addEventListener("submit", event => { event.preventDefault(); recommendation=null;activeCategory="Semua";buildNavigation();renderProducts();$("productsSection").scrollIntoView({behavior:"smooth"}); });
$("searchInput").addEventListener("input", () => { recommendation=null;renderProducts(); });
$("checkoutForm").addEventListener("submit", submitOrder);
$("productForm").addEventListener("submit", saveProduct);
$("helperForm").addEventListener("submit", event => { event.preventDefault(); recommendation={need:new FormData(event.target).get("need"),budget:Number($("budgetSelect").value)};activeCategory="Semua";$("searchInput").value="";buildNavigation();renderProducts();setModal("helperModal",false);$("productsSection").scrollIntoView({behavior:"smooth"});showToast("Rekomendasi khusus Anda sudah siap."); });

function initializeMotion() {
  const header = document.querySelector(".site-header");
  const revealItems = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) revealItems.forEach(item => item.classList.add("is-visible"));
  else { const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: .12 }); revealItems.forEach(item => observer.observe(item)); }
  let ticking = false;
  window.addEventListener("scroll", () => { if (!ticking) requestAnimationFrame(() => { header.classList.toggle("scrolled", window.scrollY > 24); if (!matchMedia("(prefers-reduced-motion: reduce)").matches && window.innerWidth > 680) { const heroImage = document.querySelector(".hero-device"); if (heroImage && window.scrollY < 600) heroImage.style.transform = `translateY(${Math.min(window.scrollY * .035, 14)}px) scale(1.01)`; } ticking = false; }); ticking = true; }, { passive:true });
}

buildNavigation(); persist(); renderShowcases(); renderProducts(); initializeMotion();
