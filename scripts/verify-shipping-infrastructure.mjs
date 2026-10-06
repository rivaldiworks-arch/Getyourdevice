import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,idempotencyMigration,quoteApi,orderApi,storefront,admin] = await Promise.all([
  readFile(new URL("../supabase/migrations/009_shipping_infrastructure.sql",import.meta.url),"utf8"),
  readFile(new URL("../supabase/migrations/014_checkout_idempotency.sql",import.meta.url),"utf8"),
  readFile(new URL("../api/shipping/quotes.js",import.meta.url),"utf8"),
  readFile(new URL("../api/orders.js",import.meta.url),"utf8"),
  readFile(new URL("../app.js",import.meta.url),"utf8"),
  readFile(new URL("../admin.js",import.meta.url),"utf8")
]);

assert.match(migration,/create table if not exists public\.shipping_quotes/);
assert.match(migration,/shipping_quote_id uuid references public\.shipping_quotes/);
assert.match(migration,/create_storefront_order_v3/);
assert.match(migration,/used_at is null/);
assert.match(migration,/SHIPPING_QUOTE_EXPIRED/);
assert.match(migration,/SHIPPING_QUOTE_MISMATCH/);
assert.match(migration,/grant execute on function public\.create_storefront_order_v3\(jsonb,jsonb,uuid,text,text\) to service_role/);
assert.doesNotMatch(migration,/grant execute on function public\.create_storefront_order_v3[^;]+to anon/i);

assert.match(quoteApi,/supabaseAdmin\("shipping_quotes"/);
assert.match(quoteApi,/cartFingerprint/);
assert.match(quoteApi,/expiresAt=new Date\(Date\.now\(\)\+30\*60\*1000\)/);
assert.match(quoteApi,/serviceCode:"REG"/);
assert.match(quoteApi,/serviceCode:"PUP"/);

// Since 7C the quote is validated inside create_storefront_order_v5.
assert.match(idempotencyMigration,/expires_at>now\(\)/);
assert.match(idempotencyMigration,/used_at is null/);
assert.match(idempotencyMigration,/SHIPPING_QUOTE_MISMATCH/);
assert.match(idempotencyMigration,/v_quote\.cart_fingerprint<>p_cart_fingerprint[\s\S]*SHIPPING_QUOTE_CART_MISMATCH/);
assert.match(idempotencyMigration,/grant execute on function public\.create_storefront_order_v5\([^)]*\)\s+to service_role/);
assert.doesNotMatch(idempotencyMigration,/grant execute on function public\.create_storefront_order_v5[^;]+to (anon|authenticated)/i);
assert.match(orderApi,/SHIPPING_QUOTE_CART_MISMATCH/);
assert.match(orderApi,/rpc\/create_storefront_order_v5/);
assert.match(orderApi,/p_shipping_quote_id:body\.shippingQuoteId/);
assert.match(orderApi,/p_cart_fingerprint:cartFingerprint\(body\.items\)/);
assert.doesNotMatch(orderApi,/SHIPPING_METHODS/);

assert.match(storefront,/fetch\("\/api\/shipping\/quotes"/);
assert.match(storefront,/shippingQuoteId:shipping\.quoteId/);
assert.match(storefront,/Menghitung ongkir/);
assert.match(storefront,/Tarif dikunci selama 30 menit/);
assert.doesNotMatch(storefront,/Biaya tetap sementara, bukan tarif kurir langsung/);

assert.match(admin,/shipping_service_name/);
assert.match(admin,/shipping_provider/);
assert.match(admin,/tracking_number/);

console.log("Shipping infrastructure verification passed.");
