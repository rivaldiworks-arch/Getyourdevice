import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,ordersApi,detailApi,app,vercel] = await Promise.all([
  readFile(new URL("../supabase/migrations/012_secure_customer_order_access.sql",import.meta.url),"utf8"),
  readFile(new URL("../api/orders.js",import.meta.url),"utf8"),
  readFile(new URL("../api/orders/detail.js",import.meta.url),"utf8"),
  readFile(new URL("../app.js",import.meta.url),"utf8"),
  readFile(new URL("../vercel.json",import.meta.url),"utf8")
]);

assert.match(migration,/order_access_token_hash/);
assert.match(migration,/create_storefront_order_v4/);
assert.match(migration,/digest\(p_order_access_token,'sha256'\)/);
assert.match(migration,/interval '365 days'/);

assert.match(ordersApi,/randomBytes\(32\).*orderAccessToken/s);
assert.match(ordersApi,/rpc\/create_storefront_order_v4/);
assert.match(ordersApi,/orderAccessToken/);

assert.match(detailApi,/timingSafeEqual/);
assert.match(detailApi,/order_access_expires_at/);
assert.match(detailApi,/order_items\?select=product_name,quantity,product_price,subtotal/);
assert.doesNotMatch(detailApi,/payment_access_token_hash/);
assert.doesNotMatch(detailApi,/provider_payload/);

assert.match(app,/gyd_order_access/);
assert.match(app,/rememberOrderAccess/);
assert.match(app,/\/api\/orders\/detail/);
assert.match(app,/Lacak Pengiriman/);

const config=JSON.parse(vercel);
assert.ok(config.headers?.length>=1);
assert.match(vercel,/X-Content-Type-Options/);
assert.match(vercel,/X-Frame-Options/);
assert.match(vercel,/Permissions-Policy/);

console.log("Phase 7 secure customer order access verification passed.");
