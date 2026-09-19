"use strict";

const PAYMENT_STATUSES = Object.freeze(["unpaid", "pending", "paid", "failed", "expired", "refunded"]);
const ALLOWED_TRANSITIONS = Object.freeze({
  unpaid:new Set(["pending", "paid", "failed", "expired"]),
  pending:new Set(["paid", "failed", "expired"]),
  paid:new Set(["refunded"]),
  failed:new Set(), expired:new Set(), refunded:new Set()
});

function normalizeStatus(value) {
  const status=String(value||"").toLowerCase();
  if(!PAYMENT_STATUSES.includes(status)) throw new Error("Unsupported payment status");
  return status;
}

function canTransition(from, to) {
  const current=normalizeStatus(from), next=normalizeStatus(to);
  return current===next || ALLOWED_TRANSITIONS[current].has(next);
}

const manualProvider=Object.freeze({
  name:"manual",
  createPayment({payment}) { return payment; },
  getPayment({payment}) { return payment; },
  normalizeStatus,
  verifyWebhook() {
    // A real adapter must cryptographically verify the provider signature before returning data.
    return {verified:false, reason:"Manual payments do not support webhooks"};
  }
});

function providerFor(name) {
  if(name==="manual") return manualProvider;
  return null;
}

function customerSafePayment(payment) {
  const result={paymentStatus:payment.status,paymentMethod:payment.payment_method};
  if(payment.provider_reference) result.paymentReference=payment.provider_reference;
  if(payment.payment_url) result.paymentUrl=payment.payment_url;
  if(payment.qr_string) result.qrString=payment.qr_string;
  if(payment.expires_at) result.expiresAt=payment.expires_at;
  return result;
}

module.exports={PAYMENT_STATUSES, canTransition, customerSafePayment, normalizeStatus, providerFor};
