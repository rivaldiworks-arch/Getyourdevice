import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const javascript = readFileSync(new URL("../app.js", import.meta.url), "utf8");

new Script(javascript, { filename: "app.js" });

const requiredAssets = ["./styles.css", "./app.js"];
const requiredIds = [
  "searchInput", "categoryNav", "categoryCards", "productGrid", "sortSelect",
  "productModal", "productDetail", "relatedProducts", "cartDrawer", "cartItems",
  "cartItemTotal", "checkoutForm", "shippingOptions", "helperForm",
  "adminView", "productForm", "orderList", "toast"
];
const requiredFunctions = [
  "renderProducts", "filteredProducts", "openProductDetail", "renderProductDetail",
  "addToCart", "changeQty", "renderCart", "renderCheckout",
  "submitOrder", "renderAdminProducts", "renderOrders", "initializeMotion"
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

const combined = `${html}\n${css}\n${javascript}`;
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(combined)) {
  throw new Error("Unresolved Git conflict marker detected");
}

console.log("GETYOURDEVICE static verification passed.");
