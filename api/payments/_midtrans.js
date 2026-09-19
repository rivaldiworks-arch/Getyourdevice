"use strict";

const { createHash, timingSafeEqual } = require("node:crypto");

const MIDTRANS_STATUS_MAP = Object.freeze({
  // Legacy Core API textual statuses.
  pending:"pending",
  settlement:"paid",
  capture:"paid",
  expire:"expired",
  deny:"failed",
  cancel:"failed",
  failure:"failed",
  refund:"refunded",
  partial_refund:"refunded",
  // Midtrans BI-SNAP status values. Some newly provisioned merchant accounts can
  // return numeric transaction statuses even while the dashboard still labels
  // them with the legacy names.
  "01":"pending",
  "03":"pending",
  "00":"paid",
  "04":"refunded",
  "05":"failed",
  "06":"failed",
  "08":"expired",
  "09":"failed"
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

function rawTransactionStatus(transaction={}) {
  return transaction.transaction_status
    ?? transaction.transactionStatus
    ?? transaction.latestTransactionStatus
    ?? transaction.latest_transaction_status
    ?? transaction.additionalInfo?.transactionStatus
    ?? transaction.additionalInfo?.latestTransactionStatus
    ?? null;
}

function normalizeMidtransStatus(value) {
  const normalized=MIDTRANS_STATUS_MAP[String(value||"").toLowerCase()];
  if(!normalized) throw new Error("Unsupported Midtrans transaction status");
  return normalized;
}

function normalizeTransactionStatus(transaction,{defaultPending=false}={}) {
  const value=rawTransactionStatus(transaction);
  if(value!==null && value!==undefined && value!=="") return normalizeMidtransStatus(value);
  const hasQr=Boolean(findQrAction(transaction.actions)?.url || transaction.qrUrl || transaction.qr_url || transaction.qrImage || transaction.qrContent || transaction.qr_string);
  if(defaultPending && hasQr) return "pending";
  throw new Error("Unsupported Midtrans transaction status");
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

function paymentFieldsFromTransaction(transaction,{expiresAt=null,defaultPending=false}={}) {
  const qrAction=findQrAction(transaction.actions);
  const directQrUrl=transaction.qrUrl||transaction.qr_url||null;
  const qrImage=transaction.qrImage?String(transaction.qrImage):null;
  const paymentUrl=qrAction?.url||directQrUrl||(qrImage?`data:image/png;base64,${qrImage}`:null);
  return {
    provider:"midtrans",
    status:normalizeTransactionStatus(transaction,{defaultPending}),
    provider_reference:String(transaction.order_id||transaction.partnerReferenceNo||transaction.partner_reference_no||""),
    external_transaction_id:String(transaction.transaction_id||transaction.referenceNo||transaction.reference_no||"")||null,
    payment_url:paymentUrl,
    qr_string:transaction.qr_string||transaction.qrContent||transaction.qr_content||null,
    expires_at:transaction.additionalInfo?.validUpTo||transaction.validityPeriod||expiresAt,
    provider_payload:transaction
  };
}

module.exports={
  createQrisCharge,
  getTransactionStatus,
  midtransConfig,
  normalizeMidtransStatus,
  normalizeTransactionStatus,
  paymentFieldsFromTransaction,
  rawTransactionStatus,
  verifyNotificationSignature
};
