import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, Script } from "node:vm";

const [app, html] = await Promise.all([
  readFile(new URL("../app.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);

const htmlActions=new Set([...html.matchAll(/data-action="([^"]+)"/g)].map(match=>match[1]));
const dispatcher=app.slice(app.indexOf("function handleAction"),app.indexOf("document.addEventListener(\"click\""));
const dispatchedActions=new Set([...dispatcher.matchAll(/case "([^"]+)"/g)].map(match=>match[1]));
for(const action of htmlActions)assert.ok(dispatchedActions.has(action),`Missing dispatcher case for ${action}`);
for(const action of ["checkout-next","checkout-back","checkout","close-checkout","open-cart","close-cart","close-product","open-helper","close-helper","close-success","success-orders","scroll-products","reset-filter"]){
  assert.ok(dispatchedActions.has(action),`Missing required dispatcher case for ${action}`);
}
for(const stale of ["showStore","showCustomerOrders","showAdmin","resetProductForm"]){
  assert.doesNotMatch(dispatcher,new RegExp(`\\b${stale}\\s*\\(`),`${stale} must not be referenced by the dispatcher`);
}
assert.match(html, /id="checkoutNext"[^>]*type="button"[^>]*data-action="checkout-next"/);

const classList={add(){},remove(){},toggle(){}};
const elements=new Map();
const element=id=>({id,value:"",textContent:"",innerHTML:"",classList,setAttribute(){},removeAttribute(){},focus(){},reset(){},scrollIntoView(){},querySelector(){return {scrollTop:0}}});
for(const id of ["custName","custPhone","custEmail","custAddress","custCity","custPostal","checkoutProgress","checkoutBack","checkoutNext","checkoutSubmit","checkoutError","checkoutModal","storeView","adminView","customerOrdersView","productsSection","productForm","editId","productFormTitle"])elements.set(id,element(id));
elements.get("custName").value="Budi Santoso";
elements.get("custPhone").value="081234567890";
elements.get("custEmail").value="budi@example.com";
const sections=[1,2,3,4,5].map(step=>({dataset:{checkoutStep:String(step)},classList,querySelectorAll(){return step===1?[elements.get("custName"),elements.get("custPhone"),elements.get("custEmail")]:[];},querySelector(){return null;}}));
for(const field of ["custName","custPhone","custEmail"]){elements.get(field).checkValidity=()=>true;}
const document={
  getElementById:id=>elements.get(id),
  querySelector(selector){
    const step=selector.match(/^\[data-checkout-step="(\d)"\]$/)?.[1];
    if(step)return sections[Number(step)-1];
    if(selector.startsWith("[data-field-error="))return element("fieldError");
    if(selector.includes(":checked"))return element("selectedOption");
    return null;
  },
  querySelectorAll(selector){return selector==="[data-checkout-step]"?sections:[];}
};
const checkoutFunctions=app.slice(app.indexOf("function renderCheckoutStep"),app.indexOf("function paymentGuidance"));
const context=createContext({document,window:{location:{},scrollTo(){}},console});
new Script(`
  const CHECKOUT_STEPS=["Pelanggan","Alamat","Pengiriman","Pembayaran","Tinjau"];
  let checkoutStep=1,checkoutSubmitting=false;
  const $=id=>document.getElementById(id);
  const renderShowcases=()=>{},renderProducts=()=>{},renderCustomerOrders=()=>{},openCart=()=>{},setModal=()=>{},startCheckout=()=>{},resetFilters=()=>{};
  ${checkoutFunctions}
  ${dispatcher}
`).runInContext(context);

assert.doesNotThrow(()=>new Script('handleAction("checkout-next")').runInContext(context));
assert.equal(new Script("checkoutStep").runInContext(context),2,"Valid Step 1 must advance to Step 2");
for(const action of htmlActions){
  if(action!=="checkout-next")assert.doesNotThrow(()=>new Script(`handleAction(${JSON.stringify(action)})`).runInContext(context),`${action} handler must not throw`);
}

console.log("Checkout step navigation and data-action dispatch verification passed.");
