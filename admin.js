"use strict";

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value)||0);
const escapeHTML = (value="") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
const IMAGE_BUCKET="product-images";
const MAX_IMAGE_BYTES=5*1024*1024;
const IMAGE_TYPES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
let config, session, products=[], previewObjectUrl="";

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
async function loadOrders(){$("orderMessage").textContent="Memuat pesanan…";try{const [orders,items]=await Promise.all([request("/rest/v1/orders?select=*&order=created_at.desc&limit=100"),request("/rest/v1/order_items?select=*&limit=500")]);$("orderMessage").textContent=`${orders.length} pesanan dan ${items.length} item ditemukan.`;$("orderTable").innerHTML=orders.length?`<table><thead><tr><th>Pesanan</th><th>Tanggal</th><th>Status</th><th>Total</th><th>Data</th></tr></thead><tbody>${orders.map(o=>{const orderItems=items.filter(item=>item.order_id===o.id);return `<tr><td><strong>${escapeHTML(o.order_number||o.id)}</strong><small>${orderItems.length} item</small></td><td>${o.created_at?new Date(o.created_at).toLocaleString("id-ID"):"-"}</td><td>${escapeHTML(o.status||"-")}</td><td>${money(o.total||o.grand_total)}</td><td><details><summary>Lihat</summary><pre>${escapeHTML(JSON.stringify({order:o,items:orderItems},null,2))}</pre></details></td></tr>`}).join("")}</tbody></table>`:'<div class="empty-admin">Belum ada pesanan.</div>';}catch(error){$("orderMessage").textContent=`Orders belum dapat dibaca: ${error.message}. Periksa apakah kedua tabel dan migration admin tersedia.`;$("orderTable").innerHTML="";}}

$("loginForm").addEventListener("submit",async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$("loginError").classList.add("hidden");try{const candidate=await authenticate($("email").value.trim(),$("password").value);const profile=await verifyAdmin(candidate);storeSession(candidate);await enterDashboard(profile);}catch(error){storeSession(null);showLogin(error.message);}finally{button.disabled=false;}});
$("signOut").addEventListener("click",async()=>{try{await request("/auth/v1/logout",{method:"POST"});}catch{}storeSession(null);session=null;showLogin("Anda telah keluar.");});
$("addProduct").addEventListener("click",()=>openForm());$("closeDialog").addEventListener("click",()=>$("productDialog").close());$("cancelDialog").addEventListener("click",()=>$("productDialog").close());$("productForm").addEventListener("submit",saveProduct);$("productSearch").addEventListener("input",renderProducts);$("statusFilter").addEventListener("change",renderProducts);
$("productTable").addEventListener("click",async event=>{const edit=event.target.dataset.edit,toggle=event.target.dataset.toggle,del=event.target.dataset.delete;if(edit)openForm(products.find(p=>p.id===edit));if(toggle){const p=products.find(item=>item.id===toggle);await updateProduct(toggle,{is_active:!p.is_active},p.is_active?"Produk dinonaktifkan.":"Produk diaktifkan.");}if(del&&confirm("Hapus produk ini secara permanen? Tindakan ini tidak dapat dibatalkan.")){try{const product=products.find(item=>item.id===del);await request(`/rest/v1/products?id=eq.${encodeURIComponent(del)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});let warning=false;try{if(product?.image_url)await removeStoredImage(product.image_url);}catch(error){console.error("Deleted product image cleanup failed",error);warning=true;}toast(warning?"Produk dihapus, tetapi file gambar belum dapat dihapus.":"Produk dihapus.");await loadProducts();}catch(error){toast(error.message);}}});
$("productTable").addEventListener("change",async event=>{if(!event.target.dataset.stock)return;const stock=Number(event.target.value);if(!Number.isInteger(stock)||stock<0){toast("Stok harus berupa bilangan bulat nol atau lebih.");await loadProducts();return;}event.target.disabled=true;await updateProduct(event.target.dataset.stock,{stock},"Stok diperbarui.");});
$("imageFile").addEventListener("change",event=>{const file=event.target.files[0];if(!file){setImagePreview($("imageUrl").value.trim());return;}try{validateImage(file);setImagePreview(file);$("formError").classList.add("hidden");}catch(error){event.target.value="";showFormError(error.message);setImagePreview($("imageUrl").value.trim());}});
$("imageUrl").addEventListener("input",event=>{if(!$("imageFile").files.length)setImagePreview(event.target.value.trim());});
document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b===button));const orders=button.dataset.tab==="orders";$("productsPanel").classList.toggle("hidden",orders);$("ordersPanel").classList.toggle("hidden",!orders);if(orders)loadOrders();}));

(async()=>{try{config=await fetch("/api/config").then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);return data;});const saved=JSON.parse(localStorage.getItem("gyd_admin_session")||"null");if(!saved)return showLogin();const current=await refreshSession(saved.refresh_token);const profile=await verifyAdmin(current);storeSession(current);await enterDashboard(profile);}catch(error){storeSession(null);showLogin(error.message);}})();
