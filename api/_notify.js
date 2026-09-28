"use strict";
const { supabaseAdmin } = require("./_supabase");

// Seller and customer email notifications via Resend (https://resend.com). Best-effort by design:
// a missing configuration or a mail outage is logged and never fails a checkout or a
// payment webhook. Sends are awaited with a short timeout because Vercel may freeze a
// function once its response has been sent.
const SEND_TIMEOUT_MS=4000;
const DEFAULT_FROM="GETYOURDEVICE <onboarding@resend.dev>";

function notifyConfig() {
  const apiKey=String(process.env.RESEND_API_KEY||"").trim();
  const to=String(process.env.ORDER_NOTIFY_EMAIL||"").split(",").map(value=>value.trim()).filter(Boolean);
  if(!apiKey || !to.length) return null;
  return {
    apiKey,
    to,
    from:String(process.env.ORDER_NOTIFY_FROM||"").trim()||String(process.env.CUSTOMER_EMAIL_FROM||"").trim()||DEFAULT_FROM,
    siteUrl:String(process.env.SITE_URL||"https://www.getyourdevice.id").replace(/\/$/,"")
  };
}

// Customer emails need a sender on a domain verified in Resend (the default
// onboarding@resend.dev sender can only reach the Resend account owner), so they stay
// off until CUSTOMER_EMAIL_FROM is set, e.g. "getyourdevice <support@getyourdevice.id>".
function customerConfig() {
  const apiKey=String(process.env.RESEND_API_KEY||"").trim();
  const from=String(process.env.CUSTOMER_EMAIL_FROM||"").trim();
  if(!apiKey || !from) return null;
  const replyTo=from.match(/<([^>]+)>/)?.[1]||from;
  return {apiKey,from,replyTo,siteUrl:String(process.env.SITE_URL||"https://www.getyourdevice.id").replace(/\/$/,"")};
}

function escapeHtml(value) {
  return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
}

function rupiah(value) {
  return `Rp${Number(value||0).toLocaleString("id-ID")}`;
}

function whatsappLink(phone) {
  const digits=String(phone||"").replace(/\D/g,"");
  return digits?`https://wa.me/${digits}`:null;
}

async function adminJson(path,options) {
  const response=await supabaseAdmin(path,options);
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(data?.message||`Supabase request failed (${response.status})`);
  return data;
}

const ORDER_FIELDS="id,order_number,created_at,status,payment_method,payment_status,total,shipping_cost,customer_name,customer_phone,customer_email,shipping_address,city,postal_code,shipping_service_name,shipping_method,payment_access_expires_at";

function orderEmail(order,items,{headline,intro,siteUrl}) {
  const wa=whatsappLink(order.customer_phone);
  const rows=items.map(item=>`<tr><td style="padding:6px 0">${escapeHtml(item.product_name)} × ${Number(item.quantity||1)}</td><td style="padding:6px 0;text-align:right">${rupiah(item.subtotal)}</td></tr>`).join("");
  const adminUrl=`${siteUrl}/admin.html#pesanan`;
  const html=`<div style="font-family:Arial,sans-serif;color:#172033;max-width:560px">
<h2 style="color:#10233f;margin:0 0 8px">${escapeHtml(headline)}</h2>
<p style="margin:0 0 16px">${escapeHtml(intro)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
<tr><td style="color:#5f6b7a;padding:4px 0">Nomor pesanan</td><td style="text-align:right;font-weight:bold">${escapeHtml(order.order_number)}</td></tr>
<tr><td style="color:#5f6b7a;padding:4px 0">Total</td><td style="text-align:right;font-weight:bold">${rupiah(order.total)}</td></tr>
<tr><td style="color:#5f6b7a;padding:4px 0">Pembayaran</td><td style="text-align:right">${escapeHtml(order.payment_method)} · ${escapeHtml(order.payment_status)}</td></tr>
<tr><td style="color:#5f6b7a;padding:4px 0">Pengiriman</td><td style="text-align:right">${escapeHtml(order.shipping_service_name||"-")}</td></tr>
</table>
<h3 style="margin:20px 0 6px;font-size:15px">Pelanggan</h3>
<p style="margin:0;font-size:14px;line-height:1.6">${escapeHtml(order.customer_name)}<br>${escapeHtml(order.customer_phone)}${wa?` · <a href="${wa}">WhatsApp</a>`:""}<br>${escapeHtml(order.shipping_address)}, ${escapeHtml(order.city)} ${escapeHtml(order.postal_code)}</p>
<h3 style="margin:20px 0 6px;font-size:15px">Produk</h3>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}<tr><td style="padding:6px 0;color:#5f6b7a">Ongkir</td><td style="padding:6px 0;text-align:right">${rupiah(order.shipping_cost)}</td></tr></table>
<p style="margin:24px 0"><a href="${adminUrl}" style="background:#1769e0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Buka Admin</a></p>
</div>`;
  const text=[headline,intro,"",`Nomor pesanan: ${order.order_number}`,`Total: ${rupiah(order.total)}`,`Pembayaran: ${order.payment_method} · ${order.payment_status}`,
    `Pelanggan: ${order.customer_name} (${order.customer_phone})`,`Alamat: ${order.shipping_address}, ${order.city} ${order.postal_code}`,"",
    ...items.map(item=>`- ${item.product_name} × ${item.quantity}: ${rupiah(item.subtotal)}`),"",`Admin: ${adminUrl}`].join("\n");
  return {html,text};
}

async function sendEmail(cfg,{subject,html,text,to=cfg.to}) {
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${cfg.apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({from:cfg.from,to,subject,html,text,...(cfg.replyTo?{reply_to:cfg.replyTo}:{})}),
    signal:AbortSignal.timeout(SEND_TIMEOUT_MS)
  });
  if(!response.ok) {
    const data=await response.json().catch(()=>({}));
    throw new Error(data?.message||`Resend request failed (${response.status})`);
  }
}

async function loadItems(orderId) {
  return adminJson(`order_items?select=product_name,quantity,subtotal&order_id=eq.${encodeURIComponent(orderId)}`)||[];
}

// COD orders need the seller's action as soon as they are placed.
async function notifyOrderCreated(orderNumber,{requestId}={}) {
  const cfg=notifyConfig();
  if(!cfg) return false;
  try {
    const order=(await adminJson(`orders?select=${ORDER_FIELDS}&order_number=eq.${encodeURIComponent(orderNumber)}&limit=1`))?.[0];
    if(!order) throw new Error("Order not found for notification");
    const items=await loadItems(order.id);
    const content=orderEmail(order,items,{headline:"Pesanan COD baru",intro:"Pesanan bayar di tempat baru masuk dan menunggu konfirmasi toko.",siteUrl:cfg.siteUrl});
    await sendEmail(cfg,{subject:`[GETYOURDEVICE] Pesanan COD baru ${order.order_number} · ${rupiah(order.total)}`,...content});
    return true;
  } catch(error) {
    console.error("Order notification failed",{requestId,kind:"created",message:error.message});
    return false;
  }
}

// Claims the order (paid_notified_at null -> now) before sending, so concurrent
// callers (webhook retries, payment API status sync) email the seller only once.
async function notifySellerPaid(orderId,{requestId}={}) {
  const cfg=notifyConfig();
  if(!cfg) return false;
  try {
    const claimed=await adminJson(`orders?id=eq.${encodeURIComponent(orderId)}&paid_notified_at=is.null&select=${ORDER_FIELDS}`,{
      method:"PATCH",
      headers:{Prefer:"return=representation"},
      body:JSON.stringify({paid_notified_at:new Date().toISOString()})
    });
    const order=claimed?.[0];
    if(!order) return false;
    const items=await loadItems(order.id);
    // The payments trigger has already run, so the status reflects auto-confirmation.
    const cancelled=String(order.status||"").toLowerCase()==="cancelled";
    const content=orderEmail(order,items,cancelled
      ?{headline:"Perlu refund: pesanan dibatalkan tetapi sudah dibayar",intro:"Pembayaran masuk untuk pesanan yang sudah dibatalkan. Hubungi pelanggan dan proses refund.",siteUrl:cfg.siteUrl}
      :{headline:"Pembayaran diterima",intro:"Pembayaran pesanan sudah masuk. Pesanan otomatis dikonfirmasi dan siap diproses.",siteUrl:cfg.siteUrl});
    try {
      await sendEmail(cfg,{subject:cancelled?`[GETYOURDEVICE] PERLU REFUND ${order.order_number} · ${rupiah(order.total)}`:`[GETYOURDEVICE] Lunas ${order.order_number} · ${rupiah(order.total)}`,...content});
    } catch(error) {
      // Release the claim so a later webhook retry or status sync can try again.
      await supabaseAdmin(`orders?id=eq.${encodeURIComponent(orderId)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({paid_notified_at:null})}).catch(()=>{});
      throw error;
    }
    return true;
  } catch(error) {
    console.error("Order notification failed",{requestId,kind:"paid",message:error.message});
    return false;
  }
}

const STORE_WHATSAPP="https://wa.me/6281288451500";
function paymentLabel(method) {
  return ({QRIS:"QRIS / e-wallet","Transfer Bank":"Transfer Bank (Virtual Account)",COD:"Bayar di toko (COD)"})[method]||method;
}
function customerEmail(order,items,{headline,intro,ctaLabel,ctaUrl,notes=[]}) {
  const rows=items.map(item=>`<tr><td style="padding:8px 0;border-bottom:1px solid #eef1f5">${escapeHtml(item.product_name)} × ${Number(item.quantity||1)}</td><td style="padding:8px 0;border-bottom:1px solid #eef1f5;text-align:right">${rupiah(item.subtotal)}</td></tr>`).join("");
  const pickup=order.shipping_method==="pickup";
  const html=`<div style="background:#f5f5f7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#172033">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
<p style="margin:0 0 18px;font-size:20px;font-weight:bold"><span style="color:#172033">getyour</span><span style="color:#1446a0">device</span></p>
<h1 style="margin:0 0 8px;font-size:22px;color:#0b2559">${escapeHtml(headline)}</h1>
<p style="margin:0 0 20px;line-height:1.6">Halo ${escapeHtml(order.customer_name)}, ${escapeHtml(intro)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:6px">
<tr><td style="color:#5f6b7a;padding:4px 0">Nomor pesanan</td><td style="text-align:right;font-weight:bold">${escapeHtml(order.order_number)}</td></tr>
<tr><td style="color:#5f6b7a;padding:4px 0">Pembayaran</td><td style="text-align:right">${escapeHtml(paymentLabel(order.payment_method))}</td></tr>
<tr><td style="color:#5f6b7a;padding:4px 0">Pengiriman</td><td style="text-align:right">${escapeHtml(pickup?"Ambil di toko":order.shipping_service_name||"Kurir")}</td></tr>
</table>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">${rows}
<tr><td style="padding:8px 0;color:#5f6b7a">Ongkos kirim</td><td style="padding:8px 0;text-align:right">${rupiah(order.shipping_cost)}</td></tr>
<tr><td style="padding:8px 0;font-weight:bold">Total</td><td style="padding:8px 0;text-align:right;font-weight:bold;font-size:16px">${rupiah(order.total)}</td></tr></table>
${notes.length?`<ul style="margin:18px 0 0;padding-left:18px;font-size:14px;line-height:1.6;color:#3a4454">${notes.map(note=>`<li>${escapeHtml(note)}</li>`).join("")}</ul>`:""}
<p style="margin:24px 0"><a href="${ctaUrl}" style="display:inline-block;background:#1446a0;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">${escapeHtml(ctaLabel)}</a></p>
<p style="margin:0;font-size:13px;color:#5f6b7a;line-height:1.6">Ada pertanyaan? Balas email ini atau hubungi <a href="${STORE_WHATSAPP}" style="color:#1446a0">WhatsApp 0812-8845-1500</a> (Senin–Sabtu, 09.00–18.00 WIB). Sertakan nomor pesanan Anda.</p>
</div></div>`;
  const text=[headline,"",`Halo ${order.customer_name}, ${intro}`,"",`Nomor pesanan: ${order.order_number}`,`Pembayaran: ${paymentLabel(order.payment_method)}`,`Pengiriman: ${pickup?"Ambil di toko":order.shipping_service_name||"Kurir"}`,"",
    ...items.map(item=>`- ${item.product_name} × ${item.quantity}: ${rupiah(item.subtotal)}`),`Ongkos kirim: ${rupiah(order.shipping_cost)}`,`Total: ${rupiah(order.total)}`,"",...notes.map(note=>`• ${note}`),"",`${ctaLabel}: ${ctaUrl}`,"",
    "Ada pertanyaan? Balas email ini atau WhatsApp 0812-8845-1500 (Senin–Sabtu, 09.00–18.00 WIB)."].join("\n");
  return {html,text};
}
function validRecipient(email) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(email||""));
}

// Sent once when the order is created (orders.js skips idempotent replays). The link
// carries the order access token in the URL fragment so the customer can open the
// order from any device for 365 days.
async function notifyCustomerOrderCreated(orderNumber,accessToken,{requestId}={}) {
  const cfg=customerConfig();
  if(!cfg) return false;
  try {
    const order=(await adminJson(`orders?select=${ORDER_FIELDS}&order_number=eq.${encodeURIComponent(orderNumber)}&limit=1`))?.[0];
    if(!order) throw new Error("Order not found for customer notification");
    if(!validRecipient(order.customer_email)) return false;
    const items=await loadItems(order.id);
    const cod=order.payment_method==="COD";
    const deadline=order.payment_access_expires_at?new Date(order.payment_access_expires_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})+" WIB":"24 jam";
    const ctaUrl=/^[a-f0-9]{64}$/i.test(String(accessToken||""))?`${cfg.siteUrl}/#pesanan/akses/${encodeURIComponent(order.order_number)}/${accessToken}`:`${cfg.siteUrl}/#lacak/${encodeURIComponent(order.order_number)}`;
    const content=customerEmail(order,items,cod
      ?{headline:"Pesanan Anda kami terima",intro:"terima kasih sudah berbelanja. Pesanan Anda sudah kami catat.",ctaLabel:"Lihat Pesanan",ctaUrl,
        notes:["Bayar tunai saat mengambil barang di toko.","Alamat dan jadwal pengambilan kami kirim lewat WhatsApp setelah pesanan dikonfirmasi."]}
      :{headline:"Selesaikan pembayaran Anda",intro:"terima kasih sudah berbelanja. Pesanan Anda sudah kami catat dan menunggu pembayaran.",ctaLabel:"Lihat Pesanan",ctaUrl,
        notes:[`Selesaikan pembayaran sebelum ${deadline}. Setelah itu pesanan dibatalkan otomatis.`,"Pembayaran terkonfirmasi otomatis; Anda tidak perlu mengirim bukti transfer.","Kami tidak pernah meminta transfer ke rekening pribadi atau kode OTP."]});
    await sendEmail(cfg,{to:[order.customer_email],subject:`Pesanan ${order.order_number} · ${cod?"diterima":"menunggu pembayaran"}`,...content});
    return true;
  } catch(error) {
    console.error("Order notification failed",{requestId,kind:"customer-created",message:error.message});
    return false;
  }
}

// Claims customer_paid_notified_at separately from the seller's claim, so a seller-mail
// retry never re-sends the customer's receipt and vice versa.
async function notifyCustomerOrderPaid(orderId,{requestId}={}) {
  const cfg=customerConfig();
  if(!cfg) return false;
  try {
    const claimed=await adminJson(`orders?id=eq.${encodeURIComponent(orderId)}&customer_paid_notified_at=is.null&select=${ORDER_FIELDS}`,{
      method:"PATCH",
      headers:{Prefer:"return=representation"},
      body:JSON.stringify({customer_paid_notified_at:new Date().toISOString()})
    });
    const order=claimed?.[0];
    if(!order) return false;
    // A payment on a cancelled order is handled by the seller (refund), not receipted.
    if(String(order.status||"").toLowerCase()==="cancelled"||!validRecipient(order.customer_email)) return false;
    const items=await loadItems(order.id);
    const pickup=order.shipping_method==="pickup";
    const content=customerEmail(order,items,{headline:"Pembayaran diterima",intro:"pembayaran Anda sudah kami terima dan pesanan sedang diproses.",
      ctaLabel:"Lacak Pesanan",ctaUrl:`${cfg.siteUrl}/#lacak/${encodeURIComponent(order.order_number)}`,
      notes:pickup
        ?["Alamat dan jadwal pengambilan kami kirim lewat WhatsApp."]
        :["Pembayaran sebelum pukul 12.00 WIB (Senin–Sabtu) dikirim hari yang sama; setelahnya hari kerja berikutnya.","Nomor resi muncul di halaman pesanan setelah paket diserahkan ke kurir.","Rekam video unboxing saat paket tiba; laporan barang rusak atau salah kirim maksimal 1×24 jam."]});
    try {
      await sendEmail(cfg,{to:[order.customer_email],subject:`Pembayaran diterima · ${order.order_number}`,...content});
    } catch(error) {
      await supabaseAdmin(`orders?id=eq.${encodeURIComponent(orderId)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({customer_paid_notified_at:null})}).catch(()=>{});
      throw error;
    }
    return true;
  } catch(error) {
    console.error("Order notification failed",{requestId,kind:"customer-paid",message:error.message});
    return false;
  }
}

// Seller and customer are notified independently; one failing never blocks the other.
async function notifyPaid(orderId,options) {
  const [seller]=await Promise.all([notifySellerPaid(orderId,options),notifyCustomerOrderPaid(orderId,options)]);
  return seller;
}

module.exports={notifyOrderCreated,notifyOrderPaid:notifyPaid,notifyCustomerOrderCreated};
