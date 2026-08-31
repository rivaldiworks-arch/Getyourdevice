import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, html] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);

assert.match(html, /id="checkoutNext"[^>]*type="button"[^>]*data-action="checkout-next"/);
assert.match(app, /checkoutFieldErrors\(checkoutStep\)/);
assert.match(app, /if\(step===1\)[\s\S]*?custName:[\s\S]*?custPhone:[\s\S]*?custEmail:/);
assert.match(app, /if\(step===2\)[\s\S]*?custAddress:[\s\S]*?custCity:[\s\S]*?custPostal:/);
assert.match(app, /checkoutStep===3&&!document\.querySelector\("input\[name='shipping'\]:checked"\)/);
assert.match(app, /checkoutStep===4&&!document\.querySelector\("input\[name='payment'\]:checked"\)/);
assert.match(app, /section\.querySelectorAll\("input,textarea,select"\)/);
assert.match(app, /checkoutStep=Math\.max\(1,Math\.min\(CHECKOUT_STEPS\.length,checkoutStep\+delta\)\); renderCheckoutStep\(\)/);

console.log("Checkout step navigation verification passed.");
