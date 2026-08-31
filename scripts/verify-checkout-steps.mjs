import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const validationSource = app.slice(app.indexOf("function normalizePhone"), app.indexOf("function paymentGuidance"));
const values={custName:"Budi Santoso",custPhone:"081234567890",custEmail:"budi@example.com",custAddress:"",custCity:"",custPostal:""};
const fields=new Map(Object.entries(values).map(([id,value])=>[id,{id,value,invalid:false,focused:false,checkValidity(){return true},setAttribute(name){if(name==="aria-invalid")this.invalid=true},removeAttribute(){this.invalid=false},focus(){this.focused=true}}]));
const shipping={id:"shipping",checkValidity(){return true},focus(){}};
const payment={id:"payment",checkValidity(){return true},focus(){}};
const consent={id:"reviewConsent",checked:true,checkValidity(){return this.checked},focus(){this.focused=true}};
const stepFields={1:[fields.get("custName"),fields.get("custPhone"),fields.get("custEmail")],2:[fields.get("custAddress"),fields.get("custCity"),fields.get("custPostal")],3:[shipping],4:[payment],5:[consent]};
const errorNodes=new Map([...fields.keys()].map(id=>[id,{textContent:""}]));
const checkoutError={textContent:"",classList:{remove(){},add(){}}};
const document={
  querySelector(selector){const step=selector.match(/data-checkout-step="(\d)"/);if(step)return {querySelectorAll(){return stepFields[Number(step[1])]}};const error=selector.match(/data-field-error="([^"]+)"/);return error?errorNodes.get(error[1])||null:null},
  querySelectorAll(selector){if(selector==="[data-field-error]")return [...errorNodes.values()];if(selector==="#checkoutForm [aria-invalid]")return [...fields.values()].filter(field=>field.invalid);return []}
};
let renderedStep=1;
const context=createContext({console,document});
new Script(`let checkoutStep=1;let checkoutSubmitting=false;const CHECKOUT_STEPS=["Pelanggan","Alamat","Pengiriman","Pembayaran","Tinjau"];const CHECKOUT_STEP_FIELDS={1:["custName","custPhone","custEmail"],2:["custAddress","custCity","custPostal"]};const $=id=>id==="checkoutError"?checkoutError:id==="checkoutModal"?{querySelector(){return {scrollTop:0}}}:fields.get(id);function renderCheckoutStep(){renderedStep=checkoutStep}${validationSource}\nglobalThis.test={advance:()=>changeCheckoutStep(1),step:()=>checkoutStep,validate:step=>validateCheckoutStep(step)};`,{filename:"checkout-validation.js"}).runInContext(Object.assign(context,{fields,checkoutError,renderedStep}));
context.test.advance();
if(context.test.step()!==2)throw new Error("Valid Step 1 did not advance while later address fields were blank");
fields.get("custEmail").value="invalid";new Script("checkoutStep=1").runInContext(context);context.test.advance();
if(context.test.step()!==1||!fields.get("custEmail").focused)throw new Error("Invalid email did not block and focus Step 1");
fields.get("custEmail").value="budi@example.com";fields.get("custAddress").value="Jalan Merdeka nomor 10";fields.get("custCity").value="Bandung";fields.get("custPostal").value="40123";new Script("checkoutStep=2").runInContext(context);context.test.advance();
if(context.test.step()!==3)throw new Error("Valid Step 2 did not advance");
context.test.advance();context.test.advance();
if(context.test.step()!==5||!context.test.validate(5))throw new Error("Steps 3–5 cannot progress structurally");
console.log("Checkout step validation and progression passed.");
