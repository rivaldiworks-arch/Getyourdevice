import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const javascript = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const adminJavascript = readFileSync(new URL("../admin.js", import.meta.url), "utf8");
const storageMigration = readFileSync(new URL("../supabase/migrations/003_product_storage.sql", import.meta.url), "utf8");
const orderMigration = readFileSync(new URL("../supabase/migrations/004_order_management.sql", import.meta.url), "utf8");
const checkoutMigration = readFileSync(new URL("../supabase/migrations/005_checkout_hardening.sql", import.meta.url), "utf8");
const orderApi = readFileSync(new URL("../api/orders.js", import.meta.url), "utf8");
const canonicalPayments = ["Transfer Bank", "COD", "QRIS"];
const canonicalShipping = ["regular", "express", "sameday", "pickup"];

new Script(javascript, { filename: "app.js" });
new Script(adminJavascript, { filename: "admin.js" });

const requiredAssets = ["./styles.css", "./app.js"];
const requiredIds = [
  "searchInput", "categoryNav", "categoryCards", "productGrid", "sortSelect",
  "productModal", "productDetail", "relatedProducts", "cartDrawer", "cartItems",
  "cartItemTotal", "checkoutForm", "checkoutProgress", "checkoutError", "shippingOptions",
  "paymentOptions", "finalReview", "summaryDiscount", "customerOrdersView",
  "customerOrderList", "helperForm", "adminView", "productForm", "orderList", "toast"
];
const requiredFunctions = [
  "renderProducts", "filteredProducts", "openProductDetail", "renderProductDetail",
  "addToCart", "changeQty", "renderCart", "renderCheckout", "renderCheckoutStep",
  "validateCheckoutStep", "checkoutTotals", "submitOrder", "renderCustomerOrders",
  "renderOrders", "initializeMotion"
];

for (const asset of requiredAssets) {
  if (!html.includes(asset)) throw new Error(`Asset reference missing: ${asset}`);
}
for (const id of requiredIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Required element missing: #${id}`);
}
for (const functionName of requiredFunctions) {
  if (!javascript.includes(`function ${functionName}`)) throw new Error(`Commerce function missing: ${functionName}`);
}
if ((html.match(/data-checkout-step=/g) || []).length !== 5) {
  throw new Error("Checkout must contain exactly five reviewable steps");
}
for (const option of ["Reguler", "Express", "Same Day / Instant", "Ambil di Toko", ...canonicalPayments]) {
  if (!`${html}\n${javascript}`.includes(option)) throw new Error(`Checkout option missing: ${option}`);
}

const combined = `${html}\n${css}\n${javascript}`;
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(combined)) {
  throw new Error("Unresolved Git conflict marker detected");
}
for (const marker of ["loginForm", "dashboardView", "productTable", "ordersPanel", "productDialog", "imageFile", "imagePreview", "orderSearch", "orderStatusFilter", "orderDialog", "orderDetailContent"]) {
  if (!adminHtml.includes(`id="${marker}"`)) throw new Error(`Admin element missing: #${marker}`);
}
for (const marker of ["/auth/v1/token", "admin_profiles", "/rest/v1/products", "/rest/v1/orders", "/rest/v1/order_items", "/storage/v1/object/", "MAX_IMAGE_BYTES", "storageObjectPath"]) {
  if (!adminJavascript.includes(marker)) throw new Error(`Admin integration missing: ${marker}`);
}

for (const marker of ["product-images", "public.is_admin()", "for insert", "for update", "for delete", "file_size_limit", "allowed_mime_types"]) {
  if (!storageMigration.includes(marker)) throw new Error(`Storage migration requirement missing: ${marker}`);
}
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(storageMigration)) throw new Error("Unresolved Git conflict marker in storage migration");
for (const marker of ["next_order_number", "GYD-", "orders_status_check", "admin_update_orders", "admin_read_order_items", "customer_name", "product_price"]) {
  if (!orderMigration.includes(marker)) throw new Error(`Order migration requirement missing: ${marker}`);
}
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(orderMigration)) throw new Error("Unresolved Git conflict marker in order migration");
for (const marker of ["alter column whatsapp drop not null", "alter column unit_price drop not null", "alter column total_price drop not null", "order_notes", "grand_total", "INVALID_CUSTOMER", "INSUFFICIENT_STOCK"]) {
  if (!checkoutMigration.includes(marker)) throw new Error(`Checkout migration requirement missing: ${marker}`);
}
for (const marker of ["normalizePhone", "validCustomer", "PAYMENT_METHODS", "SHIPPING_METHODS", "productId", "quantity"]) {
  if (!orderApi.includes(marker)) throw new Error(`Order API hardening missing: ${marker}`);
}
for (const marker of ["checkoutSubmitting", "clearFieldErrors", "normalizePhone", "Memproses pesanan...", "success-detail"]) {
  if (!javascript.includes(marker)) throw new Error(`Checkout hardening missing: ${marker}`);
}
const frontendPayments = [...html.matchAll(/name="payment" value="([^"]+)"/g)].map(match => match[1]);
const frontendShipping = [...javascript.matchAll(/\{ id: "([^"]+)", name:/g)].map(match => match[1]);
const apiPayments = [...orderApi.match(/PAYMENT_METHODS = new Set\(\[([^\]]+)\]/)?.[1].matchAll(/"([^"]+)"/g) || []].map(match => match[1]);
const apiShipping = [...orderApi.match(/SHIPPING_METHODS = new Set\(\[([^\]]+)\]/)?.[1].matchAll(/"([^"]+)"/g) || []].map(match => match[1]);
const rpcPayments = [...checkoutMigration.match(/p_payment_method not in \(([^)]+)\)/)?.[1].matchAll(/'([^']+)'/g) || []].map(match => match[1]);
const rpcShipping = [...checkoutMigration.matchAll(/when '([^']+)' then/g)].map(match => match[1]);
for (const [label, actual, expected] of [
  ["frontend payments", frontendPayments, canonicalPayments], ["API payments", apiPayments, canonicalPayments], ["RPC payments", rpcPayments, canonicalPayments],
  ["frontend shipping", frontendShipping, canonicalShipping], ["API shipping", apiShipping, canonicalShipping], ["RPC shipping", rpcShipping, canonicalShipping]
]) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} contract drift: ${JSON.stringify(actual)}`);
}
if (!checkoutMigration.includes("'pending',p_payment_method")) throw new Error("All payment methods must create pending orders");
console.log("GETYOURDEVICE static verification passed.");
