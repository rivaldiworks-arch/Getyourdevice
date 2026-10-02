// Contract checks for Phase 8K refund recording. The behaviour of record_payment_refund
// is exercised in scripts/e2e-admin-refunds.mjs (admin UI) and against Postgres when the
// migration is reviewed; this guards the access rules that must never regress.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(new URL("../supabase/migrations/028_payment_refunds.sql",import.meta.url),"utf8");
const admin=readFileSync(new URL("../admin.js",import.meta.url),"utf8");

assert.match(migration,/returns public\.payments language plpgsql security definer set search_path=public,pg_temp/);
assert.match(migration,/if not public\.is_admin\(\) then\s+raise exception using message='NOT_ADMIN'/,"only admins may record refunds");
assert.match(migration,/revoke all on function public\.record_payment_refund\(uuid,numeric,text,text,text\) from public, anon;/);
assert.match(migration,/grant execute on function public\.record_payment_refund\(uuid,numeric,text,text,text\) to authenticated;/);
assert.match(migration,/for update;/,"the payment row is locked while it is refunded");
assert.match(migration,/v_payment\.status<>'paid'/,"only paid attempts are refundable");
assert.match(migration,/v_order\.status<>'cancelled' and not exists/,"refunds need a cancelled order or a second paid attempt");
assert.match(migration,/p_amount<=0 or p_amount>v_payment\.amount/,"a refund never exceeds the payment");
assert.match(migration,/refunded_by=auth\.uid\(\)/,"the admin who recorded it is kept");
assert.doesNotMatch(migration,/grant (insert|update|delete)[^;]*payments/i,"payments stay without direct write grants");

assert.match(admin,/\/rest\/v1\/rpc\/record_payment_refund/,"the admin records refunds through the RPC");
assert.doesNotMatch(admin,/\/rest\/v1\/payments\?[^"`]*method:"PATCH"/,"the admin never writes payments directly");
console.log("Phase 8K refund verification passed.");
