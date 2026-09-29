import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";

const javascript = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const elements = new Map();
function element(id) {
  const value={id,value:id==="sortSelect"?"featured":"",textContent:"",innerHTML:"",dataset:{},style:{},disabled:false,
    classList:{add(){},remove(){},toggle(){}},setAttribute(){},addEventListener(){},querySelector(){return null},scrollIntoView(){}};
  elements.set(id,value); return value;
}
for (const id of ["resultText","productGrid","cartCount","searchInput","sortSelect","toast"]) element(id);
let productRequests=0;
const document={
  getElementById:id=>elements.get(id)||null,
  querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}, body:{style:{}}
};
const context=createContext({
  console, document, localStorage:{getItem(){return null},setItem(){}},
  fetch:async path=>{if(path!=="/api/products")throw new Error(`Unexpected path: ${path}`);productRequests++;throw new TypeError("offline")},
  window:{addEventListener(){},scrollY:0,innerWidth:1024}, setTimeout,clearTimeout,
  requestAnimationFrame:callback=>callback(),matchMedia:()=>({matches:false}),Intl,FormData:class {}
});
new Script(javascript,{filename:"app.js"}).runInContext(context);
await new Promise(resolve=>setTimeout(resolve,1700));
// A failed load is retried once, then shows an error with a retry button. Never demo products.
if(productRequests!==2)throw new Error(`Expected two /api/products requests (one retry), received ${productRequests}`);
const grid=elements.get("productGrid").innerHTML;
if(grid.includes("product-card"))throw new Error("Products rendered although the catalog failed to load");
if(!grid.includes("Katalog belum dapat dimuat")||!grid.includes('data-action="reload-catalog"'))throw new Error("Catalog failure does not show the error state with a retry button");
if(/Galaxy Watch7|MacBook Air M3|00000000-0000-4000-8000/.test(javascript))throw new Error("app.js still contains the demo product list");
console.log("Storefront startup isolation and catalog failure state passed.");
