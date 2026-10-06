"use strict";

const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat("id-ID", {style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value)||0);
const escapeHTML = (value="") => String(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
const IMAGE_BUCKET="product-images";
const MAX_IMAGE_BYTES=5*1024*1024;
const IMAGE_TYPES={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
let config, session, products=[], orders=[], orderItems=[], payments=[], productThumbs=new Map(), orderFilter="all", orderPage=1, ordersTruncated=false, adminReady=false, applyingAdminRoute=false, adminRouteQueued=false;
const ORDER_STATUSES=["pending","confirmed","processing","shipped","completed","cancelled"];
const PAYMENT_STATUSES=["unpaid","pending","paid","failed","expired","refunded"];

async function request(path, options={}) {
  const headers={apikey:config.supabaseAnonKey,...(session?{Authorization:`Bearer ${session.access_token}`}:{Authorization:`Bearer ${config.supabaseAnonKey}`}),...options.headers};
  if(options.body && !(options.body instanceof Blob) && !headers["Content-Type"])headers["Content-Type"]="application/json";
  const response=await fetch(`${config.supabaseUrl}${path}`, {...options,headers});
  const data=response.status===204?null:await response.json().catch(()=>null);
  if(!response.ok) throw new Error(data?.msg||data?.message||data?.error_description||data?.error||`Permintaan gagal (${response.status})`);
  return data;
}
async function serverRequest(path,options={}) {
  if(!session?.access_token) throw new Error("Sesi admin tidak tersedia.");
  const headers={Authorization:`Bearer ${session.access_token}`,Accept:"application/json",...options.headers};
  if(options.body&&!headers["Content-Type"])headers["Content-Type"]="application/json";
  const response=await fetch(path,{...options,headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data?.error||data?.message||`Permintaan gagal (${response.status})`);
  return data;
}
function toast(message){$("adminToast").textContent=message;$("adminToast").classList.remove("hidden");setTimeout(()=>$("adminToast").classList.add("hidden"),2800);}
function adminRouteParts(){
  const raw=String(location.hash||"").replace(/^#\/?/,"");
  if(!raw)return ["produk"];
  return raw.split("/").filter(Boolean).map(part=>{try{return decodeURIComponent(part);}catch{return part;}});
}
function adminRouteHash(route="produk"){
  return "#"+String(route||"produk").replace(/^#\/?/,"").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
function setAdminTab(tab){
  document.querySelectorAll("[data-tab]").forEach(button=>button.classList.toggle("active",button.dataset.tab===tab));
  const ordersTab=tab==="orders";
  $("productsPanel").classList.toggle("hidden",ordersTab);
  $("ordersPanel").classList.toggle("hidden",!ordersTab);
}
function navigateAdminRoute(route="produk",{replace=false}={}){
  const target=adminRouteHash(route);
  if(location.hash===target){if(adminReady)applyAdminRoute(false);return;}
  if(replace)history.replaceState(null,"",target);else history.pushState(null,"",target);
  if(adminReady)applyAdminRoute(false);
}
function closeAdminDialogs(){
  if($("productDialog").open)$("productDialog").close();
  if($("orderDialog").open)$("orderDialog").close();
}
function queueAdminRouteApply(){
  if(adminRouteQueued)return;
  adminRouteQueued=true;
  queueMicrotask(()=>{adminRouteQueued=false;applyAdminRoute(false);});
}
async function applyAdminRoute(initial=false){
  if(!adminReady||applyingAdminRoute)return;
  applyingAdminRoute=true;
  try{
    closeAdminDialogs();
    const parts=adminRouteParts(),root=(parts[0]||"produk").toLowerCase();
    if(root==="pesanan"){
      setAdminTab("orders");
      await loadOrders();
      if(parts[1]){
        const order=orders.find(row=>String(row.id)===String(parts[1]));
        if(order)openOrderDetail(order.id);
        else{history.replaceState(null,"",adminRouteHash("pesanan"));toast("Pesanan tidak ditemukan.");}
      }
      return;
    }
    if(root==="produk"){
      setAdminTab("products");
      await loadProducts();
      if(parts[1]==="baru"){openForm();return;}
      if(parts[1]){
        const product=products.find(row=>String(row.id)===String(parts[1]));
        if(product)openForm(product);
        else{history.replaceState(null,"",adminRouteHash("produk"));toast("Produk tidak ditemukan.");}
      }
      return;
    }
    history.replaceState(null,"",adminRouteHash("produk"));
    setAdminTab("products");
    await loadProducts();
  }finally{applyingAdminRoute=false;}
}
// Login card views: sign in, request a reset link, and set a new password from it.
const AUTH_VIEWS={
  login:{form:"loginForm",title:"Masuk ke dashboard",subtitle:"Gunakan akun yang telah diberi role <strong>admin</strong>."},
  forgot:{form:"forgotForm",title:"Lupa password",subtitle:"Masukkan email admin. Kami kirimkan link untuk membuat password baru."},
  reset:{form:"resetForm",title:"Buat password baru",subtitle:"Minimal 12 karakter, dengan huruf besar, huruf kecil, angka, dan simbol."}
};
function setMessage(id,text){const element=$(id);if(!element)return;element.textContent=text||"";element.classList.toggle("hidden",!text);}
function showAuthView(name){
  adminReady=false;stopOrderNotifications();$("dashboardView").classList.add("hidden");$("loginView").classList.remove("hidden");
  const view=AUTH_VIEWS[name];
  Object.values(AUTH_VIEWS).forEach(entry=>$(entry.form).classList.toggle("hidden",entry!==view));
  $("loginTitle").textContent=view.title;$("loginSubtitle").innerHTML=view.subtitle;
  document.querySelectorAll("[data-toggle-password]").forEach(button=>setPasswordVisible(button,false));
}
function showLogin(message="",notice=""){showAuthView("login");setMessage("loginError",message);setMessage("loginNotice",notice);}
function setPasswordVisible(button,visible){
  const input=$(button.dataset.togglePassword);if(!input)return;
  input.type=visible?"text":"password";
  button.setAttribute("aria-pressed",String(visible));
  button.setAttribute("aria-label",visible?"Sembunyikan password":"Tampilkan password");
}
// Supabase puts the recovery session (or an error) in the URL fragment of the reset link.
function authRedirectFromHash(hash){
  const params=new URLSearchParams(String(hash||"").replace(/^#/,""));
  if(params.get("error")||params.get("error_code")) return {error:params.get("error_code")||params.get("error"),description:params.get("error_description")||""};
  if(params.get("type")==="recovery"&&params.get("access_token")) return {recovery:{access_token:params.get("access_token"),refresh_token:params.get("refresh_token"),expires_in:Number(params.get("expires_in"))||3600}};
  return null;
}
function passwordProblem(password){
  if(password.length<12)return "Password minimal 12 karakter.";
  if(!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/\d/.test(password)||!/[^A-Za-z0-9]/.test(password))return "Password harus berisi huruf besar, huruf kecil, angka, dan simbol.";
  return "";
}
function authErrorMessage(error){
  const text=String(error?.message||"");
  if(/different from the old password/i.test(text))return "Password baru harus berbeda dari password lama.";
  if(/weak|pwned|characters/i.test(text))return "Password terlalu lemah. Gunakan minimal 12 karakter dengan huruf besar, huruf kecil, angka, dan simbol.";
  if(/rate limit|too many|seconds/i.test(text))return "Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.";
  if(/expired|invalid.*jwt|jwt expired/i.test(text))return "Link reset sudah kedaluwarsa. Minta link baru.";
  return text||"Permintaan gagal. Coba lagi.";
}
let recoverySession=null;
async function authenticate(email,password){return request("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email,password})});}
async function refreshSession(refreshToken){return request("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:refreshToken})});}
function storeSession(value){session=value;if(value)localStorage.setItem("gyd_admin_session",JSON.stringify(value));else localStorage.removeItem("gyd_admin_session");}
async function verifyAdmin(candidate){session=candidate;const profiles=await request(`/rest/v1/admin_profiles?select=id,full_name,role&id=eq.${encodeURIComponent(candidate.user.id)}`);if(profiles?.[0]?.role!=="admin")throw new Error("Akun ini tidak memiliki akses admin.");return profiles[0];}
async function enterDashboard(profile){$("loginView").classList.add("hidden");$("dashboardView").classList.remove("hidden");$("adminIdentity").textContent=`${profile.full_name||session.user.email} · Admin`;adminReady=true;startOrderNotifications();await applyAdminRoute(true);}
async function loadProducts(){$("productMessage").textContent="Memuat produk…";try{products=await request("/rest/v1/products?select=id,name,brand,category,description,specifications,price,original_price,stock,image_url,images,rating,is_active,warranty,weight_grams,length_cm,width_cm,height_cm,is_new,created_at,updated_at&order=updated_at.desc");renderProducts();$("productMessage").textContent=`${products.length} produk ditemukan.`;}catch(error){$("productMessage").textContent=error.message;}}
function filteredProducts(){const query=$("productSearch").value.trim().toLowerCase(),status=$("statusFilter").value;return products.filter(p=>(status==="all"||(status==="active")===p.is_active)&&(!query||[p.name,p.brand,p.category].some(v=>String(v||"").toLowerCase().includes(query))));}
function renderProducts(){const rows=filteredProducts();$("productTable").innerHTML=rows.length?`<table><thead><tr><th>Produk</th><th>Kategori</th><th>Harga</th><th>Stok</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.map(p=>`<tr><td><div class="product-cell"><img src="${escapeHTML(p.image_url||"https://placehold.co/80x80?text=GYD")}" alt=""><span><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.brand||"")}</small></span></div></td><td>${escapeHTML(p.category||"-")}</td><td>${money(p.price)}</td><td><input class="quick-number" type="number" min="0" value="${Number(p.stock)||0}" data-stock="${p.id}" aria-label="Stok ${escapeHTML(p.name)}"></td><td><button class="status-pill ${p.is_active?"active":""}" data-toggle="${p.id}">${p.is_active?"Aktif":"Nonaktif"}</button></td><td><div class="row-actions"><button data-edit="${p.id}">Edit</button><button class="delete" data-delete="${p.id}">Hapus</button></div></td></tr>`).join("")}</tbody></table>`:'<div class="empty-admin">Tidak ada produk yang sesuai.</div>';}
function showFormError(message){$("formError").textContent=message;$("formError").classList.remove("hidden");}
// Product gallery (Phase 8L). Every new photo is redrawn in the browser to one of two sizes,
// square 1200x1200 or landscape 1600x1200, and uploaded as JPEG. By default the whole photo is
// kept and the spare area is filled white ("Utuh"); "Penuh" centre-crops to fill the frame
// instead, which cuts the edges of a photo whose ratio differs. At least 3 photos
// are required to save. The first photo is the cover and is also written to image_url.
const GALLERY_MIN=3,GALLERY_MAX=8,SOURCE_MAX_BYTES=20*1024*1024;
const GALLERY_SHAPES={square:{width:1200,height:1200,label:"Kotak"},landscape:{width:1600,height:1200,label:"Landscape"}};
const GALLERY_FITS={contain:"Utuh",cover:"Penuh"};
let gallery=[];
// Category and brand come from fixed lists so every product lands in a storefront tab and
// one brand is always spelled one way. Categories match app.js CATEGORIES. Brands are the
// ones sold in Indonesia per category; "Lainnya" allows a brand that is not listed yet.
const PRODUCT_CATEGORIES=["Smartphone","Laptop","Tablet","Smartwatch","Audio","Accessories"];
const BRANDS_BY_CATEGORY={
  Smartphone:["Apple","ASUS","Google","Honor","Huawei","Infinix","itel","Motorola","Nokia","Nothing","OnePlus","OPPO","POCO","realme","Redmi","Samsung","Sony","Tecno","vivo","Xiaomi","ZTE"],
  Laptop:["Acer","Advan","Apple","ASUS","Axioo","Dell","Gigabyte","HP","Huawei","Infinix","Lenovo","LG","Microsoft","MSI","Razer","Samsung","Xiaomi","Zyrex"],
  Tablet:["Advan","Apple","Honor","Huawei","Infinix","Lenovo","Microsoft","OnePlus","OPPO","POCO","realme","Redmi","Samsung","Xiaomi"],
  Smartwatch:["Amazfit","Apple","Fitbit","Garmin","Google","Huawei","Samsung","Xiaomi"],
  Audio:["Apple","Audio-Technica","Bang & Olufsen","Beats","Bose","Edifier","Harman Kardon","Jabra","JBL","Marshall","Nothing","Samsung","Sennheiser","Skullcandy","Sony","Soundcore","Xiaomi"],
  Accessories:["Anker","Apple","Baseus","Belkin","ESR","Logitech","Robot","Samsung","SanDisk","Spigen","Ugreen","Vivan","Xiaomi"]
};
const BRAND_OTHER="__other";
function fillBrandOptions(category,current=""){
  const brands=BRANDS_BY_CATEGORY[category]||[],match=brands.find(brand=>brand.toLowerCase()===String(current).trim().toLowerCase());
  $("brand").innerHTML=`<option value="">${category?"Pilih brand":"Pilih kategori dulu"}</option>${brands.map(brand=>`<option value="${escapeHTML(brand)}">${escapeHTML(brand)}</option>`).join("")}${category?`<option value="${BRAND_OTHER}">Lainnya…</option>`:""}`;
  $("brand").disabled=!category;
  const other=Boolean(category&&current&&!match);
  $("brand").value=match||(other?BRAND_OTHER:"");
  // With no category yet, the old brand waits in the hidden field until one is chosen.
  $("brandOther").value=other||!category?String(current).trim():"";
  $("brandOther").classList.toggle("hidden",!other);
}
function galleryFromProduct(product){
  const list=Array.isArray(product?.images)?product.images.filter(item=>item?.url).map(item=>({kind:"existing",url:item.url,shape:item.shape==="landscape"?"landscape":"square"})):[];
  return list.length?list:product?.image_url?[{kind:"existing",url:product.image_url,shape:"square"}]:[];
}
async function cropPhoto(file,shape,fit="contain"){
  const {width,height}=GALLERY_SHAPES[shape],bitmap=await createImageBitmap(file);
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const context=canvas.getContext("2d");context.fillStyle="#fff";context.fillRect(0,0,width,height);
  context.imageSmoothingQuality="high";
  if(fit==="cover"){
    const scale=Math.max(width/bitmap.width,height/bitmap.height),sw=width/scale,sh=height/scale;
    context.drawImage(bitmap,(bitmap.width-sw)/2,(bitmap.height-sh)/2,sw,sh,0,0,width,height);
  }else{
    const scale=Math.min(width/bitmap.width,height/bitmap.height),dw=bitmap.width*scale,dh=bitmap.height*scale;
    context.drawImage(bitmap,(width-dw)/2,(height-dh)/2,dw,dh);
  }
  bitmap.close?.();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.86));
  if(!blob)throw new Error("Foto tidak dapat diproses. Coba file lain.");
  return blob;
}
function releaseGalleryItem(item){if(item?.preview)URL.revokeObjectURL(item.preview);}
async function setGalleryShape(item,shape,fit=item.fit){
  item.shape=shape;item.fit=fit;item.busy=true;renderGallery();
  try{const blob=await cropPhoto(item.file,shape,fit);releaseGalleryItem(item);item.blob=blob;item.preview=URL.createObjectURL(blob);}
  catch(error){gallery=gallery.filter(entry=>entry!==item);showFormError(error.message);}
  finally{item.busy=false;renderGallery();}
}
async function addGalleryFiles(files){
  for(const file of files){
    if(gallery.length>=GALLERY_MAX){showFormError(`Maksimal ${GALLERY_MAX} foto per produk.`);break;}
    if(!IMAGE_TYPES[file.type]){showFormError("Format foto harus JPG, PNG, atau WebP.");continue;}
    if(file.size>SOURCE_MAX_BYTES){showFormError("Ukuran foto asli maksimal 20 MB.");continue;}
    let shape="square";
    try{const bitmap=await createImageBitmap(file);shape=bitmap.width>=bitmap.height*1.15?"landscape":"square";bitmap.close?.();}catch{showFormError("Foto tidak dapat dibaca. Coba file lain.");continue;}
    const item={kind:"new",file,shape,fit:"contain"};gallery.push(item);await setGalleryShape(item,shape);
  }
}
function renderGallery(){
  const grid=$("imagePreview");
  grid.innerHTML=gallery.map((item,index)=>{
    const src=item.kind==="new"?item.preview||"":item.url;
    const shapes=item.kind==="new"?`<div class="gallery-shapes" role="group" aria-label="Ukuran foto">${Object.entries(GALLERY_SHAPES).map(([key,shape])=>`<button type="button" class="${item.shape===key?"active":""}" data-gallery-shape="${key}" data-gallery-item="${index}" ${item.busy?"disabled":""}>${shape.label}</button>`).join("")}</div><div class="gallery-shapes" role="group" aria-label="Potong foto">${Object.entries(GALLERY_FITS).map(([key,label])=>`<button type="button" class="${item.fit===key?"active":""}" data-gallery-fit="${key}" data-gallery-item="${index}" ${item.busy?"disabled":""} title="${key==="contain"?"Foto utuh, sisa area putih":"Isi bingkai, tepi foto terpotong"}">${label}</button>`).join("")}</div>`:`<small class="gallery-note">Foto tersimpan</small>`;
    return `<figure class="gallery-item shape-${item.shape}">${index===0?'<span class="gallery-cover">Sampul</span>':""}<div class="gallery-thumb">${src?`<img src="${escapeHTML(src)}" alt="Foto ${index+1}">`:'<span>Memproses…</span>'}</div>${shapes}<div class="gallery-actions"><button type="button" data-gallery-move="-1" data-gallery-item="${index}" ${index===0?"disabled":""} aria-label="Geser ke kiri">←</button><button type="button" data-gallery-move="1" data-gallery-item="${index}" ${index===gallery.length-1?"disabled":""} aria-label="Geser ke kanan">→</button><button type="button" class="gallery-remove" data-gallery-remove="${index}" aria-label="Hapus foto">Hapus</button></div></figure>`;
  }).join("")+`<p class="gallery-count ${gallery.length<GALLERY_MIN?"short":""}">${gallery.length} dari minimal ${GALLERY_MIN} foto${gallery.length<GALLERY_MIN?` · tambah ${GALLERY_MIN-gallery.length} lagi`:""}</p>`;
}
function specLines(specifications){
  if(!specifications)return [];
  if(typeof specifications==="string")return specifications.split(/·|\n/).map(line=>line.trim()).filter(Boolean);
  if(Array.isArray(specifications))return specifications.map(String);
  if(specifications.summary)return String(specifications.summary).split("·").map(line=>line.trim()).filter(Boolean);
  return Object.entries(specifications).map(([key,value])=>`${key}: ${value}`);
}
function openForm(product){
  $("productForm").reset();$("productId").value=product?.id||"";$("formTitle").textContent=product?"Edit produk":"Tambah produk";
  for(const [id,key] of [["name","name"],["price","price"],["originalPrice","original_price"],["stock","stock"],["rating","rating"],["warranty","warranty"],["weightGrams","weight_grams"],["lengthCm","length_cm"],["widthCm","width_cm"],["heightCm","height_cm"],["description","description"]])$(id).value=product?.[key]??"";
  $("specifications").value=specLines(product?.specifications).join("\n");$("isActive").checked=product?.is_active!==false;$("isNew").checked=product?.is_new===true;$("formError").classList.add("hidden");
  const category=PRODUCT_CATEGORIES.includes(product?.category)?product.category:"";
  $("category").value=category;
  $("categoryHint").textContent=product?.category&&!category?`Kategori lama "${product.category}" tidak dikenal toko. Pilih kategori yang sesuai.`:"";
  $("categoryHint").classList.toggle("hidden",!$("categoryHint").textContent);
  fillBrandOptions(category,product?.brand||"");
  gallery.forEach(releaseGalleryItem);gallery=galleryFromProduct(product);$("imageFile").value="";renderGallery();$("productDialog").showModal();
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
  const lines=$("specifications").value.split("\n").flatMap(line=>line.split("·")).map(line=>line.trim()).filter(Boolean);
  if(lines.length>12)throw new Error("Spesifikasi utama maksimal 12 baris.");
  if(lines.some(line=>line.length>80))throw new Error("Setiap baris spesifikasi maksimal 80 karakter.");
  const specifications=lines.length?{summary:lines.join(" · ")}:{};
  const stock=Number($("stock").value),rating=$("rating").value?Number($("rating").value):0,price=Number($("price").value),originalPrice=$("originalPrice").value?Number($("originalPrice").value):null;
  const physical={
    weight_grams:$("weightGrams").value?Number($("weightGrams").value):null,
    length_cm:$("lengthCm").value?Number($("lengthCm").value):null,
    width_cm:$("widthCm").value?Number($("widthCm").value):null,
    height_cm:$("heightCm").value?Number($("heightCm").value):null
  };
  const category=$("category").value,brand=$("brand").value===BRAND_OTHER?$("brandOther").value.trim():$("brand").value;
  if(!PRODUCT_CATEGORIES.includes(category))throw new Error("Pilih kategori produk.");
  if(!brand)throw new Error($("brand").value===BRAND_OTHER?"Tulis nama brand.":"Pilih brand produk.");
  if(!Number.isInteger(stock)||stock<0)throw new Error("Stok harus berupa bilangan bulat nol atau lebih.");
  if(!Number.isFinite(price)||price<0||originalPrice!==null&&(!Number.isFinite(originalPrice)||originalPrice<0))throw new Error("Harga tidak boleh negatif.");
  if(!Number.isFinite(rating)||rating<0||rating>5)throw new Error("Rating harus berada di antara 0 dan 5.");
  const provided=Object.values(physical).filter(value=>value!==null);
  if(provided.length&&provided.length!==4)throw new Error("Untuk tarif kurir live, isi berat, panjang, lebar, dan tinggi sekaligus.");
  if(provided.some(value=>!Number.isFinite(value)||value<=0))throw new Error("Berat dan dimensi paket harus lebih dari nol.");
  if(physical.weight_grams!==null&&!Number.isInteger(physical.weight_grams))throw new Error("Berat paket harus dalam gram bulat.");
  return {name:$("name").value.trim(),brand,category,description:$("description").value.trim(),specifications,price,original_price:originalPrice,stock,rating,warranty:$("warranty").value||null,...physical,is_active:$("isActive").checked,is_new:$("isNew").checked};
}
async function saveProduct(event){
  event.preventDefault();$("formError").classList.add("hidden");const button=$("saveProductButton");
  const id=$("productId").value,oldProduct=products.find(product=>product.id===id),uploaded=[];
  try{
    const body=productPayload();
    if(gallery.some(item=>item.busy))throw new Error("Tunggu hingga semua foto selesai diproses.");
    if(gallery.length<GALLERY_MIN)throw new Error(`Tambahkan minimal ${GALLERY_MIN} foto produk (sekarang ${gallery.length}).`);
    button.disabled=true;button.textContent="Mengunggah foto…";
    const images=[];
    for(const item of gallery){
      if(item.kind==="existing"){images.push({url:item.url,shape:item.shape});continue;}
      const result=await uploadProductImage(item.blob);uploaded.push(result.url);images.push({url:result.url,shape:item.shape});
    }
    body.images=images;body.image_url=images[0].url;button.textContent="Menyimpan…";
    await request(`/rest/v1/products${id?`?id=eq.${encodeURIComponent(id)}`:""}`,{method:id?"PATCH":"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(body)});
    // Photos removed from the gallery are deleted from storage once the product is saved.
    const kept=new Set(images.map(image=>image.url)),previous=new Set([...galleryFromProduct(oldProduct).map(item=>item.url)]);
    let cleanupWarning=false;
    for(const url of previous){if(kept.has(url))continue;try{await removeStoredImage(url);}catch(error){console.error("Old product image cleanup failed",error);cleanupWarning=true;}}
    $("productDialog").close();toast(cleanupWarning?"Produk tersimpan, tetapi sebagian foto lama belum dapat dihapus.":id?"Produk diperbarui.":"Produk ditambahkan.");navigateAdminRoute("produk",{replace:true});
  }catch(error){for(const url of uploaded){try{await removeStoredImage(url);}catch(cleanupError){console.error("Uploaded image rollback failed",cleanupError);}}showFormError(error.message);}
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
const ORDER_STATUS_LABELS={pending:"Menunggu",confirmed:"Dikonfirmasi",processing:"Dijadwalkan kurir",shipped:"Dikirim",completed:"Selesai",cancelled:"Dibatalkan"};
const PAYMENT_STATUS_LABELS={unpaid:"Belum bayar",pending:"Menunggu bayar",paid:"Lunas",failed:"Gagal",expired:"Kedaluwarsa",refunded:"Refund"};
function statusBadge(status){const value=normalizedStatus(status);return `<span class="order-status status-${value}" data-status-badge="${value}">${escapeHTML(ORDER_STATUS_LABELS[value])}</span>`;}
function normalizedPaymentStatus(status){const value=String(status||"").toLowerCase();return PAYMENT_STATUSES.includes(value)?value:"unpaid";}
function paymentStatusBadge(status){const value=normalizedPaymentStatus(status);return `<span class="order-status payment-${value}">${escapeHTML(PAYMENT_STATUS_LABELS[value])}</span>`;}
function paymentForOrder(order){return payments.filter(payment=>String(payment.order_id)===String(order.id)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]||null;}
// Quick views on top of the per-status filter. "todo" is every order waiting on the
// admin: paid orders to pack/ship/hand over, and COD pickups to confirm.
const ORDER_VIEWS={
  todo:order=>{const status=normalizedStatus(order.status);return status==="confirmed"||(status==="pending"&&order.payment_method==="COD");},
  awaiting:order=>normalizedStatus(order.status)==="pending"&&order.payment_method!=="COD",
  transit:order=>["processing","shipped"].includes(normalizedStatus(order.status)),
  refund:order=>needsRefund(order)
};
function itemsForOrder(order){return orderItems.filter(item=>String(item.order_id)===String(order.id));}
function paymentsForOrder(order){return payments.filter(payment=>String(payment.order_id)===String(order.id)).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));}
function paidPayments(order){return paymentsForOrder(order).filter(payment=>payment.status==="paid");}
// An order with any paid attempt is paid, even when a later attempt expired.
function orderPaymentStatus(order){return paidPayments(order).length?"paid":normalizedPaymentStatus(paymentForOrder(order)?.status||order.payment_status);}
// Money to give back: a cancelled order that was paid, or an order paid more than once.
// Mirrors record_payment_refund (migration 028), which enforces the same rule.
function refundablePayments(order){const paid=paidPayments(order);return normalizedStatus(order.status)==="cancelled"||paid.length>1?paid:[];}
function needsRefund(order){return refundablePayments(order).length>0;}
function filteredOrders(){
  const query=$("orderSearch").value.trim().toLowerCase(),filter=orderFilter;
  return orders.filter(order=>{
    const matchesFilter=filter==="all"||(ORDER_VIEWS[filter]?ORDER_VIEWS[filter](order):normalizedStatus(order.status)===filter);
    const haystack=[order.order_number,getOrderCustomerName(order),getOrderEmail(order),getOrderPhone(order),order.city,order.tracking_number,...itemsForOrder(order).map(item=>item.product_name)];
    return matchesFilter&&(!query||haystack.some(value=>String(value||"").toLowerCase().includes(query)));
  });
}
function renderOrderStats(){
  const monthStart=new Date();monthStart.setDate(1);monthStart.setHours(0,0,0,0);
  const count=view=>orders.filter(ORDER_VIEWS[view]).length;
  const paidThisMonth=orders.filter(order=>orderPaymentStatus(order)==="paid"&&normalizedStatus(order.status)!=="cancelled"&&new Date(order.created_at)>=monthStart);
  const active=orderFilter;
  const card=(view,label,value,hint)=>`<button type="button" class="order-stat${view&&active===view?" active":""}" ${view?`data-order-view="${view}"`:"disabled"}><span>${label}</span><strong>${value}</strong><small>${hint}</small></button>`;
  const owed=orders.filter(needsRefund),owedTotal=owed.reduce((sum,order)=>sum+(normalizedStatus(order.status)==="cancelled"?paidPayments(order):paidPayments(order).slice(1)).reduce((total,payment)=>total+(Number(payment.amount)||getOrderTotal(order)),0),0);
  const banner=owed.length||active==="refund"?`<button type="button" class="refund-banner${active==="refund"?" active":""}" data-order-view="refund"><strong>${owed.length} pesanan perlu refund · ${money(owedTotal)}</strong><span>${active==="refund"?"Tampilkan semua pesanan":"Lihat pesanannya"}</span></button>`:"";
  $("orderStats").innerHTML=banner+card("todo","Perlu diproses",count("todo"),"Kemas, kirim, atau serahkan")
    +card("awaiting","Menunggu bayar",count("awaiting"),"Batal otomatis setelah 24 jam")
    +card("transit","Dalam pengiriman",count("transit"),"Diperbarui otomatis oleh kurir")
    +card("","Omzet lunas bulan ini",money(paidThisMonth.reduce((sum,order)=>sum+getOrderTotal(order),0)),`${paidThisMonth.length} pesanan`);
}
// One-line summary of what happens next, shown under the status in the list.
function nextStepHint(order,status,paymentStatus){
  const pickup=order.shipping_method==="pickup",cod=order.payment_method==="COD",paidCount=paidPayments(order).length;
  if(status!=="cancelled"&&paidCount>1)return `Dibayar ${paidCount}×: refund kelebihannya`;
  if(status==="pending")return cod?"COD: konfirmasi, lalu tunggu diambil":`Menunggu pembayaran${order.payment_access_expires_at?` s/d ${orderDate(order.payment_access_expires_at)}`:""}`;
  if(status==="confirmed")return pickup?"Siapkan untuk diambil pelanggan":order.shipping_provider==="biteship"?(order.shipping_order_id?"Menunggu kurir":"Kemas, lalu buat pengiriman"):"Kirim manual, lalu tandai dikirim";
  if(status==="processing")return "Menunggu kurir mengambil paket";
  if(status==="shipped")return order.tracking_number?`Resi ${order.tracking_number}`:"Dalam perjalanan";
  if(status==="cancelled")return paymentStatus==="paid"?"Sudah dibayar: proses refund":paymentsForOrder(order).some(payment=>payment.status==="refunded")?"Refund sudah dicatat":order.auto_cancelled_at?"Batal otomatis (tidak dibayar)":"";
  return "";
}
// The next step as a button in the row, so routine work needs no detail dialog.
// Cancelling stays in the detail dialog, next to the full order information.
function rowActions(order,status,paymentStatus){
  const {actions}=orderFlow(order,status,paymentStatus),buttons=actions.filter(key=>key!=="cancel").map(key=>`<button class="${ORDER_ACTIONS[key].tone} row-action" type="button" data-order-action="${key}" data-order-id="${escapeHTML(order.id)}">${escapeHTML(ORDER_ACTIONS[key].label)}</button>`);
  if(status==="confirmed"&&order.shipping_provider==="biteship"&&order.shipping_method!=="pickup"&&!order.shipping_order_id)buttons.push(`<button class="primary row-action" type="button" data-shipping-book="${escapeHTML(order.id)}">Buat Pengiriman Biteship</button>`);
  if(order.shipping_order_id&&["confirmed","processing","shipped"].includes(status))buttons.push(`<button class="secondary row-action" type="button" data-shipping-label="${escapeHTML(order.id)}">Cetak Label</button>`);
  return buttons.join("");
}
function orderProducts(order){
  const items=itemsForOrder(order);
  if(!items.length)return '<span class="order-products empty">Item tidak tersedia</span>';
  const [first]=items,image=productThumbs.get(String(first.product_id)),units=items.reduce((sum,item)=>sum+getItemQty(item),0);
  const thumb=/^https:\/\//i.test(String(image||""))?`<img src="${escapeHTML(image)}" alt="" width="44" height="44" loading="lazy">`:'<span class="thumb-fallback" aria-hidden="true"></span>';
  return `<div class="order-products">${thumb}<div><strong>${escapeHTML(firstValue(first.product_name,first.name,"Produk"))}</strong><small>${getItemQty(first)} unit${items.length>1?` · +${items.length-1} produk lain`:""}${items.length>1?` (${units} unit)`:""}</small></div></div>`;
}
function whatsappHref(phone){const digits=String(phone||"").replace(/\D/g,"").replace(/^0/,"62");return digits.length>=9?`https://wa.me/${digits}`:null;}
// Status tabs with counts; the quick views live on the summary cards above.
const STATUS_TABS=["all",...ORDER_STATUSES];
function renderStatusTabs(){
  const count=status=>status==="all"?orders.length:orders.filter(order=>normalizedStatus(order.status)===status).length;
  $("orderStatusFilter").innerHTML=STATUS_TABS.map(status=>`<button type="button" role="tab" aria-selected="${orderFilter===status}" class="${orderFilter===status?"active":""}" data-status-tab="${status}">${status==="all"?"Semua":ORDER_STATUS_LABELS[status]}<span>${count(status)}</span></button>`).join("");
}
const ORDER_PAGE_SIZE=50;
function renderOrderPager(total){
  const pages=Math.max(1,Math.ceil(total/ORDER_PAGE_SIZE)),start=total?(orderPage-1)*ORDER_PAGE_SIZE+1:0,end=Math.min(total,orderPage*ORDER_PAGE_SIZE);
  $("orderMessage").textContent=total?`Menampilkan ${start}–${end} dari ${total} pesanan · terbaru di atas${ordersTruncated?" · hanya 1.000 pesanan terbaru dalam rentang tanggal ini yang dimuat, persempit tanggal untuk melihat yang lebih lama":""}`:"";
  $("orderPager").innerHTML=pages>1?`<button class="secondary" type="button" data-order-page="${orderPage-1}" ${orderPage<=1?"disabled":""}>‹ Sebelumnya</button><span>Halaman ${orderPage} dari ${pages}</span><button class="secondary" type="button" data-order-page="${orderPage+1}" ${orderPage>=pages?"disabled":""}>Berikutnya ›</button>`:"";
}
function renderOrders(){
  renderOrderStats();
  renderStatusTabs();
  const all=filteredOrders(),pages=Math.max(1,Math.ceil(all.length/ORDER_PAGE_SIZE));
  orderPage=Math.min(Math.max(1,orderPage),pages);
  const rows=all.slice((orderPage-1)*ORDER_PAGE_SIZE,orderPage*ORDER_PAGE_SIZE);
  renderOrderPager(all.length);
  $("orderTable").innerHTML=rows.length?`<div class="order-list" role="list">${rows.map(order=>{
    const status=normalizedStatus(order.status),paymentStatus=orderPaymentStatus(order),wa=whatsappHref(getOrderPhone(order));
    const pickup=order.shipping_method==="pickup";
    return `<article class="order-row status-row-${status}" role="listitem" data-order-row="${escapeHTML(order.id)}">
<div class="order-cell order-id"><strong>${escapeHTML(order.order_number||order.id)}</strong><small>${escapeHTML(orderDate(order.created_at))}</small><small>${escapeHTML(firstValue(order.payment_method,"-"))}</small></div>
<div class="order-cell">${orderProducts(order)}</div>
<div class="order-cell order-customer"><strong>${escapeHTML(getOrderCustomerName(order))}</strong><small>${escapeHTML(firstValue(order.city,"-"))}</small>${wa?`<a class="wa-chip" href="${wa}" target="_blank" rel="noopener" aria-label="Chat WhatsApp ${escapeHTML(getOrderCustomerName(order))}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 19l1.1-3.3A7.5 7.5 0 1 1 9 18.6z"/></svg>WhatsApp</a>`:""}</div>
<div class="order-cell order-shipping"><strong>${escapeHTML(pickup?"Ambil di toko":firstValue(order.shipping_service_name,"Kurir"))}</strong>${order.tracking_number?`<small>Resi ${escapeHTML(order.tracking_number)}</small>`:""}</div>
<div class="order-cell order-state"><div class="badges">${statusBadge(status)}${paymentStatusBadge(paymentStatus)}</div>${(hint=>hint?`<small>${escapeHTML(hint)}</small>`:"")(nextStepHint(order,status,paymentStatus))}</div>
<div class="order-cell order-total"><strong>${money(getOrderTotal(order))}</strong><div class="order-row-actions">${rowActions(order,status,paymentStatus)}<button class="secondary detail-button" type="button" data-order-detail="${escapeHTML(order.id)}">Detail</button></div></div>
</article>`;}).join("")}</div>`:'<div class="empty-admin">Tidak ada pesanan untuk filter ini.</div>';
}
// Date filter: presets are local calendar days (the admin works in WIB).
function orderDateRange(){
  const preset=$("orderDateFilter").value,day=offset=>{const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()+offset);return date;};
  if(preset==="today")return {from:day(0)};
  if(preset==="7d")return {from:day(-6)};
  if(preset==="30d")return {from:day(-29)};
  if(preset==="month"){const from=day(0);from.setDate(1);return {from};}
  if(preset==="custom"){
    const parse=value=>value?new Date(`${value}T00:00:00`):null,from=parse($("orderDateFrom").value),to=parse($("orderDateTo").value);
    if(to)to.setDate(to.getDate()+1);
    return {from,to};
  }
  return {};
}
const ORDER_LOAD_LIMIT=1000;
async function loadOrders(){
  const message=$("orderMessage");message.textContent="Memuat pesanan…";
  const {from,to}=orderDateRange(),bounds=[from&&`created_at.gte.${from.toISOString()}`,to&&`created_at.lt.${to.toISOString()}`].filter(Boolean);
  // Items and payments come embedded with each order, so every loaded order has them.
  const query=`/rest/v1/orders?select=*,order_items(*),payments(id,order_id,provider,payment_method,status,amount,provider_reference,external_transaction_id,expires_at,paid_at,created_at,refund_amount,refund_method,refund_reference,refund_note,refunded_at)&order=created_at.desc&limit=${ORDER_LOAD_LIMIT}${bounds.length?`&and=(${bounds.join(",")})`:""}`;
  try{
    const [orderRows,thumbRows]=await Promise.all([request(query),request("/rest/v1/products?select=id,image_url").catch(()=>[])]);
    orders=orderRows||[];ordersTruncated=orders.length>=ORDER_LOAD_LIMIT;
    orderItems=orders.flatMap(order=>(order.order_items||[]).map(item=>({...item,order_id:item.order_id??order.id})));
    payments=orders.flatMap(order=>order.payments||[]);
    productThumbs=new Map((thumbRows||[]).map(row=>[String(row.id),row.image_url]));
    renderOrders();
    return true;
  }catch(error){message.textContent=`Pesanan belum dapat dimuat: ${error.message}`;$("orderTable").innerHTML="";$("orderPager").innerHTML="";return false;}
}
function renderOrderDetails(order,items){
  const status=normalizedStatus(order.status),subtotal=Number(firstValue(order.subtotal,order.items_total,items.reduce((sum,item)=>sum+getItemSubtotal(item),0),0))||0;
  const shippingCost=Number(firstValue(order.shipping_cost,order.shipping_fee,order.delivery_cost,0))||0,discount=Number(firstValue(order.discount,order.discount_amount,0))||0;
  const address=firstValue(order.shipping_address,order.address,"-");
  const payment=paidPayments(order)[0]||paymentForOrder(order),paymentStatus=orderPaymentStatus(order);
  $("orderDetailTitle").textContent=order.order_number||order.id;
  $("orderDetailContent").innerHTML=`<div class="order-detail-grid"><section><h3>Informasi pesanan</h3><dl><div><dt>Nomor pesanan</dt><dd>${escapeHTML(order.order_number||order.id)}</dd></div><div><dt>Dibuat</dt><dd>${escapeHTML(orderDate(order.created_at))}</dd></div><div><dt>Status pesanan</dt><dd>${statusBadge(status)}</dd></div><div><dt>Metode pengiriman</dt><dd>${escapeHTML(firstValue(order.shipping_service_name,order.shipping_method,order.shipping,"-"))}</dd></div><div><dt>Provider pengiriman</dt><dd>${escapeHTML(firstValue(order.shipping_provider,"-"))}</dd></div><div><dt>Layanan</dt><dd>${escapeHTML(firstValue(order.shipping_service_code,"-"))}</dd></div><div><dt>Estimasi</dt><dd>${order.shipping_eta_min_days==null?"-":escapeHTML(order.shipping_eta_min_days===order.shipping_eta_max_days?`${order.shipping_eta_min_days} hari`:`${order.shipping_eta_min_days}–${order.shipping_eta_max_days} hari`)}</dd></div><div><dt>Nomor resi</dt><dd>${escapeHTML(firstValue(order.tracking_number,"-"))}</dd></div><div><dt>Status pengiriman</dt><dd>${escapeHTML(firstValue(order.shipping_status,"-"))}</dd></div><div><dt>Biteship Order ID</dt><dd>${escapeHTML(firstValue(order.shipping_order_id,"-"))}</dd></div><div><dt>Tracking ID</dt><dd>${escapeHTML(firstValue(order.shipping_tracking_id,"-"))}</dd></div><div><dt>Biaya aktual kurir</dt><dd>${order.shipping_cost_actual==null?"-":money(order.shipping_cost_actual)}</dd></div><div><dt>Tracking</dt><dd>${order.tracking_url?`<a href="${escapeHTML(order.tracking_url)}" target="_blank" rel="noopener">Buka tracking kurir</a>`:"-"}</dd></div></dl></section><section><h3>Pembayaran</h3><dl><div><dt>Metode</dt><dd>${escapeHTML(firstValue(payment?.payment_method,order.payment_method,order.payment,"-"))}</dd></div><div><dt>Status pembayaran</dt><dd>${paymentStatusBadge(paymentStatus)}</dd></div><div><dt>Provider</dt><dd>${escapeHTML(firstValue(payment?.provider,"-"))}</dd></div><div><dt>Referensi</dt><dd>${escapeHTML(firstValue(payment?.provider_reference,order.payment_reference,"-"))}</dd></div><div><dt>ID transaksi</dt><dd>${escapeHTML(firstValue(payment?.external_transaction_id,"-"))}</dd></div><div><dt>Dibayar</dt><dd>${escapeHTML(orderDate(payment?.paid_at))}</dd></div><div><dt>Kedaluwarsa</dt><dd>${escapeHTML(orderDate(payment?.expires_at))}</dd></div></dl></section><section><h3>Pelanggan</h3><dl><div><dt>Nama</dt><dd>${escapeHTML(getOrderCustomerName(order))}</dd></div><div><dt>WhatsApp / telepon</dt><dd>${escapeHTML(getOrderPhone(order))}</dd></div><div><dt>Email</dt><dd>${escapeHTML(getOrderEmail(order))}</dd></div><div><dt>Alamat lengkap</dt><dd>${escapeHTML(address)}</dd></div><div><dt>Kota</dt><dd>${escapeHTML(firstValue(order.city,"-"))}</dd></div><div><dt>Kode pos</dt><dd>${escapeHTML(firstValue(order.postal_code,"-"))}</dd></div><div><dt>Catatan</dt><dd>${escapeHTML(firstValue(order.notes,order.note,order.customer_notes,"-"))}</dd></div></dl></section></div><section class="order-items"><h3>Item pesanan</h3><div class="admin-table-wrap"><table><thead><tr><th>Produk</th><th>Jumlah</th><th>Harga satuan</th><th>Subtotal</th></tr></thead><tbody>${items.map(item=>`<tr><td data-label="Produk">${escapeHTML(firstValue(item.product_name,item.name,"Produk"))}</td><td data-label="Jumlah">${getItemQty(item)}</td><td data-label="Harga satuan">${money(getItemUnitPrice(item))}</td><td data-label="Subtotal">${money(getItemSubtotal(item))}</td></tr>`).join("")||'<tr><td colspan="4">Tidak ada item.</td></tr>'}</tbody></table></div></section><div class="order-detail-footer">${order.shipping_provider==="biteship"?`<section class="order-status-panel"><h3>Pengiriman Biteship</h3><p><strong>${escapeHTML(firstValue(order.shipping_service_name,order.shipping_service_code,"Biteship"))}</strong></p>${order.shipping_order_id?`<div class="order-flow-actions"><button class="primary" type="button" data-shipping-label="${escapeHTML(order.id)}">Cetak Label</button><button class="secondary" type="button" data-shipping-track="${escapeHTML(order.id)}" ${order.shipping_tracking_id?"":"disabled"}>Refresh Tracking</button></div>`:`<button class="primary" type="button" data-shipping-book="${escapeHTML(order.id)}">Buat Pengiriman Biteship</button>`}<p id="shippingActionMessage" class="admin-message" role="status" aria-live="polite"></p></section>`:""}${orderFlowPanel(order,status,paymentStatus)}${refundPanel(order)}<section class="order-summary"><h3>Ringkasan</h3><dl><div><dt>Subtotal</dt><dd>${money(subtotal)}</dd></div><div><dt>Biaya pengiriman</dt><dd>${money(shippingCost)}</dd></div><div><dt>Diskon</dt><dd>−${money(discount)}</dd></div><div class="grand-total"><dt>Grand total</dt><dd>${money(getOrderTotal(order))}</dd></div></dl></section></div>`;
}
function openOrderDetail(id){const order=orders.find(row=>String(row.id)===String(id));if(!order){toast("Pesanan tidak ditemukan. Silakan muat ulang data.");return;}renderOrderDetails(order,orderItems.filter(item=>String(item.order_id)===String(id)));if(!$("orderDialog").open)$("orderDialog").showModal();}
// The order moves along its flow automatically (payment webhook, Biteship webhook,
// auto-cancel of unpaid orders). Admins only get the steps that belong to the order's
// current stage; the database (migration 020) rejects any other jump.
const ORDER_ACTIONS=Object.freeze({
  confirm:{to:"confirmed",label:"Konfirmasi Pesanan",tone:"primary",confirm:"Konfirmasi pesanan COD ini? Pastikan stok siap untuk diambil pelanggan."},
  pickedUp:{to:"completed",label:"Tandai Sudah Diambil",tone:"primary",confirm:"Tandai pesanan sudah diambil pelanggan? Status menjadi selesai dan tidak dapat diubah lagi."},
  pickedUpCod:{to:"completed",label:"Tandai Sudah Diambil & Dibayar",tone:"primary",confirm:"Pastikan pembayaran tunai sudah diterima. Tandai pesanan selesai? Status tidak dapat diubah lagi."},
  shipped:{to:"shipped",label:"Tandai Sudah Dikirim",tone:"primary",confirm:"Tandai pesanan sudah diserahkan ke kurir?"},
  completed:{to:"completed",label:"Tandai Selesai",tone:"secondary",confirm:"Tandai pesanan sudah diterima pelanggan? Status tidak dapat diubah lagi."},
  cancel:{to:"cancelled",label:"Batalkan Pesanan",tone:"danger-button",confirm:"Batalkan pesanan ini? Stok dikembalikan bila barang belum dikirim. Pembatalan tidak dapat diurungkan."}
});
function orderFlow(order,status,paymentStatus){
  const pickup=order.shipping_method==="pickup",cod=order.payment_method==="COD",biteship=order.shipping_provider==="biteship",paid=paymentStatus==="paid";
  const actions=[];let note="";
  if(status==="pending"){
    if(cod){actions.push("confirm","pickedUpCod");note="Pesanan COD Ambil di Toko: konfirmasi, lalu tandai selesai saat pelanggan mengambil dan membayar.";}
    else{const deadline=order.payment_access_expires_at?orderDate(order.payment_access_expires_at):null;note=`Menunggu pembayaran. Status berubah otomatis menjadi confirmed setelah dibayar${deadline?`, atau dibatalkan otomatis bila belum dibayar sampai ${deadline}`:""}.`;}
    actions.push("cancel");
  }else if(status==="confirmed"){
    if(pickup){actions.push(cod?"pickedUpCod":"pickedUp");note="Siapkan barang. Tandai selesai saat pelanggan mengambil pesanan.";}
    else if(biteship){note="Langkah berikutnya: kemas barang, lalu klik Buat Pengiriman Biteship. Status selanjutnya diperbarui otomatis oleh Biteship.";}
    else{actions.push("shipped");note="Pesanan ini memakai tarif ongkir cadangan (tanpa Biteship). Kirim manual, lalu tandai sudah dikirim.";}
    actions.push("cancel");
  }else if(status==="processing"){
    note="Kurir sedang dijadwalkan. Status berubah otomatis menjadi shipped saat paket diambil kurir.";
    actions.push("cancel");
  }else if(status==="shipped"){
    note=biteship?"Dalam pengiriman. Status berubah otomatis menjadi completed saat paket diterima. Gunakan Tandai Selesai hanya bila update Biteship tidak masuk.":"Dalam pengiriman. Tandai selesai setelah pelanggan menerima paket.";
    actions.push("completed","cancel");
  }else if(status==="cancelled"){
    note=order.auto_cancelled_at?`Dibatalkan otomatis pada ${orderDate(order.auto_cancelled_at)} karena tidak dibayar sampai batas waktu.`:"Pesanan dibatalkan.";
    if(paid)note+=" Pembayaran tetap masuk: kembalikan dananya lewat dashboard Midtrans atau transfer, lalu catat di bagian Refund.";
  }else if(status==="completed"){note="Pesanan selesai.";}
  return {actions,note,paid};
}
function orderFlowPanel(order,status,paymentStatus){
  const {actions,note}=orderFlow(order,status,paymentStatus);
  return `<section class="order-status-panel"><h3>Alur pesanan</h3><p class="order-flow-note">${escapeHTML(note)}</p>${actions.length?`<div class="order-flow-actions">${actions.map(key=>`<button class="${ORDER_ACTIONS[key].tone}" type="button" data-order-action="${key}" data-order-id="${escapeHTML(order.id)}">${escapeHTML(ORDER_ACTIONS[key].label)}</button>`).join("")}</div>`:""}<p id="orderStatusMessage" class="admin-message" role="status" aria-live="polite"></p></section>`;
}
// Refunds are paid out in the Midtrans dashboard or by bank transfer; this records them.
const REFUND_METHODS=Object.freeze({midtrans:"Dashboard Midtrans",bank_transfer:"Transfer bank manual",cash:"Tunai",other:"Lainnya"});
function refundPanel(order){
  const shown=paymentsForOrder(order).filter(payment=>payment.status==="refunded"||(payment.status==="paid"&&needsRefund(order)));
  if(!shown.length)return "";
  const refundable=new Set(refundablePayments(order).map(payment=>String(payment.id))),paidCount=paidPayments(order).length,cancelled=normalizedStatus(order.status)==="cancelled";
  const intro=refundable.size?(cancelled?"Pesanan dibatalkan tetapi sudah dibayar. Kembalikan dananya lewat dashboard Midtrans atau transfer, lalu catat di sini.":`Pesanan ini dibayar ${paidCount} kali. Proses satu pembayaran, kembalikan kelebihannya, lalu catat di sini.`):"Semua refund untuk pesanan ini sudah dicatat.";
  const row=payment=>{
    const amount=Number(payment.amount)||getOrderTotal(order),reference=firstValue(payment.external_transaction_id,payment.provider_reference,"-");
    if(payment.status==="refunded")return `<li class="refund-item done"><div><strong>${money(payment.refund_amount??amount)} dikembalikan</strong><small>${escapeHTML(REFUND_METHODS[payment.refund_method]||"Refund")} · ${escapeHTML(orderDate(payment.refunded_at))}${payment.refund_reference?` · Ref. ${escapeHTML(payment.refund_reference)}`:""}</small>${payment.refund_note?`<small>${escapeHTML(payment.refund_note)}</small>`:""}<small>Pembayaran ${money(amount)} · ${escapeHTML(reference)}</small></div>${paymentStatusBadge("refunded")}</li>`;
    const form=refundable.has(String(payment.id))?`<details class="refund-form-toggle"><summary class="secondary">Catat Refund</summary><form class="refund-form" data-refund-form="${escapeHTML(payment.id)}" data-order-id="${escapeHTML(order.id)}"><label>Jumlah dikembalikan<input name="amount" type="number" min="1" max="${amount}" step="1" value="${amount}" required></label><label>Cara refund<select name="method" required>${Object.entries(REFUND_METHODS).map(([value,label])=>`<option value="${value}">${escapeHTML(label)}</option>`).join("")}</select></label><label class="wide">Nomor referensi<input name="reference" maxlength="120" placeholder="ID refund Midtrans atau nomor transfer"></label><label class="wide">Catatan<textarea name="note" rows="2" maxlength="500" placeholder="Opsional, misalnya alasan atau potongan biaya"></textarea></label><div class="wide refund-form-actions"><button class="primary" type="submit">Simpan Refund</button></div></form></details>`:"";
    return `<li class="refund-item"><div><strong>${money(amount)} · ${escapeHTML(firstValue(payment.payment_method,order.payment_method,"-"))}</strong><small>Dibayar ${escapeHTML(orderDate(payment.paid_at))} · ${escapeHTML(reference)}</small></div>${paymentStatusBadge("paid")}${form}</li>`;
  };
  return `<section class="order-status-panel refund-panel"><h3>Refund</h3><p class="order-flow-note">${escapeHTML(intro)}</p><ul class="refund-list">${shown.map(row).join("")}</ul><p id="refundMessage" class="admin-message" role="status" aria-live="polite"></p></section>`;
}
function refundError(error){
  if(/REFUND_REQUIRES_CANCELLED_ORDER/.test(error.message))return "Refund hanya untuk pesanan yang dibatalkan atau dibayar lebih dari sekali. Batalkan pesanan dulu bila semua dana dikembalikan.";
  if(/PAYMENT_NOT_REFUNDABLE/.test(error.message))return "Pembayaran ini sudah tidak berstatus lunas. Muat ulang pesanan.";
  if(/INVALID_REFUND_AMOUNT/.test(error.message))return "Jumlah refund harus lebih dari 0 dan tidak melebihi nominal pembayaran.";
  if(/NOT_ADMIN/.test(error.message))return "Akun ini tidak punya akses admin.";
  if(/record_payment_refund/.test(error.message))return "Fitur refund belum aktif di database. Jalankan migration 028.";
  return error.message;
}
async function submitRefund(form){
  const order=orders.find(row=>String(row.id)===String(form.dataset.orderId));if(!order)return;
  const data=new FormData(form),amount=Number(data.get("amount")),method=String(data.get("method")||"");
  if(!window.confirm(`Catat refund ${money(amount)} via ${REFUND_METHODS[method]||method} untuk ${order.order_number}? Pastikan dananya sudah benar-benar dikembalikan. Catatan ini tidak dapat diubah.`))return;
  const message=$("refundMessage"),button=form.querySelector("button[type=submit]");
  button.disabled=true;if(message)message.textContent="Menyimpan refund…";
  try{
    await request("/rest/v1/rpc/record_payment_refund",{method:"POST",body:JSON.stringify({p_payment_id:form.dataset.refundForm,p_amount:amount,p_method:method,p_reference:String(data.get("reference")||""),p_note:String(data.get("note")||"")})});
    toast("Refund dicatat.");
    const reloaded=await loadOrders(),refreshed=orders.find(row=>String(row.id)===String(order.id));
    if(reloaded&&refreshed)renderOrderDetails(refreshed,orderItems.filter(item=>String(item.order_id)===String(order.id)));
    else if(message)message.textContent="Refund tersimpan, tetapi data terbaru belum dapat dimuat.";
  }catch(error){if(message)message.textContent=`Refund gagal dicatat: ${refundError(error)}`;button.disabled=false;}
}
function orderStatusError(error){
  if(/INVALID_ORDER_STATUS_TRANSITION/.test(error.message))return "Status sudah berubah atau langkah ini tidak sesuai alur pesanan. Muat ulang pesanan lalu coba lagi.";
  if(/INSUFFICIENT_STOCK/.test(error.message))return "Stok tidak mencukupi.";
  return error.message;
}
async function updateOrderStatus(orderId,status){return request(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({status})});}
async function runOrderAction(id,key){const action=ORDER_ACTIONS[key],order=orders.find(row=>String(row.id)===String(id));if(!action||!order)return;const paymentStatus=orderPaymentStatus(order);let prompt=action.confirm;if(key==="cancel"&&paymentStatus==="paid")prompt+=" Pesanan ini SUDAH DIBAYAR: kembalikan dananya lewat dashboard Midtrans atau transfer, lalu catat di bagian Refund pada detail pesanan.";if(key==="cancel"&&["processing","shipped"].includes(normalizedStatus(order.status))&&order.shipping_order_id)prompt+=" Batalkan juga pengirimannya di dashboard Biteship.";if(!window.confirm(prompt))return;const message=$("orderStatusMessage");document.querySelectorAll("[data-order-action]").forEach(button=>{button.disabled=true;});if(message)message.textContent="Menyimpan…";try{await updateOrderStatus(id,action.to);toast("Status pesanan diperbarui.");const reloaded=await loadOrders();const refreshed=orders.find(row=>String(row.id)===String(id));if(reloaded&&refreshed)renderOrderDetails(refreshed,orderItems.filter(item=>String(item.order_id)===String(id)));else if(message)message.textContent="Status tersimpan, tetapi data terbaru belum dapat dimuat.";}catch(error){if(message)message.textContent=`Status gagal diperbarui: ${orderStatusError(error)}`;if(!$("orderDialog").open)toast(`Status gagal diperbarui: ${orderStatusError(error)}`);document.querySelectorAll("[data-order-action]").forEach(button=>{button.disabled=false;});}}

async function bookShipment(id){
  const button=document.querySelector(`[data-shipping-book="${CSS.escape(String(id))}"]`),message=$("shippingActionMessage");
  if(button){button.disabled=true;button.textContent="Membuat pengiriman…";} if(message)message.textContent="Menghubungkan pesanan ke Biteship…";
  try{
    const result=await serverRequest("/api/shipping/book",{method:"POST",body:JSON.stringify({orderId:id})});
    toast(result.environment==="test"?"Pengiriman test Biteship berhasil dibuat.":"Pengiriman Biteship berhasil dibuat.");
    await loadOrders();const refreshed=orders.find(row=>String(row.id)===String(id));if(refreshed)renderOrderDetails(refreshed,orderItems.filter(item=>String(item.order_id)===String(id)));
  }catch(error){if(message)message.textContent=`Booking gagal: ${error.message}`;if(!$("orderDialog").open)toast(`Booking gagal: ${error.message}`);}
  finally{const current=document.querySelector(`[data-shipping-book="${CSS.escape(String(id))}"]`);if(current){current.disabled=false;current.textContent="Buat Pengiriman Biteship";}}
}
// Biteship has no label API: fetch the label data, render it into #printArea and
// open the browser print dialog (print to a label printer, or save as PDF).
async function printShippingLabel(id){
  const button=document.querySelector(`[data-shipping-label="${CSS.escape(String(id))}"]`),message=$("shippingActionMessage");
  if(button){button.disabled=true;button.textContent="Menyiapkan label…";} if(message)message.textContent="";
  try{
    const data=await serverRequest("/api/shipping/label",{method:"POST",body:JSON.stringify({orderId:id})});
    $("printArea").innerHTML=window.GydLabel.labelHTML(data);
    // The courier and store logos must be loaded before the print dialog snapshots the page.
    await Promise.all([...$("printArea").querySelectorAll("img")].map(img=>img.decode().catch(()=>{})));
    // The document title becomes the suggested PDF file name.
    const title=document.title;document.title=`Label ${data.orderNumber} ${data.trackingNumber}`;
    window.print();
    document.title=title;
  }catch(error){if(message)message.textContent=`Label gagal dibuat: ${error.message}`;if(!$("orderDialog").open)toast(`Label gagal dibuat: ${error.message}`);}
  finally{const current=document.querySelector(`[data-shipping-label="${CSS.escape(String(id))}"]`);if(current){current.disabled=false;current.textContent="Cetak Label";}}
}
async function refreshShipmentTracking(id){
  const button=document.querySelector(`[data-shipping-track="${CSS.escape(String(id))}"]`),message=$("shippingActionMessage");
  if(button){button.disabled=true;button.textContent="Memuat tracking…";} if(message)message.textContent="Memperbarui tracking dari Biteship…";
  try{
    const result=await serverRequest("/api/shipping/track",{method:"POST",body:JSON.stringify({orderId:id})});
    toast(`Tracking diperbarui: ${result.status||"status terbaru"}.`);
    await loadOrders();const refreshed=orders.find(row=>String(row.id)===String(id));if(refreshed)renderOrderDetails(refreshed,orderItems.filter(item=>String(item.order_id)===String(id)));
  }catch(error){if(message)message.textContent=`Tracking gagal diperbarui: ${error.message}`;}
  finally{const current=document.querySelector(`[data-shipping-track="${CSS.escape(String(id))}"]`);if(current){current.disabled=false;current.textContent="Refresh Tracking";}}
}

$("loginForm").addEventListener("submit",async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;$("loginError").classList.add("hidden");try{const candidate=await authenticate($("email").value.trim(),$("password").value);const profile=await verifyAdmin(candidate);storeSession(candidate);await enterDashboard(profile);}catch(error){storeSession(null);showLogin(error.message);}finally{button.disabled=false;}});
$("forgotPasswordLink").addEventListener("click",()=>{$("forgotEmail").value=$("email").value.trim();setMessage("forgotMessage","");setMessage("forgotError","");showAuthView("forgot");$("forgotEmail").focus();});
document.querySelectorAll("[data-back-to-login]").forEach(button=>button.addEventListener("click",()=>showLogin()));
document.querySelectorAll("[data-toggle-password]").forEach(button=>button.addEventListener("click",()=>{setPasswordVisible(button,button.getAttribute("aria-pressed")!=="true");$(button.dataset.togglePassword).focus();}));
$("forgotForm").addEventListener("submit",async event=>{
  event.preventDefault();const button=event.submitter;button.disabled=true;setMessage("forgotError","");setMessage("forgotMessage","");
  try{
    // The link returns to this page; add it to Supabase Auth > URL Configuration > Redirect URLs.
    const redirect=`${location.origin}${location.pathname}`;
    await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`,{method:"POST",body:JSON.stringify({email:$("forgotEmail").value.trim()})});
    // Same message whether or not the email exists, so the form does not reveal accounts.
    setMessage("forgotMessage","Jika email terdaftar, link untuk membuat password baru sudah dikirim. Cek kotak masuk dan folder Spam. Link berlaku 1 jam.");
  }catch(error){setMessage("forgotError",authErrorMessage(error));}
  finally{button.disabled=false;}
});
$("resetForm").addEventListener("submit",async event=>{
  event.preventDefault();const button=event.submitter;setMessage("resetError","");
  const password=$("newPassword").value,confirmation=$("confirmPassword").value;
  const problem=passwordProblem(password)||(password!==confirmation?"Konfirmasi password tidak sama.":"");
  if(problem){setMessage("resetError",problem);return;}
  if(!recoverySession){showAuthView("forgot");setMessage("forgotError","Link reset sudah tidak berlaku. Minta link baru.");return;}
  button.disabled=true;
  try{
    const user=await request("/auth/v1/user",{method:"PUT",headers:{Authorization:`Bearer ${recoverySession.access_token}`},body:JSON.stringify({password})});
    const candidate={...recoverySession,user};recoverySession=null;
    $("newPassword").value="";$("confirmPassword").value="";
    try{const profile=await verifyAdmin(candidate);storeSession(candidate);toast("Password baru tersimpan.");await enterDashboard(profile);}
    catch{session=null;showLogin("","Password baru tersimpan. Silakan masuk.");$("email").value=user?.email||"";}
  }catch(error){setMessage("resetError",authErrorMessage(error));}
  finally{button.disabled=false;}
});
// Order notifications: the dashboard polls orders every 20 s while it is open and
// raises a badge, a toast, a short chime and (when allowed) a device notification for
// new orders, payments received and automatic cancellations. The first poll after
// sign-in only records a baseline so old orders do not flood the list.
const NOTIFY_INTERVAL_MS=20000,NOTIFY_SEEN_KEY="gyd_admin_order_seen",NOTIFY_LOG_KEY="gyd_admin_notifications";
let notifyTimer=null,notifyBaseline=null,notifyLog=[],notifyAudio=null;
function readStore(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function writeStore(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function orderSignature(order){return `${order.status}|${order.payment_status}`;}
function notifyEvents(previous,rows){
  const events=[];
  for(const order of rows){
    const before=previous[order.id];
    const label=`${order.order_number} · ${money(order.total)}`;
    if(!before){if(Date.now()-new Date(order.created_at).getTime()<48*3600e3)events.push({id:order.id,kind:"new",title:order.payment_method==="COD"?"Pesanan COD baru":"Pesanan baru",text:`${label} · ${order.customer_name||"Pelanggan"}`});continue;}
    const [status,payment]=before.split("|");
    if(order.payment_status==="paid"&&payment!=="paid")events.push({id:order.id,kind:"paid",title:"Pembayaran diterima",text:label});
    else if(order.status==="cancelled"&&status!=="cancelled")events.push({id:order.id,kind:"cancelled",title:order.auto_cancelled_at?"Dibatalkan otomatis (tidak dibayar)":"Pesanan dibatalkan",text:label});
  }
  return events;
}
function renderNotifications(){
  const unread=notifyLog.filter(entry=>!entry.read).length;
  $("notifyCount").textContent=unread>9?"9+":String(unread);$("notifyCount").classList.toggle("hidden",!unread);
  document.title=`${unread?`(${unread}) `:""}Admin — getyourdevice`;
  $("notifyList").innerHTML=notifyLog.length?notifyLog.slice(0,30).map(entry=>`<li class="${entry.read?"":"unread"} ${entry.kind}"><a href="#pesanan/${encodeURIComponent(entry.id)}"><strong>${escapeHTML(entry.title)}</strong><span>${escapeHTML(entry.text)}</span><time>${new Date(entry.at).toLocaleString("id-ID",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></a></li>`).join(""):'<li class="notify-empty">Belum ada notifikasi. Pesanan baru dan pembayaran akan muncul di sini.</li>';
  $("notifyEnable").classList.toggle("hidden",!("Notification" in window)||Notification.permission!=="default");
}
function chime(){
  try{notifyAudio=notifyAudio||new (window.AudioContext||window.webkitAudioContext)();const now=notifyAudio.currentTime;[880,1320].forEach((freq,index)=>{const osc=notifyAudio.createOscillator(),gain=notifyAudio.createGain();osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,now+index*.16);gain.gain.exponentialRampToValueAtTime(.18,now+index*.16+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+index*.16+.3);osc.connect(gain).connect(notifyAudio.destination);osc.start(now+index*.16);osc.stop(now+index*.16+.32);});}catch{}
}
async function pollOrderNotifications(){
  if(!session||!adminReady)return;
  try{
    const rows=await request("/rest/v1/orders?select=id,order_number,created_at,status,payment_status,payment_method,total,customer_name,auto_cancelled_at&order=updated_at.desc&limit=40")||[];
    const seen=readStore(NOTIFY_SEEN_KEY,null);
    const next={...(seen||{})};rows.forEach(order=>{next[order.id]=orderSignature(order);});
    writeStore(NOTIFY_SEEN_KEY,Object.fromEntries(Object.entries(next).slice(-400)));
    $("notifyStatus").textContent=`Diperbarui ${new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"})} · otomatis setiap 20 detik.`;
    if(!seen){notifyBaseline=true;return;}
    const events=notifyEvents(seen,rows);
    if(!events.length)return;
    const at=new Date().toISOString();
    notifyLog=[...events.map(event=>({...event,at,read:false})),...notifyLog].slice(0,50);
    writeStore(NOTIFY_LOG_KEY,notifyLog);renderNotifications();chime();
    toast(events.length===1?`${events[0].title}: ${events[0].text}`:`${events.length} pembaruan pesanan baru.`);
    if("Notification" in window&&Notification.permission==="granted")events.slice(0,3).forEach(event=>{try{new Notification(event.title,{body:event.text,tag:`${event.id}-${event.kind}`});}catch{}});
    if(adminRouteParts()[0]==="pesanan"&&!document.querySelector("dialog[open]"))loadOrders();
  }catch(error){$("notifyStatus").textContent=`Notifikasi tertunda: ${error.message}`;}
}
function startOrderNotifications(){
  notifyLog=readStore(NOTIFY_LOG_KEY,[]);if(!Array.isArray(notifyLog))notifyLog=[];
  renderNotifications();
  clearInterval(notifyTimer);pollOrderNotifications();notifyTimer=setInterval(pollOrderNotifications,NOTIFY_INTERVAL_MS);
}
function stopOrderNotifications(){clearInterval(notifyTimer);notifyTimer=null;}
function toggleNotifyPanel(open=$("notifyPanel").classList.contains("hidden")){$("notifyPanel").classList.toggle("hidden",!open);$("notifyButton").setAttribute("aria-expanded",String(open));}
$("notifyButton").addEventListener("click",event=>{event.stopPropagation();toggleNotifyPanel();try{notifyAudio?.resume();}catch{}});
$("notifyMarkRead").addEventListener("click",()=>{notifyLog=notifyLog.map(entry=>({...entry,read:true}));writeStore(NOTIFY_LOG_KEY,notifyLog);renderNotifications();});
$("notifyList").addEventListener("click",event=>{const link=event.target.closest("a");if(!link)return;const index=[...$("notifyList").querySelectorAll("a")].indexOf(link);if(notifyLog[index]){notifyLog[index].read=true;writeStore(NOTIFY_LOG_KEY,notifyLog);renderNotifications();}toggleNotifyPanel(false);});
$("notifyEnable").addEventListener("click",async()=>{try{await Notification.requestPermission();}catch{}renderNotifications();});
document.addEventListener("click",event=>{if(!event.target.closest(".notify-wrap"))toggleNotifyPanel(false);});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&notifyTimer)pollOrderNotifications();});
$("signOut").addEventListener("click",async()=>{try{await request("/auth/v1/logout",{method:"POST"});}catch{}storeSession(null);session=null;showLogin("Anda telah keluar.");});
$("addProduct").addEventListener("click",()=>navigateAdminRoute("produk/baru"));$("closeDialog").addEventListener("click",()=>navigateAdminRoute("produk"));$("cancelDialog").addEventListener("click",()=>navigateAdminRoute("produk"));$("productDialog").addEventListener("cancel",event=>{event.preventDefault();navigateAdminRoute("produk");});$("productForm").addEventListener("submit",saveProduct);$("productSearch").addEventListener("input",renderProducts);$("statusFilter").addEventListener("change",renderProducts);
$("productTable").addEventListener("click",async event=>{const edit=event.target.dataset.edit,toggle=event.target.dataset.toggle,del=event.target.dataset.delete;if(edit)navigateAdminRoute(`produk/${edit}`);if(toggle){const p=products.find(item=>item.id===toggle);await updateProduct(toggle,{is_active:!p.is_active},p.is_active?"Produk dinonaktifkan.":"Produk diaktifkan.");}if(del&&confirm("Hapus produk ini secara permanen? Tindakan ini tidak dapat dibatalkan.")){try{const product=products.find(item=>item.id===del);await request(`/rest/v1/products?id=eq.${encodeURIComponent(del)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});let warning=false;try{if(product?.image_url)await removeStoredImage(product.image_url);}catch(error){console.error("Deleted product image cleanup failed",error);warning=true;}toast(warning?"Produk dihapus, tetapi file gambar belum dapat dihapus.":"Produk dihapus.");await loadProducts();}catch(error){toast(error.message);}}});
$("productTable").addEventListener("change",async event=>{if(!event.target.dataset.stock)return;const stock=Number(event.target.value);if(!Number.isInteger(stock)||stock<0){toast("Stok harus berupa bilangan bulat nol atau lebih.");await loadProducts();return;}event.target.disabled=true;await updateProduct(event.target.dataset.stock,{stock},"Stok diperbarui.");});
$("category").addEventListener("change",()=>{const current=$("brand").value&&$("brand").value!==BRAND_OTHER?$("brand").value:$("brandOther").value;fillBrandOptions($("category").value,current);$("categoryHint").classList.add("hidden");});
$("brand").addEventListener("change",()=>{const other=$("brand").value===BRAND_OTHER;$("brandOther").classList.toggle("hidden",!other);if(other)$("brandOther").focus();});
$("imageFile").addEventListener("change",async event=>{$("formError").classList.add("hidden");const files=[...event.target.files];event.target.value="";await addGalleryFiles(files);});
$("imagePreview").addEventListener("click",event=>{
  const shape=event.target.closest("[data-gallery-shape]");if(shape){const item=gallery[Number(shape.dataset.galleryItem)];if(item&&item.shape!==shape.dataset.galleryShape)setGalleryShape(item,shape.dataset.galleryShape);return;}
  const fit=event.target.closest("[data-gallery-fit]");if(fit){const item=gallery[Number(fit.dataset.galleryItem)];if(item&&item.fit!==fit.dataset.galleryFit)setGalleryShape(item,item.shape,fit.dataset.galleryFit);return;}
  const move=event.target.closest("[data-gallery-move]");if(move){const from=Number(move.dataset.galleryItem),to=from+Number(move.dataset.galleryMove);if(to>=0&&to<gallery.length){[gallery[from],gallery[to]]=[gallery[to],gallery[from]];renderGallery();}return;}
  const remove=event.target.closest("[data-gallery-remove]");if(remove){const [item]=gallery.splice(Number(remove.dataset.galleryRemove),1);releaseGalleryItem(item);renderGallery();}
});
$("orderSearch").addEventListener("input",()=>{orderPage=1;renderOrders();});
$("orderStatusFilter").addEventListener("click",event=>{const tab=event.target.closest("[data-status-tab]")?.dataset.statusTab;if(!tab)return;orderFilter=tab;orderPage=1;renderOrders();});
$("orderDateFilter").addEventListener("change",()=>{const custom=$("orderDateFilter").value==="custom";$("orderDateCustom").classList.toggle("hidden",!custom);orderPage=1;if(!custom||$("orderDateFrom").value||$("orderDateTo").value)loadOrders();});
["orderDateFrom","orderDateTo"].forEach(id=>$(id).addEventListener("change",()=>{orderPage=1;loadOrders();}));
// A product photo that fails to load becomes the grey placeholder instead of a broken image.
$("orderTable").addEventListener("error",event=>{if(event.target.matches?.(".order-products img"))event.target.replaceWith(Object.assign(document.createElement("span"),{className:"thumb-fallback"}));},true);
$("orderPager").addEventListener("click",event=>{const page=Number(event.target.closest("[data-order-page]")?.dataset.orderPage);if(!page)return;orderPage=page;renderOrders();$("orderStats").scrollIntoView({block:"start",behavior:"smooth"});});$("closeOrderDialog").addEventListener("click",()=>navigateAdminRoute("pesanan"));$("orderDialog").addEventListener("cancel",event=>{event.preventDefault();navigateAdminRoute("pesanan");});
$("orderTable").addEventListener("click",event=>{
  const id=event.target.closest("[data-order-detail]")?.dataset.orderDetail;if(id){navigateAdminRoute(`pesanan/${id}`);return;}
  const action=event.target.closest("[data-order-action]");if(action){runOrderAction(action.dataset.orderId,action.dataset.orderAction);return;}
  const book=event.target.closest("[data-shipping-book]")?.dataset.shippingBook;if(book){bookShipment(book);return;}
  const label=event.target.closest("[data-shipping-label]")?.dataset.shippingLabel;if(label)printShippingLabel(label);
});
$("orderDetailContent").addEventListener("submit",event=>{const form=event.target.closest("[data-refund-form]");if(!form)return;event.preventDefault();submitRefund(form);});
$("orderStats").addEventListener("click",event=>{const view=event.target.closest("[data-order-view]")?.dataset.orderView;if(!view)return;orderFilter=orderFilter===view?"all":view;orderPage=1;renderOrders();});
$("orderDetailContent").addEventListener("click",event=>{const actionButton=event.target.closest("[data-order-action]");if(actionButton)runOrderAction(actionButton.dataset.orderId,actionButton.dataset.orderAction);const bookId=event.target.closest("[data-shipping-book]")?.dataset.shippingBook;if(bookId)bookShipment(bookId);const trackId=event.target.closest("[data-shipping-track]")?.dataset.shippingTrack;if(trackId)refreshShipmentTracking(trackId);const labelId=event.target.closest("[data-shipping-label]")?.dataset.shippingLabel;if(labelId)printShippingLabel(labelId);});
document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>navigateAdminRoute(button.dataset.tab==="orders"?"pesanan":"produk")));
window.addEventListener("hashchange",queueAdminRouteApply);
window.addEventListener("popstate",queueAdminRouteApply);

(async()=>{try{config=await fetch("/api/config").then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);return data;});
  // A password reset link lands here with tokens in the fragment: strip them from the
  // address bar and history right away, then ask for the new password.
  const redirect=authRedirectFromHash(location.hash);
  if(redirect){
    history.replaceState(null,"",location.pathname+location.search);
    if(redirect.recovery){recoverySession=redirect.recovery;showAuthView("reset");$("newPassword").focus();return;}
    showAuthView("forgot");setMessage("forgotError",/expired/i.test(redirect.error+redirect.description)?"Link reset sudah kedaluwarsa atau sudah dipakai. Minta link baru.":"Link reset tidak valid. Minta link baru.");return;
  }
  const saved=JSON.parse(localStorage.getItem("gyd_admin_session")||"null");if(!saved)return showLogin();const current=await refreshSession(saved.refresh_token);const profile=await verifyAdmin(current);storeSession(current);await enterDashboard(profile);}catch(error){storeSession(null);showLogin(error.message);}})();
