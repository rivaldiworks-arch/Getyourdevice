"use strict";
const { supabaseAdmin } = require("./_supabase");

// Seller email notifications via Resend (https://resend.com). Best-effort by design:
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
    from:String(process.env.ORDER_NOTIFY_FROM||"").trim()||DEFAULT_FROM,
    siteUrl:String(process.env.SITE_URL||"https://getyourdevice.vercel.app").replace(/\/$/,"")
  };
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

const ORDER_FIELDS="id,order_number,created_at,status,payment_method,payment_status,total,shipping_cost,customer_name,customer_phone,customer_email,shipping_address,city,postal_code,shipping_service_name";

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

async function sendEmail(cfg,{subject,html,text}) {
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${cfg.apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({from:cfg.from,to:cfg.to,subject,html,text}),
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
async function notifyOrderPaid(orderId,{requestId}={}) {
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

module.exports={notifyOrderCreated,notifyOrderPaid};
