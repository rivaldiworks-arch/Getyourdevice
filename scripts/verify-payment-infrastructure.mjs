import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";

const require=createRequire(import.meta.url);
const {PAYMENT_STATUSES,canTransition,customerSafePayment}=require("../api/payments/_provider.js");
const migration=await readFile(new URL("../supabase/migrations/006_payment_infrastructure.sql",import.meta.url),"utf8");
const orderMigration=await readFile(new URL("../supabase/migrations/004_order_management.sql",import.meta.url),"utf8");
const orderApi=await readFile(new URL("../api/orders.js",import.meta.url),"utf8");
const createApi=await readFile(new URL("../api/payments/create.js",import.meta.url),"utf8");
const admin=await readFile(new URL("../admin.js",import.meta.url),"utf8");

assert.deepEqual(PAYMENT_STATUSES,["unpaid","pending","paid","failed","expired","refunded"]);
assert.match(orderMigration,/orders_status_check[\s\S]*'pending','confirmed','processing','shipped','completed','cancelled'/);
assert.doesNotMatch(orderMigration,/orders_status_check[^;]*'paid'/);
assert.match(migration,/new\.amount<>v_order_total/);
assert.doesNotMatch(createApi,/body\.(amount|status|provider_reference|external_transaction_id)/);
assert.equal(canTransition("pending","paid"),true);
assert.equal(canTransition("paid","pending"),false);
assert.equal(canTransition("paid","paid"),true);
assert.match(migration,/payment_status=new\.status/);
assert.match(migration,/payment_method='COD'[\s\S]*return jsonb_build_object\('payment_method','COD','status','unpaid'/);
assert.match(orderApi,/create_storefront_order_v2/);
assert.match(orderApi,/"Transfer Bank", "COD", "QRIS"/);
assert.match(admin,/paymentForOrder\(order\)/);
assert.match(admin,/Status pembayaran/);
assert.deepEqual(customerSafePayment({status:"pending",payment_method:"QRIS",provider_payload:{secret:true}}),{paymentStatus:"pending",paymentMethod:"QRIS"});
console.log("Payment infrastructure verification passed.");
