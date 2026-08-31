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
await new Promise(resolve=>setTimeout(resolve,10));
if(productRequests!==1)throw new Error(`Expected one /api/products request, received ${productRequests}`);
if(!elements.get("productGrid").innerHTML.includes("product-card"))throw new Error("Fallback products did not render after API failure");
if(elements.get("resultText").textContent.includes("0 produk"))throw new Error("Fallback catalog incorrectly remained in an empty-filter state");
console.log("Storefront startup isolation and fallback rendering passed.");
