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
// Bank Indonesia caps a single QRIS payment at Rp10.000.000.
const QRIS_MAX_AMOUNT=10000000;
// Virtual Account banks supported by this integration. Mandiri is charged as
// "echannel" (Bill Payment: biller code + bill key); the others as bank_transfer VAs.
const VA_BANKS=Object.freeze({bni:"BNI",bri:"BRI",mandiri:"Mandiri",permata:"Permata",cimb:"CIMB Niaga"});
const DEFAULT_VA_BANKS="bni,bri,mandiri,permata,cimb";
const VA_EXPIRY_HOURS=24;

// Banks offered to customers, in display order. MIDTRANS_VA_BANKS lets the store drop a
// bank whose channel is not active without a code change.
function enabledVaBanks() {
  const banks=String(process.env.MIDTRANS_VA_BANKS||DEFAULT_VA_BANKS).split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
  const unknown=banks.filter(bank=>!Object.hasOwn(VA_BANKS,bank));
  if(unknown.length) throw new ServerConfigError(`MIDTRANS_VA_BANKS has unsupported banks: ${unknown.join(", ")}`);
  return [...new Set(banks)];
}

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

async function midtransCharge(body,label) {
  const orderId=body.transaction_details.order_id;
  const {response,data}=await midtransFetch("/v2/charge",{method:"POST",body:JSON.stringify(body)});
  if(midtransBusinessError(response,data)) {
    // A retry after Midtrans accepted the charge but before our DB update can return
    // "order id already used". Recover by reading the authoritative transaction status.
    if(response.status===406 || String(data.status_code)==="406") return getTransactionStatus(orderId);
    const error=new Error(data.status_message||data.responseMessage||`Midtrans ${label} charge failed`);
    error.status=response.status;
    error.midtrans=data;
    throw error;
  }
  return data;
}

async function createQrisCharge({orderId,amount}) {
  return midtransCharge({
    payment_type:"qris",
    transaction_details:{order_id:orderId,gross_amount:Math.round(Number(amount))},
    qris:{acquirer:midtransConfig().qrisAcquirer},
    custom_expiry:{expiry_duration:30,unit:"minute"}
  },"QRIS");
}

async function createBankTransferCharge({orderId,amount,bank}) {
  if(!Object.hasOwn(VA_BANKS,bank)) throw new Error("Unsupported Virtual Account bank");
  const base={
    transaction_details:{order_id:orderId,gross_amount:Math.round(Number(amount))},
    custom_expiry:{expiry_duration:VA_EXPIRY_HOURS,unit:"hour"}
  };
  const body=bank==="mandiri"
    ? {...base,payment_type:"echannel",echannel:{bill_info1:"Pembayaran",bill_info2:"GETYOURDEVICE"}}
    : {...base,payment_type:"bank_transfer",bank_transfer:{bank}};
  return midtransCharge(body,"Virtual Account");
}

// Midtrans reports expiry_time as "YYYY-MM-DD HH:mm:ss" in Western Indonesia Time.
function parseMidtransTime(value) {
  const match=String(value||"").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  if(!match) return null;
  const date=new Date(`${match[1]}T${match[2]}+07:00`);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}

function vaFieldsFromTransaction(transaction,{bank,expiresAt=null}={}) {
  const va=Array.isArray(transaction.va_numbers)?transaction.va_numbers[0]:null;
  const issuedBank=va?.bank ? String(va.bank).toLowerCase()
    : transaction.permata_va_number ? "permata"
    : transaction.bill_key ? "mandiri"
    : bank;
  return {
    provider:"midtrans",
    status:normalizeMidtransStatus(rawTransactionStatus(transaction)),
    provider_reference:String(transaction.order_id||""),
    external_transaction_id:String(transaction.transaction_id||"")||null,
    va_bank:Object.hasOwn(VA_BANKS,issuedBank)?issuedBank:bank,
    va_number:String(va?.va_number||transaction.permata_va_number||transaction.bill_key||"")||null,
    biller_code:transaction.biller_code?String(transaction.biller_code):null,
    expires_at:parseMidtransTime(transaction.expiry_time)||expiresAt,
    provider_payload:transaction
  };
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
  QRIS_MAX_AMOUNT,
  VA_BANKS,
  createBankTransferCharge,
  createQrisCharge,
  enabledVaBanks,
  getTransactionStatus,
  isChannelNotActive,
  isMidtransNotFound,
  midtransConfig,
  midtransOrderId,
  normalizeMidtransStatus,
  normalizeTransactionStatus,
  paymentFieldsFromTransaction,
  rawTransactionStatus,
  vaFieldsFromTransaction,
  verifyNotificationSignature
};
