"use strict";

const { createHash, timingSafeEqual } = require("node:crypto");
const { ServerConfigError } = require("../_secrets");

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

// Midtrans issues sandbox server keys as "SB-Mid-server-..." and production keys as
// "Mid-server-...". A mismatch otherwise surfaces only as an opaque 401 at charge time.
const SERVER_KEY_PREFIX=Object.freeze({sandbox:"SB-Mid-server-",production:"Mid-server-"});
// QRIS can be issued through GoPay or ShopeePay, depending on which channel Midtrans
// activated for the merchant. Configurable so switching needs no code change.
const QRIS_ACQUIRERS=Object.freeze(["gopay","airpay shopee"]);

function midtransConfig() {
  const serverKey=String(process.env.MIDTRANS_SERVER_KEY||"").trim();
  const env=String(process.env.MIDTRANS_ENV||"sandbox").trim().toLowerCase();
  if(!serverKey) throw new ServerConfigError("MIDTRANS_SERVER_KEY is not configured");
  if(!Object.hasOwn(SERVER_KEY_PREFIX,env)) throw new ServerConfigError("MIDTRANS_ENV must be sandbox or production");
  if(!serverKey.startsWith(SERVER_KEY_PREFIX[env])) throw new ServerConfigError(`MIDTRANS_SERVER_KEY does not match MIDTRANS_ENV=${env}`);
  // Vercel Preview deployments run unreviewed branch code; they must never charge real money.
  const vercelEnv=String(process.env.VERCEL_ENV||"").trim().toLowerCase();
  if(env==="production" && vercelEnv && vercelEnv!=="production") throw new ServerConfigError(`MIDTRANS_ENV=production is not allowed on VERCEL_ENV=${vercelEnv}`);
  const qrisAcquirer=String(process.env.MIDTRANS_QRIS_ACQUIRER||"gopay").trim().toLowerCase();
  if(!QRIS_ACQUIRERS.includes(qrisAcquirer)) throw new ServerConfigError(`MIDTRANS_QRIS_ACQUIRER must be one of: ${QRIS_ACQUIRERS.join(", ")}`);
  return {
    serverKey,
    env,
    qrisAcquirer,
    baseUrl:env==="production"?"https://api.midtrans.com":"https://api.sandbox.midtrans.com"
  };
}

// Midtrans order_id must be unique per charge and cannot be reused after a QR expires.
// Deriving it from the payment row keeps retries of the same attempt idempotent (a
// duplicate charge returns 406 and is recovered via GET status) while every new
// attempt row gets a fresh Midtrans transaction.
function midtransOrderId(orderNumber,paymentId) {
  const suffix=String(paymentId||"").replace(/-/g,"").slice(0,12).toLowerCase();
  if(!/^GYD-\d{8}-\d{4}$/.test(String(orderNumber||"")) || !/^[0-9a-f]{12}$/.test(suffix)) throw new Error("Invalid Midtrans order reference");
  return `${orderNumber}-${suffix}`;
}

// The merchant's QRIS channel is not usable yet. Midtrans reports this as 402 "payment
// channel is not activated", or as 404 "Merchant pop id is not found" when the chosen
// acquirer (e.g. GoPay) has no activated merchant on the account.
function isChannelNotActive(error) {
  const message=String(error?.message||"");
  return String(error?.midtrans?.status_code||"")==="402"
    || /payment channel is not activated/i.test(message)
    || /merchant pop id is not found/i.test(message);
}

function isMidtransNotFound(error) {
  return error?.status===404 || String(error?.midtrans?.status_code||"")==="404";
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

function midtransBusinessError(response,data={}) {
  if(!response.ok) return true;
  if(data.status_code){
    const code=Number(data.status_code);
    if(Number.isFinite(code) && (code<200 || code>=300)) return true;
  }
  if(data.responseCode){
    const prefix=Number(String(data.responseCode).slice(0,3));
    if(Number.isFinite(prefix) && ![200,201,202].includes(prefix)) return true;
  }
  return false;
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
  if(midtransBusinessError(response,data)) {
    const error=new Error(data.status_message||data.responseMessage||"Midtrans status request failed");
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
    qris:{acquirer:midtransConfig().qrisAcquirer},
    custom_expiry:{expiry_duration:30,unit:"minute"}
  };
  const {response,data}=await midtransFetch("/v2/charge",{method:"POST",body:JSON.stringify(body)});
  if(midtransBusinessError(response,data)) {
    // A retry after Midtrans accepted the charge but before our DB update can return
    // "order id already used". Recover by reading the authoritative transaction status.
    if(response.status===406 || String(data.status_code)==="406") return getTransactionStatus(orderId);
    const error=new Error(data.status_message||data.responseMessage||"Midtrans QRIS charge failed");
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
  isChannelNotActive,
  isMidtransNotFound,
  midtransConfig,
  midtransOrderId,
  normalizeMidtransStatus,
  normalizeTransactionStatus,
  paymentFieldsFromTransaction,
  rawTransactionStatus,
  verifyNotificationSignature
};
