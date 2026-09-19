"use strict";

const { createHash, timingSafeEqual } = require("node:crypto");

const MIDTRANS_STATUS_MAP = Object.freeze({
  pending:"pending",
  settlement:"paid",
  capture:"paid",
  expire:"expired",
  deny:"failed",
  cancel:"failed",
  failure:"failed",
  refund:"refunded"
});

function midtransConfig() {
  const serverKey=String(process.env.MIDTRANS_SERVER_KEY||"").trim();
  const env=String(process.env.MIDTRANS_ENV||"sandbox").trim().toLowerCase();
  if(!serverKey) throw new Error("MIDTRANS_SERVER_KEY is not configured");
  if(!["sandbox","production"].includes(env)) throw new Error("MIDTRANS_ENV must be sandbox or production");
  return {
    serverKey,
    env,
    baseUrl:env==="production"?"https://api.midtrans.com":"https://api.sandbox.midtrans.com"
  };
}

function authHeader(serverKey) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

async function midtransFetch(path, options={}) {
  const {serverKey,baseUrl}=midtransConfig();
  const response=await fetch(`${baseUrl}${path}`,{
    ...options,
    headers:{
      Accept:"application/json",
      Authorization:authHeader(serverKey),
      "Content-Type":"application/json",
      ...options.headers
    }
  });
  const data=await response.json().catch(()=>({}));
  return {response,data};
}

function findQrAction(actions=[]) {
  return actions.find(action=>action?.name==="generate-qr-code-v2")
    || actions.find(action=>action?.name==="generate-qr-code")
    || null;
}

function normalizeMidtransStatus(value) {
  const normalized=MIDTRANS_STATUS_MAP[String(value||"").toLowerCase()];
  if(!normalized) throw new Error("Unsupported Midtrans transaction status");
  return normalized;
}

async function getTransactionStatus(orderId) {
  const {response,data}=await midtransFetch(`/v2/${encodeURIComponent(orderId)}/status`,{method:"GET"});
  if(!response.ok) {
    const error=new Error(data.status_message||"Midtrans status request failed");
    error.status=response.status;
    error.midtrans=data;
    throw error;
  }
  return data;
}

async function createQrisCharge({orderId,amount}) {
  const body={
    payment_type:"qris",
    transaction_details:{order_id:orderId,gross_amount:Math.round(Number(amount))},
    qris:{acquirer:"gopay"},
    custom_expiry:{expiry_duration:30,unit:"minute"}
  };
  const {response,data}=await midtransFetch("/v2/charge",{method:"POST",body:JSON.stringify(body)});
  if(!response.ok) {
    // A retry after Midtrans accepted the charge but before our DB update can return
    // "order id already used". Recover by reading the authoritative transaction status.
    if(response.status===406) return getTransactionStatus(orderId);
    const error=new Error(data.status_message||"Midtrans QRIS charge failed");
    error.status=response.status;
    error.midtrans=data;
    throw error;
  }
  return data;
}

function verifyNotificationSignature(payload) {
  const {serverKey}=midtransConfig();
  const orderId=String(payload?.order_id||"");
  const statusCode=String(payload?.status_code||"");
  const grossAmount=String(payload?.gross_amount||"");
  const signature=String(payload?.signature_key||"").toLowerCase();
  if(!orderId||!statusCode||!grossAmount||!/^[0-9a-f]{128}$/.test(signature)) return false;
  const expected=createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");
  const a=Buffer.from(expected,"hex"),b=Buffer.from(signature,"hex");
  return a.length===b.length && timingSafeEqual(a,b);
}

function paymentFieldsFromTransaction(transaction,{expiresAt=null}={}) {
  const qrAction=findQrAction(transaction.actions);
  return {
    provider:"midtrans",
    status:normalizeMidtransStatus(transaction.transaction_status),
    provider_reference:String(transaction.order_id||""),
    external_transaction_id:String(transaction.transaction_id||"")||null,
    payment_url:qrAction?.url||null,
    qr_string:transaction.qr_string||null,
    expires_at:expiresAt,
    provider_payload:transaction
  };
}

module.exports={
  createQrisCharge,
  getTransactionStatus,
  midtransConfig,
  normalizeMidtransStatus,
  paymentFieldsFromTransaction,
  verifyNotificationSignature
};
