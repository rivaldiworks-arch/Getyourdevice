const starterProducts = [
  {
    id: crypto.randomUUID(),
    name: "Essential Oversized Tee",
    price: 189000,
    stock: 24,
    category: "Fashion",
    description: "Kaos oversized premium untuk daily wear.",
    image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: crypto.randomUUID(),
    name: "Urban Sling Bag",
    price: 249000,
    stock: 12,
    category: "Accessories",
    description: "Tas compact dengan desain clean dan modern.",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80"
  }
];

let products = JSON.parse(localStorage.getItem("nc_products") || "null") || starterProducts;
let cart = JSON.parse(localStorage.getItem("nc_cart") || "[]");
let orders = JSON.parse(localStorage.getItem("nc_orders") || "[]");

function money(v){ return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(v); }
function saveAll(){
  localStorage.setItem("nc_products", JSON.stringify(products));
  localStorage.setItem("nc_cart", JSON.stringify(cart));
  localStorage.setItem("nc_orders", JSON.stringify(orders));
  updateStats();
}
function toast(msg){
  const el=document.getElementById("toast"); el.textContent=msg; el.classList.remove("hidden");
  setTimeout(()=>el.classList.add("hidden"),1800);
}
function updateStats(){
  document.getElementById("cartCount").textContent = cart.reduce((a,b)=>a+b.qty,0);
  document.getElementById("heroProductCount").textContent = products.length;
  document.getElementById("heroOrderCount").textContent = orders.length;
}
function showStore(){
  document.getElementById("storeView").classList.remove("hidden");
  document.getElementById("adminView").classList.add("hidden");
  renderProducts();
}
function showAdmin(){
  document.getElementById("storeView").classList.add("hidden");
  document.getElementById("adminView").classList.remove("hidden");
  setAdminTab("products");
  renderAdminProducts();
}
function scrollToProducts(){ document.getElementById("productsSection").scrollIntoView({behavior:"smooth"}); }

function renderProducts(){
  const q=(document.getElementById("searchInput")?.value || "").toLowerCase();
  const grid=document.getElementById("productGrid");
  const filtered=products.filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(q));
  if(!filtered.length){grid.innerHTML='<div class="empty">Produk tidak ditemukan.</div>'; return;}
  grid.innerHTML=filtered.map(p=>`
    <article class="product-card">
      <img class="product-img" src="${p.image || 'https://via.placeholder.com/600x600?text=Product'}" alt="${p.name}">
      <div class="product-info">
        <div class="product-meta"><span>${p.category || 'General'}</span><span>Stok ${p.stock}</span></div>
        <h3>${p.name}</h3>
        <div class="price">${money(p.price)}</div>
        <p>${p.description || ''}</p>
        <div class="product-actions">
          <button class="primary" onclick="addToCart('${p.id}')">+ Cart</button>
        </div>
      </div>
    </article>`).join("");
}

function addToCart(id){
  const p=products.find(x=>x.id===id);
  if(!p || p.stock<=0) return toast("Stok habis");
  const item=cart.find(x=>x.id===id);
  if(item){
    if(item.qty>=p.stock) return toast("Jumlah melebihi stok");
    item.qty++;
  } else cart.push({id,qty:1});
  saveAll(); toast("Produk masuk cart");
}

function openCart(){ renderCart(); document.getElementById("cartDrawer").classList.remove("hidden"); }
function closeCart(){ document.getElementById("cartDrawer").classList.add("hidden"); }

function renderCart(){
  const wrap=document.getElementById("cartItems");
  if(!cart.length){ wrap.innerHTML='<div class="empty">Keranjang masih kosong.</div>'; }
  else wrap.innerHTML=cart.map(i=>{
    const p=products.find(x=>x.id===i.id); if(!p) return "";
    return `<div class="cart-row">
      <img src="${p.image}">
      <div><strong>${p.name}</strong><div>${money(p.price)}</div></div>
      <div class="qty"><button onclick="changeQty('${i.id}',-1)">−</button><span>${i.qty}</span><button onclick="changeQty('${i.id}',1)">+</button></div>
    </div>`;
  }).join("");
  document.getElementById("cartTotal").textContent=money(cartTotal());
}
function changeQty(id,d){
  const i=cart.find(x=>x.id===id), p=products.find(x=>x.id===id);
  if(!i||!p)return;
  i.qty+=d;
  if(i.qty<=0) cart=cart.filter(x=>x.id!==id);
  if(i.qty>p.stock) i.qty=p.stock;
  saveAll(); renderCart();
}
function cartTotal(){
  return cart.reduce((sum,i)=>{
    const p=products.find(x=>x.id===i.id); return sum+(p?p.price*i.qty:0);
  },0);
}
function goCheckout(){
  if(!cart.length) return toast("Cart masih kosong");
  closeCart();
  document.getElementById("checkoutSummary").innerHTML =
    cart.map(i=>{const p=products.find(x=>x.id===i.id);return `<div>${p.name} × ${i.qty} — ${money(p.price*i.qty)}</div>`}).join("")+
    `<hr><strong>Total: ${money(cartTotal())}</strong>`;
  document.getElementById("checkoutModal").classList.remove("hidden");
}
function closeCheckout(){ document.getElementById("checkoutModal").classList.add("hidden"); }

function submitOrder(e){
  e.preventDefault();
  const items=cart.map(i=>{const p=products.find(x=>x.id===i.id); return {id:i.id,name:p.name,qty:i.qty,price:p.price};});
  const order={
    id:"NC-"+Date.now().toString().slice(-7),
    createdAt:new Date().toISOString(),
    customer:{
      name:document.getElementById("custName").value,
      phone:document.getElementById("custPhone").value,
      address:document.getElementById("custAddress").value
    },
    payment:document.getElementById("paymentMethod").value,
    total:cartTotal(),
    status:"Pending",
    items
  };
  orders.unshift(order);
  items.forEach(i=>{const p=products.find(x=>x.id===i.id); if(p) p.stock=Math.max(0,p.stock-i.qty);});
  cart=[];
  saveAll(); closeCheckout(); e.target.reset(); renderProducts();
  toast(`Order ${order.id} berhasil dibuat`);
}

function setAdminTab(tab){
  const p=document.getElementById("adminProducts"), o=document.getElementById("adminOrders");
  const tp=document.getElementById("tabProducts"), to=document.getElementById("tabOrders");
  if(tab==="products"){p.classList.remove("hidden");o.classList.add("hidden");tp.classList.add("active");to.classList.remove("active");renderAdminProducts();}
  else{o.classList.remove("hidden");p.classList.add("hidden");to.classList.add("active");tp.classList.remove("active");renderOrders();}
}

function fileToDataURL(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}

async function saveProduct(e){
  e.preventDefault();
  const id=document.getElementById("editId").value;
  const imageFile=document.getElementById("productImage").files[0];
  let image="";
  if(imageFile) image=await fileToDataURL(imageFile);
  const payload={
    name:document.getElementById("productName").value.trim(),
    price:Number(document.getElementById("productPrice").value),
    stock:Number(document.getElementById("productStock").value),
    category:document.getElementById("productCategory").value.trim(),
    description:document.getElementById("productDescription").value.trim()
  };
  if(id){
    const p=products.find(x=>x.id===id);
    Object.assign(p,payload);
    if(image) p.image=image;
    toast("Produk diperbarui");
  } else {
    products.unshift({id:crypto.randomUUID(),...payload,image:image || "https://via.placeholder.com/600x600?text=Product"});
    toast("Produk ditambahkan");
  }
  saveAll(); resetProductForm(); renderAdminProducts();
}
function resetProductForm(){
  document.getElementById("productForm").reset();
  document.getElementById("editId").value="";
}
function editProduct(id){
  const p=products.find(x=>x.id===id);
  document.getElementById("editId").value=p.id;
  document.getElementById("productName").value=p.name;
  document.getElementById("productPrice").value=p.price;
  document.getElementById("productStock").value=p.stock;
  document.getElementById("productCategory").value=p.category || "";
  document.getElementById("productDescription").value=p.description || "";
  window.scrollTo({top:0,behavior:"smooth"});
}
function deleteProduct(id){
  if(!confirm("Hapus produk ini?"))return;
  products=products.filter(x=>x.id!==id);
  cart=cart.filter(x=>x.id!==id);
  saveAll(); renderAdminProducts(); toast("Produk dihapus");
}
function renderAdminProducts(){
  const el=document.getElementById("adminProductList");
  if(!products.length){el.innerHTML='<div class="empty">Belum ada produk.</div>';return;}
  el.innerHTML=products.map(p=>`
    <div class="admin-item">
      <img class="admin-thumb" src="${p.image}">
      <div><strong>${p.name}</strong><div>${money(p.price)} · Stok ${p.stock}</div></div>
      <div class="admin-item-actions">
        <button class="mini" onclick="editProduct('${p.id}')">Edit</button>
        <button class="mini danger" onclick="deleteProduct('${p.id}')">Hapus</button>
      </div>
    </div>`).join("");
}
function renderOrders(){
  const el=document.getElementById("orderList");
  if(!orders.length){el.innerHTML='<div class="empty">Belum ada order.</div>';return;}
  el.innerHTML=orders.map(o=>`
    <div class="order-card">
      <div>
        <strong>${o.id} — ${o.customer.name}</strong>
        <div>${new Date(o.createdAt).toLocaleString("id-ID")} · ${o.customer.phone}</div>
        <div class="order-items">${o.items.map(i=>`${i.name} × ${i.qty}`).join(", ")}</div>
        <div><strong>${money(o.total)}</strong> · ${o.payment}</div>
      </div>
      <div>
        <select onchange="changeOrderStatus('${o.id}',this.value)">
          ${["Pending","Paid","Processing","Shipped","Completed","Cancelled"].map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}
        </select>
      </div>
    </div>`).join("");
}
function changeOrderStatus(id,status){
  const o=orders.find(x=>x.id===id); if(o)o.status=status;
  saveAll(); toast("Status order diperbarui");
}

saveAll();
renderProducts();
