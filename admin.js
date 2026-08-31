"use strict";

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value)||0);
const escapeHTML = (value="") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
const IMAGE_BUCKET="product-images";
const MAX_IMAGE_BYTES=5*1024*1024;
const IMAGE_TYPES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
let config, session, products=[], orders=[], orderItems=[], previewObjectUrl="";
const ORDER_STATUSES=["pending","confirmed","processing","shipped","completed","cancelled"];

async function request(path, options={}) {
  const headers={apikey:config.supabaseAnonKey,...(session?{Authorization:`Bearer ${session.access_token}`}:{Authorization:`Bearer ${config.supabaseAnonKey}`}),...options.headers};
  if(options.body && !(options.body instanceof Blob) && !headers["Content-Type"])headers["Content-Type"]="application/json";
  const response=await fetch(`${config.supabaseUrl}${path}`, {...options,headers});
  const data=response.status===204?null:await response.json().catch(()=>null);
  if(!response.ok) throw new Error(data?.msg||data?.message||data?.error_description||data?.error||`Permintaan gagal (${response.status})`);
  return data;
}
function toast(message){$("adminToast").textContent=message;$("adminToast").classList.remove("hidden");setTimeout(()=>$("adminToast").classList.add("hidden"),2800);}
function showLogin(message=""){$("dashboardView").classList.add("hidden");$("loginView").classList.remove("hidden");$("loginError").textContent=message;$("loginError").classList.toggle("hidden",!message);}
async function authenticate(email,password){return request("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email,password})});}
async function refreshSession(refreshToken){return request("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:refreshToken})});}
function storeSession(value){session=value;if(value)localStorage.setItem("gyd_admin_session",JSON.stringify(value));else localStorage.removeItem("gyd_admin_session");}
async function verifyAdmin(candidate){session=candidate;const profiles=await request(`/rest/v1/admin_profiles?select=id,full_name,role&id=eq.${encodeURIComponent(candidate.user.id)}`);if(profiles?.[0]?.role!=="admin")throw new Error("Akun ini tidak memiliki akses admin.");return profiles[0];}
async function enterDashboard(profile){$("loginView").classList.add("hidden");$("dashboardView").classList.remove("hidden");$("adminIdentity").textContent=`${profile.full_name||session.user.email} · Admin`;await loadProducts();}
async function loadProducts(){$("productMessage").textContent="Memuat produk…";try{products=await request("/rest/v1/products?select=id,name,brand,category,description,specifications,price,original_price,stock,image_url,rating,is_active,created_at,updated_at&order=updated_at.desc");renderProducts();$("productMessage").textContent=`${products.length} produk ditemukan.`;}catch(error){$("productMessage").textContent=error.message;}}
function filteredProducts(){const query=$("productSearch").value.trim().toLowerCase(),status=$("statusFilter").value;return products.filter(p=>(status==="all"||(status==="active")===p.is_active)&&(!query||[p.name,p.brand,p.category].some(v=>String(v||"").toLowerCase().includes(query))));}
function renderProducts(){const rows=filteredProducts();$("productTable").innerHTML=rows.length?`<table><thead><tr><th>Produk</th><th>Kategori</th><th>Harga</th><th>Stok</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.map(p=>`<tr><td><div class="product-cell"><img src="${escapeHTML(p.image_url||"https://placehold.co/80x80?text=GYD")}" alt=""><span><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.brand||"")}</small></span></div></td><td>${escapeHTML(p.category||"-")}</td><td>${money(p.price)}</td><td><input class="quick-number" type="number" min="0" value="${Number(p.stock)||0}" data-stock="${p.id}" aria-label="Stok ${escapeHTML(p.name)}"></td><td><button class="status-pill ${p.is_active?"active":""}" data-toggle="${p.id}">${p.is_active?"Aktif":"Nonaktif"}</button></td><td><div class="row-actions"><button data-edit="${p.id}">Edit</button><button class="delete" data-delete="${p.id}">Hapus</button></div></td></tr>`).join("")}</tbody></table>`:'<div class="empty-admin">Tidak ada produk yang sesuai.</div>';}
function showFormError(message){$("formError").textContent=message;$("formError").classList.remove("hidden");}
function setImagePreview(source=""){
  if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl="";}
  const preview=$("imagePreview");
  if(source instanceof File){previewObjectUrl=URL.createObjectURL(source);preview.src=previewObjectUrl;}
  else preview.src=source;
  const visible=Boolean(source);preview.classList.toggle("hidden",!visible);$("imagePreviewEmpty").classList.toggle("hidden",visible);
}
function openForm(product){
  $("productForm").reset();$("productId").value=product?.id||"";$("formTitle").textContent=product?"Edit produk":"Tambah produk";
  for(const [id,key] of [["name","name"],["brand","brand"],["category","category"],["price","price"],["originalPrice","original_price"],["stock","stock"],["rating","rating"],["imageUrl","image_url"],["description","description"]])$(id).value=product?.[key]??"";
  $("specifications").value=JSON.stringify(product?.specifications||{},null,2);$("isActive").checked=product?.is_active!==false;$("formError").classList.add("hidden");setImagePreview(product?.image_url||"");$("productDialog").showModal();
}
function validateImage(file){
  if(!IMAGE_TYPES[file.type])throw new Error("Format gambar harus JPG, PNG, atau WebP.");
  if(file.size>MAX_IMAGE_BYTES)throw new Error("Ukuran gambar maksimal 5 MB.");
}
function storageObjectPath(publicUrl){
  if(!publicUrl)return null;
  try{const url=new URL(publicUrl);if(url.origin!==new URL(config.supabaseUrl).origin)return null;const prefix=`/storage/v1/object/public/${IMAGE_BUCKET}/`;if(!url.pathname.startsWith(prefix))return null;const path=decodeURIComponent(url.pathname.slice(prefix.length));return path&&!path.includes("..")?path:null;}catch{return null;}
}
const encodedPath=path=>path.split("/").map(encodeURIComponent).join("/");
async function uploadProductImage(file){
  validateImage(file);const extension=IMAGE_TYPES[file.type];const path=`products/${crypto.randomUUID()}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await request(`/storage/v1/object/${IMAGE_BUCKET}/${encodedPath(path)}`,{method:"POST",headers:{"Content-Type":file.type,"x-upsert":"false"},body:file});
  return {path,url:`${config.supabaseUrl}/storage/v1/object/public/${IMAGE_BUCKET}/${encodedPath(path)}`};
}
async function removeStoredImage(url){const path=storageObjectPath(url);if(path)await request(`/storage/v1/object/${IMAGE_BUCKET}/${encodedPath(path)}`,{method:"DELETE"});return Boolean(path);}
function productPayload(){
  let specifications;try{specifications=JSON.parse($("specifications").value||"{}");}catch{throw new Error("Spesifikasi harus berupa JSON yang valid.");}
  const stock=Number($("stock").value),rating=$("rating").value?Number($("rating").value):0,price=Number($("price").value),originalPrice=$("originalPrice").value?Number($("originalPrice").value):null;
  if(!Number.isInteger(stock)||stock<0)throw new Error("Stok harus berupa bilangan bulat nol atau lebih.");
  if(!Number.isFinite(price)||price<0||originalPrice!==null&&(!Number.isFinite(originalPrice)||originalPrice<0))throw new Error("Harga tidak boleh negatif.");
  if(!Number.isFinite(rating)||rating<0||rating>5)throw new Error("Rating harus berada di antara 0 dan 5.");
  return {name:$("name").value.trim(),brand:$("brand").value.trim(),category:$("category").value.trim(),description:$("description").value.trim(),specifications,price,original_price:originalPrice,stock,image_url:$("imageUrl").value.trim()||null,rating,is_active:$("isActive").checked};
}
async function saveProduct(event){
  event.preventDefault();$("formError").classList.add("hidden");const button=$("saveProductButton");button.disabled=true;button.textContent="Menyimpan…";
  const id=$("productId").value,oldProduct=products.find(product=>product.id===id),file=$("imageFile").files[0];let uploaded;
  try{
    const body=productPayload();if(file){uploaded=await uploadProductImage(file);body.image_url=uploaded.url;}
    await request(`/rest/v1/products${id?`?id=eq.${encodeURIComponent(id)}`:""}`,{method:id?"PATCH":"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(body)});
    let cleanupWarning=false;if(file&&oldProduct?.image_url&&oldProduct.image_url!==body.image_url){try{await removeStoredImage(oldProduct.image_url);}catch(error){console.error("Old product image cleanup failed",error);cleanupWarning=true;}}
    $("productDialog").close();toast(cleanupWarning?"Produk diperbarui, tetapi gambar lama belum dapat dihapus.":id?"Produk diperbarui.":"Produk ditambahkan.");await loadProducts();
  }catch(error){if(uploaded){try{await removeStoredImage(uploaded.url);}catch(cleanupError){console.error("Uploaded image rollback failed",cleanupError);}}showFormError(error.message);}
  finally{button.disabled=false;button.textContent="Simpan";}
}
async function updateProduct(id,changes,message){try{await request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(changes)});toast(message);await loadProducts();}catch(error){toast(error.message);}}
function firstValue(...values){return values.find(value=>value!==null&&value!==undefined&&value!=="");}
function getOrderCustomerName(order){return firstValue(order.customer_name,order.full_name,order.name,"-");}
function getOrderPhone(order){return firstValue(order.customer_phone,order.whatsapp,"-");}
function getOrderEmail(order){return firstValue(order.customer_email,order.email,"-");}
function getOrderTotal(order){return Number(order.total)||Number(order.grand_total)||Number(order.total_amount)||0;}
function getItemQty(item){return Number(item.qty)||Number(item.quantity)||1;}
function getItemUnitPrice(item){return Number(item.product_price)||Number(item.price)||Number(item.unit_price)||0;}
function getItemSubtotal(item){return Number(item.subtotal)||Number(item.total_price)||(getItemUnitPrice(item)*getItemQty(item));}
function orderDate(value){if(!value)return "-";const date=new Date(value);return Number.isNaN(date.getTime())?"-":date.toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"});}
function normalizedStatus(status){const value=String(status||"").toLowerCase();return ORDER_STATUSES.includes(value)?value:"pending";}
function statusBadge(status){const value=normalizedStatus(status);return `<span class="order-status status-${value}" data-status-badge>${escapeHTML(value)}</span>`;}
function filteredOrders(){const query=$("orderSearch").value.trim().toLowerCase(),status=$("orderStatusFilter").value;return orders.filter(order=>(status==="all"||normalizedStatus(order.status)===status)&&(!query||[order.order_number,getOrderCustomerName(order),getOrderEmail(order),getOrderPhone(order)].some(value=>String(value||"").toLowerCase().includes(query))));}
function renderOrders(){const rows=filteredOrders();$("orderTable").innerHTML=rows.length?`<table class="orders-table"><thead><tr><th>Nomor pesanan</th><th>Dibuat</th><th>Pelanggan</th><th>Status</th><th>Total</th><th>Aksi</th></tr></thead><tbody>${rows.map(order=>`<tr data-order-row="${escapeHTML(order.id)}"><td data-label="Nomor pesanan"><strong>${escapeHTML(order.order_number||order.id)}</strong></td><td data-label="Dibuat">${escapeHTML(orderDate(order.created_at))}</td><td data-label="Pelanggan"><strong>${escapeHTML(getOrderCustomerName(order))}</strong><small>${escapeHTML(getOrderPhone(order))}</small></td><td data-label="Status">${statusBadge(order.status)}</td><td data-label="Total"><strong>${money(getOrderTotal(order))}</strong></td><td data-label="Aksi"><button class="secondary detail-button" type="button" data-order-detail="${escapeHTML(order.id)}">Lihat Detail</button></td></tr>`).join("")}</tbody></table>`:'<div class="empty-admin">Belum ada pesanan.</div>';}
async function loadOrders(){const message=$("orderMessage");message.textContent="Memuat pesanan…";try{const [orderRows,itemRows]=await Promise.all([request("/rest/v1/orders?select=*&order=created_at.desc&limit=100"),request("/rest/v1/order_items?select=*&limit=500")]);orders=orderRows||[];orderItems=itemRows||[];renderOrders();message.textContent=orders.length?`${orders.length} pesanan ditemukan. Urutan terbaru terlebih dahulu.`:"";return true;}catch(error){message.textContent=`Pesanan belum dapat dimuat: ${error.message}`;$("orderTable").innerHTML="";return false;}}
function renderOrderDetails(order,items){
  const status=normalizedStatus(order.status),subtotal=Number(firstValue(order.subtotal,order.items_total,items.reduce((sum,item)=>sum+getItemSubtotal(item),0),0))||0;
  const shippingCost=Number(firstValue(order.shipping_cost,order.shipping_fee,order.delivery_cost,0))||0,discount=Number(firstValue(order.discount,order.discount_amount,0))||0;
  const address=firstValue(order.shipping_address,order.address,"-");
  $("orderDetailTitle").textContent=order.order_number||order.id;
  $("orderDetailContent").innerHTML=`<div class="order-detail-grid"><section><h3>Informasi pesanan</h3><dl><div><dt>Nomor pesanan</dt><dd>${escapeHTML(order.order_number||order.id)}</dd></div><div><dt>Dibuat</dt><dd>${escapeHTML(orderDate(order.created_at))}</dd></div><div><dt>Status saat ini</dt><dd>${statusBadge(status)}</dd></div><div><dt>Metode pembayaran</dt><dd>${escapeHTML(firstValue(order.payment_method,order.payment,"-"))}</dd></div><div><dt>Metode pengiriman</dt><dd>${escapeHTML(firstValue(order.shipping_method,order.shipping,"-"))}</dd></div></dl></section><section><h3>Pelanggan</h3><dl><div><dt>Nama</dt><dd>${escapeHTML(getOrderCustomerName(order))}</dd></div><div><dt>WhatsApp / telepon</dt><dd>${escapeHTML(getOrderPhone(order))}</dd></div><div><dt>Email</dt><dd>${escapeHTML(getOrderEmail(order))}</dd></div><div><dt>Alamat lengkap</dt><dd>${escapeHTML(address)}</dd></div><div><dt>Kota</dt><dd>${escapeHTML(firstValue(order.city,"-"))}</dd></div><div><dt>Kode pos</dt><dd>${escapeHTML(firstValue(order.postal_code,"-"))}</dd></div><div><dt>Catatan</dt><dd>${escapeHTML(firstValue(order.notes,order.note,order.customer_notes,"-"))}</dd></div></dl></section></div><section class="order-items"><h3>Item pesanan</h3><div class="admin-table-wrap"><table><thead><tr><th>Produk</th><th>Jumlah</th><th>Harga satuan</th><th>Subtotal</th></tr></thead><tbody>${items.map(item=>`<tr><td data-label="Produk">${escapeHTML(firstValue(item.product_name,item.name,"Produk"))}</td><td data-label="Jumlah">${getItemQty(item)}</td><td data-label="Harga satuan">${money(getItemUnitPrice(item))}</td><td data-label="Subtotal">${money(getItemSubtotal(item))}</td></tr>`).join("")||'<tr><td colspan="4">Tidak ada item.</td></tr>'}</tbody></table></div></section><div class="order-detail-footer"><section class="order-status-panel"><h3>Perbarui status</h3><label class="order-status-control" for="orderDetailStatus">Status pesanan<select id="orderDetailStatus">${ORDER_STATUSES.map(value=>`<option value="${value}" ${value===status?"selected":""}>${value[0].toUpperCase()+value.slice(1)}</option>`).join("")}</select></label><button id="saveOrderStatus" class="primary" type="button" data-order-status-save="${escapeHTML(order.id)}">Simpan Status</button><p id="orderStatusMessage" class="admin-message" role="status" aria-live="polite"></p></section><section class="order-summary"><h3>Ringkasan</h3><dl><div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div><div><dt>Biaya pengiriman</dt><dd>${money(shippingCost)}</dd></div><div><dt>Diskon</dt><dd>−${money(discount)}</dd></div><div class="grand-total"><dt>Grand total</dt><dd>${money(getOrderTotal(order))}</dd></div></dl></section></div>`;
}
function openOrderDetail(id){const order=orders.find(row=>String(row.id)===String(id));if(!order){toast("Pesanan tidak ditemukan. Silakan muat ulang data.");return;}renderOrderDetails(order,orderItems.filter(item=>String(item.order_id)===String(id)));if(!$("orderDialog").open)$("orderDialog").showModal();}
async function updateOrderStatus(orderId,status){return request(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status})});}
async function saveOrderStatus(id){const button=$("saveOrderStatus"),message=$("orderStatusMessage"),status=$("orderDetailStatus").value;if(!ORDER_STATUSES.includes(status)){message.textContent="Status yang dipilih tidak valid.";return;}button.disabled=true;message.textContent="Menyimpan status…";try{await updateOrderStatus(id,status);const order=orders.find(row=>String(row.id)===String(id));if(order)order.status=status;document.querySelectorAll(`[data-order-row="${CSS.escape(String(id))}"] [data-status-badge], #orderDetailContent [data-status-badge]`).forEach(badge=>{badge.outerHTML=statusBadge(status);});toast("Status pesanan diperbarui.");const reloaded=await loadOrders();const refreshed=orders.find(row=>String(row.id)===String(id));if(reloaded&&refreshed)renderOrderDetails(refreshed,orderItems.filter(item=>String(item.order_id)===String(id)));else message.textContent="Status tersimpan, tetapi data terbaru belum dapat dimuat.";}catch(error){message.textContent=`Status pesanan gagal diperbarui: ${error.message}`;}finally{const current=$("saveOrderStatus");if(current)current.disabled=false;}}

$("loginForm").addEventListener("submit",async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$("loginError").classList.add("hidden");try{const candidate=await authenticate($("email").value.trim(),$("password").value);const profile=await verifyAdmin(candidate);storeSession(candidate);await enterDashboard(profile);}catch(error){storeSession(null);showLogin(error.message);}finally{button.disabled=false;}});
$("signOut").addEventListener("click",async()=>{try{await request("/auth/v1/logout",{method:"POST"});}catch{}storeSession(null);session=null;showLogin("Anda telah keluar.");});
$("addProduct").addEventListener("click",()=>openForm());$("closeDialog").addEventListener("click",()=>$("productDialog").close());$("cancelDialog").addEventListener("click",()=>$("productDialog").close());$("productForm").addEventListener("submit",saveProduct);$("productSearch").addEventListener("input",renderProducts);$("statusFilter").addEventListener("change",renderProducts);
$("productTable").addEventListener("click",async event=>{const edit=event.target.dataset.edit,toggle=event.target.dataset.toggle,del=event.target.dataset.delete;if(edit)openForm(products.find(p=>p.id===edit));if(toggle){const p=products.find(item=>item.id===toggle);await updateProduct(toggle,{is_active:!p.is_active},p.is_active?"Produk dinonaktifkan.":"Produk diaktifkan.");}if(del&&confirm("Hapus produk ini secara permanen? Tindakan ini tidak dapat dibatalkan.")){try{const product=products.find(item=>item.id===del);await request(`/rest/v1/products?id=eq.${encodeURIComponent(del)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});let warning=false;try{if(product?.image_url)await removeStoredImage(product.image_url);}catch(error){console.error("Deleted product image cleanup failed",error);warning=true;}toast(warning?"Produk dihapus, tetapi file gambar belum dapat dihapus.":"Produk dihapus.");await loadProducts();}catch(error){toast(error.message);}}});
$("productTable").addEventListener("change",async event=>{if(!event.target.dataset.stock)return;const stock=Number(event.target.value);if(!Number.isInteger(stock)||stock<0){toast("Stok harus berupa bilangan bulat nol atau lebih.");await loadProducts();return;}event.target.disabled=true;await updateProduct(event.target.dataset.stock,{stock},"Stok diperbarui.");});
$("imageFile").addEventListener("change",event=>{const file=event.target.files[0];if(!file){setImagePreview($("imageUrl").value.trim());return;}try{validateImage(file);setImagePreview(file);$("formError").classList.add("hidden");}catch(error){event.target.value="";showFormError(error.message);setImagePreview($("imageUrl").value.trim());}});
$("imageUrl").addEventListener("input",event=>{if(!$("imageFile").files.length)setImagePreview(event.target.value.trim());});
$("orderSearch").addEventListener("input",renderOrders);$("orderStatusFilter").addEventListener("change",renderOrders);$("closeOrderDialog").addEventListener("click",()=>$("orderDialog").close());
$("orderTable").addEventListener("click",event=>{const id=event.target.closest("[data-order-detail]")?.dataset.orderDetail;if(id)openOrderDetail(id);});
$("orderDetailContent").addEventListener("click",event=>{const id=event.target.closest("[data-order-status-save]")?.dataset.orderStatusSave;if(id)saveOrderStatus(id);});
document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b===button));const orders=button.dataset.tab==="orders";$("productsPanel").classList.toggle("hidden",orders);$("ordersPanel").classList.toggle("hidden",!orders);if(orders)loadOrders();}));

(async()=>{try{config=await fetch("/api/config").then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);return data;});const saved=JSON.parse(localStorage.getItem("gyd_admin_session")||"null");if(!saved)return showLogin();const current=await refreshSession(saved.refresh_token);const profile=await verifyAdmin(current);storeSession(current);await enterDashboard(profile);}catch(error){storeSession(null);showLogin(error.message);}})();
