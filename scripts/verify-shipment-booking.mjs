import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,biteship,book,track,webhook,admin,auth] = await Promise.all([
  readFile(new URL("../supabase/migrations/011_shipment_booking_tracking.sql",import.meta.url),"utf8"),
  readFile(new URL("../api/shipping/_biteship.js",import.meta.url),"utf8"),
  readFile(new URL("../api/shipping/book.js",import.meta.url),"utf8"),
  readFile(new URL("../api/shipping/track.js",import.meta.url),"utf8"),
  readFile(new URL("../api/shipping/webhook.js",import.meta.url),"utf8"),
  readFile(new URL("../admin.js",import.meta.url),"utf8"),
  readFile(new URL("../api/_adminAuth.js",import.meta.url),"utf8")
]);

assert.match(migration,/shipping_order_id text/);
assert.match(migration,/shipping_tracking_id text/);
assert.match(migration,/shipping_status text/);
assert.match(migration,/weight_grams integer/);
assert.match(migration,/SHIPPING_ITEM_SNAPSHOT_MISSING/);

assert.match(biteship,/createOrder/);
assert.match(biteship,/retrieveTracking/);
assert.match(biteship,/\/v1\/orders/);
assert.match(biteship,/\/v1\/trackings/);
assert.match(biteship,/40002060/);

assert.match(auth,/auth\/v1\/user/);
assert.match(auth,/admin_profiles/);

assert.match(book,/requireAdmin/);
assert.match(book,/reference_id:order\.order_number/);
assert.match(book,/delivery_type:"now"/);
assert.match(book,/shipping_order_id/);
assert.match(book,/cfg\.isTest/);
assert.match(book,/payment_status/);

assert.match(track,/retrieveTracking/);
assert.match(track,/delivered_at/);
assert.match(track,/shipped_at/);

assert.match(webhook,/BITESHIP_WEBHOOK_HEADER_NAME/);
assert.match(webhook,/BITESHIP_WEBHOOK_HEADER_SECRET/);
assert.match(webhook,/order\.status/);
assert.match(webhook,/order\.waybill_id/);
assert.match(webhook,/order\.price/);
assert.match(webhook,/timingSafeEqual/);

assert.match(admin,/Buat Pengiriman Biteship/);
assert.match(admin,/Refresh Tracking/);
assert.match(admin,/\/api\/shipping\/book/);
assert.match(admin,/\/api\/shipping\/track/);

for(const text of [biteship,book,track,webhook,admin]) {
  assert.doesNotMatch(text,/biteship_test\.[A-Za-z0-9_-]{10,}/);
}

console.log("Shipment booking and tracking verification passed.");
