import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,guard,orders,quotes,payment,detail] = await Promise.all([
  readFile(new URL("../supabase/migrations/013_api_rate_limiting.sql",import.meta.url),"utf8"),
  readFile(new URL("../api/_guard.js",import.meta.url),"utf8"),
  readFile(new URL("../api/orders.js",import.meta.url),"utf8"),
  readFile(new URL("../api/shipping/quotes.js",import.meta.url),"utf8"),
  readFile(new URL("../api/payments/create.js",import.meta.url),"utf8"),
  readFile(new URL("../api/orders/detail.js",import.meta.url),"utf8")
]);

assert.match(migration,/create table if not exists public\.api_rate_limits/);
assert.match(migration,/primary key \(bucket, key_hash\)/);
assert.match(migration,/create or replace function public\.consume_api_rate_limit/);
assert.match(migration,/on conflict \(bucket, key_hash\) do update/);
assert.match(migration,/grant execute .*service_role/s);

assert.match(guard,/createHmac\("sha256"/);
assert.match(guard,/application\/json/);
assert.match(guard,/status\(413\)/);
assert.match(guard,/status\(429\)/);
assert.match(guard,/Retry-After/);
assert.match(guard,/X-Request-ID/);
assert.match(guard,/Cache-Control","no-store/);

assert.match(orders,/bucket:"orders:create",limit:20,windowSeconds:3600/);
assert.match(quotes,/bucket:"shipping:quotes",limit:120,windowSeconds:900/);
assert.match(payment,/bucket:"payments:create",limit:40,windowSeconds:900/);
assert.match(detail,/bucket:"orders:detail",limit:240,windowSeconds:900/);

assert.match(orders,/customer\.full_name\.length<=120/);
assert.match(orders,/customer\.address\.length<=500/);
assert.match(quotes,/city\.length>120/);

console.log("Phase 7B API hardening verification passed.");
