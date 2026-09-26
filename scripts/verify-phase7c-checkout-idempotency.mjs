import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,orders,app,payment] = await Promise.all([
  readFile(new URL("../supabase/migrations/014_checkout_idempotency.sql",import.meta.url),"utf8"),
  readFile(new URL("../api/orders.js",import.meta.url),"utf8"),
  readFile(new URL("../app.js",import.meta.url),"utf8"),
  readFile(new URL("../api/payments/create.js",import.meta.url),"utf8")
]);

assert.match(migration,/checkout_idempotency_key_hash/);
assert.match(migration,/orders_checkout_idempotency_key_hash_uidx/);
assert.match(migration,/create_storefront_order_v5/);
assert.match(migration,/pg_advisory_xact_lock/);
assert.match(migration,/IDEMPOTENCY_REPLAY_EXPIRED/);
assert.match(migration,/interval '24 hours'/);
assert.match(migration,/SHIPPING_QUOTE_CART_MISMATCH/);
assert.match(migration,/'reused',true/);

assert.match(orders,/Idempotency-Key|idempotency-key/i);
// Capabilities are derived with the dedicated server HMAC secret (Phase 7D).
assert.match(orders,/serverHmac\(purpose,idempotencyKey\)/);
assert.doesNotMatch(orders,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(orders,/rpc\/create_storefront_order_v5/);
assert.match(orders,/p_cart_fingerprint/);
assert.match(orders,/Idempotency-Replayed/);
assert.match(orders,/reused\?200:201/);

assert.match(app,/sessionStorage\.getItem\("gyd_checkout_idempotency_key"\)/);
assert.match(app,/crypto\.getRandomValues/);
assert.match(app,/"Idempotency-Key":checkoutKey/);
assert.match(app,/clearCheckoutIdempotencyKey/);
assert.match(app,/tidak membuat pesanan duplikat/);

// Payment creation already reuses the active per-order payment intent; Phase 7C relies on it.
assert.match(payment,/create_manual_payment_intent/);
assert.match(payment,/data\.reused/);

console.log("Phase 7C checkout idempotency verification passed.");
