"use strict";
const { ServerConfigError } = require("./_secrets");

// Every value the database accepts for orders.payment_method.
const PAYMENT_METHODS=Object.freeze(["Transfer Bank","QRIS","COD"]);
const DEFAULT_CHECKOUT_METHODS="Transfer Bank,QRIS,COD";

// Methods customers may choose at checkout, in display order. CHECKOUT_PAYMENT_METHODS
// hides a method whose gateway channel is not active yet (e.g. "Transfer Bank,COD" while
// Midtrans is still activating QRIS) without a code change.
function checkoutPaymentMethods() {
  const methods=String(process.env.CHECKOUT_PAYMENT_METHODS||DEFAULT_CHECKOUT_METHODS).split(",").map(value=>value.trim()).filter(Boolean);
  const unknown=methods.filter(method=>!PAYMENT_METHODS.includes(method));
  if(unknown.length) throw new ServerConfigError(`CHECKOUT_PAYMENT_METHODS has unsupported methods: ${unknown.join(", ")}`);
  if(!methods.length) throw new ServerConfigError("CHECKOUT_PAYMENT_METHODS must list at least one method");
  return [...new Set(methods)];
}

module.exports={PAYMENT_METHODS,checkoutPaymentMethods};
