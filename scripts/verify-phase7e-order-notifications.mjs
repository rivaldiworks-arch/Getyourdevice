// Behavioural checks for Phase 7E: seller email notifications and checkout payment
// methods. Runs the real handlers against an in-memory Supabase + Midtrans + Resend double.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const SERVER_KEY="SB-Mid-server-test-sandbox-key";

function resetEnv(overrides={}) {
  for(const key of ["RESEND_API_KEY","ORDER_NOTIFY_EMAIL","ORDER_NOTIFY_FROM","SITE_URL"]) delete process.env[key];
  Object.assign(process.env,{
    SUPABASE_URL:"https://db.test",
    SUPABASE_ANON_KEY:"anon-test-key",
    SUPABASE_SERVICE_ROLE_KEY:"service-role-test-key-0123456789abcdef",
    SERVER_HMAC_SECRET:"hmac-test-secret-0123456789abcdef0123",
    MIDTRANS_SERVER_KEY:SERVER_KEY,
    MIDTRANS_ENV:"sandbox",
    VERCEL_ENV:"preview",
    RESEND_API_KEY:"re_test_key",
    ORDER_NOTIFY_EMAIL:"seller@example.test",
    ...overrides
  });
}

const db={orders:new Map(),items:[],payments:[]};
const sent=[];
let resendFailures=0;
let rpcCalls=0;

function json(status,body) {
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
}
function param(url,name) {
  return new URL(url).searchParams.get(name);
}
function addOrder(fields={}) {
  const order={id:randomUUID(),order_number:`GYD-20260925-${String(db.orders.size+1).padStart(4,"0")}`,created_at:new Date().toISOString(),
    status:"pending",payment_method:"QRIS",payment_status:"pending",total:150000,shipping_cost:20000,customer_name:"Budi Santoso",
    customer_phone:"6281234567890",customer_email:"budi@example.com",shipping_address:"Jalan Merdeka No. 10",city:"Jakarta",postal_code:"10110",
    shipping_service_name:"JNE REG",paid_notified_at:null,...fields};
  db.orders.set(order.id,order);
  db.items.push({order_id:order.id,product_name:"Galaxy A55",quantity:1,subtotal:130000});
  return order;
}

globalThis.fetch=async (url,init={})=>{
  const {host,pathname}=new URL(url);
  const body=init.body?JSON.parse(init.body):{};
  if(host==="api.resend.com") {
    if(resendFailures>0) { resendFailures--; return json(500,{message:"temporary failure"}); }
    sent.push(body);
    return json(200,{id:randomUUID()});
  }
  if(host==="api.sandbox.midtrans.com") {
    const orderId=decodeURIComponent(pathname.match(/^\/v2\/(.+)\/status$/)[1]);
    const payment=db.payments.find(row=>row.provider_reference===orderId);
    return json(200,{status_code:"200",order_id:orderId,transaction_id:"tx-1",transaction_status:payment.midtransStatus,gross_amount:"150000.00"});
  }
  if(host!=="db.test") throw new Error(`Unexpected network call to ${host}`);
  const path=pathname.replace("/rest/v1/","");
  if(path==="rpc/consume_api_rate_limit") return json(200,{allowed:true});
  if(path==="rpc/create_storefront_order_v5") {
    rpcCalls++;
    const order=addOrder({payment_method:body.p_payment_method,payment_status:"unpaid"});
    return json(200,{order_number:order.order_number,created_at:order.created_at,subtotal:130000,shipping_cost:20000,total:150000,reused:false});
  }
  if(path==="orders" && (init.method||"GET")==="GET") {
    const number=param(url,"order_number")?.replace(/^eq\./,"");
    return json(200,[...db.orders.values()].filter(order=>order.order_number===number));
  }
  if(path==="orders" && init.method==="PATCH") {
    const order=db.orders.get(param(url,"id").replace(/^eq\./,""));
    if(param(url,"paid_notified_at")==="is.null" && order.paid_notified_at!==null) return json(200,[]);
    Object.assign(order,body);
    return json(200,[order]);
  }
  if(path==="order_items") return json(200,db.items.filter(item=>item.order_id===param(url,"order_id").replace(/^eq\./,"")));
  if(path==="payments" && (init.method||"GET")==="GET") return json(200,db.payments.filter(row=>row.provider_reference===param(url,"provider_reference")?.replace(/^eq\./,"")));
  if(path==="payments" && init.method==="PATCH") {
    const payment=db.payments.find(row=>row.id===param(url,"id").replace(/^eq\./,""));
    Object.assign(payment,body);
    if(body.status) db.orders.get(payment.order_id).payment_status=body.status;
    return json(200,[payment]);
  }
  throw new Error(`Unexpected Supabase call ${init.method||"GET"} ${path}`);
};

async function invoke(handler,{body,headers={}}={}) {
  const res={statusCode:200,headers:{},body:undefined,
    status(code){this.statusCode=code;return this;},
    setHeader(name,value){this.headers[name.toLowerCase()]=value;return this;},
    getHeader(name){return this.headers[name.toLowerCase()];},
    json(payload){this.body=payload;return this;}};
  await handler({method:"POST",headers:{"content-type":"application/json",...headers},body,socket:{remoteAddress:"203.0.113.9"}},res);
  return res;
}
function reset() {
  db.orders.clear(); db.items.length=0; db.payments.length=0; sent.length=0; resendFailures=0; rpcCalls=0;
}

console.error=()=>{}; console.warn=()=>{};
resetEnv();
const webhook=require("../api/payments/webhook.js");
const createOrder=require("../api/orders.js");

function midtransNotification(payment,status) {
  payment.midtransStatus=status;
  const signature=createHash("sha512").update(`${payment.provider_reference}200150000.00${SERVER_KEY}`).digest("hex");
  return invoke(webhook,{body:{order_id:payment.provider_reference,status_code:"200",gross_amount:"150000.00",signature_key:signature}});
}
function addPendingPayment(order) {
  const payment={id:randomUUID(),order_id:order.id,provider:"midtrans",status:"pending",amount:150000,provider_reference:`${order.order_number}-abcdef012345`};
  db.payments.push(payment);
  return payment;
}
const checkout=payment=>invoke(createOrder,{headers:{"idempotency-key":"f".repeat(64)},body:{
  customer:{full_name:"Budi Santoso",whatsapp:"081234567890",email:"budi@example.com",address:"Jalan Merdeka No. 10",city:"Jakarta",postal_code:"10110"},
  items:[{productId:randomUUID(),quantity:1}],shippingQuoteId:randomUUID(),payment}});

// 1. A paid webhook emails the seller exactly once, even when Midtrans retries.
reset();
{
  const order=addOrder();
  const payment=addPendingPayment(order);
  const res=await midtransNotification(payment,"settlement");
  assert.equal(res.statusCode,200);
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].to,["seller@example.test"]);
  assert.match(sent[0].subject,new RegExp(`Lunas ${order.order_number}`));
  assert.match(sent[0].html,/Galaxy A55/);
  assert.match(sent[0].html,/https:\/\/wa\.me\/6281234567890/);
  assert.match(sent[0].html,/admin\.html#pesanan/);
  assert.ok(order.paid_notified_at,"the order is marked as notified");
  const retry=await midtransNotification(payment,"settlement");
  assert.equal(retry.body.duplicate,true);
  assert.equal(sent.length,1,"a retried notification must not email again");
}

// 2. A failed send releases the claim, and the next Midtrans retry delivers it.
reset();
{
  const order=addOrder();
  const payment=addPendingPayment(order);
  resendFailures=1;
  const res=await midtransNotification(payment,"settlement");
  assert.equal(res.statusCode,200,"a mail outage must never fail the payment webhook");
  assert.equal(sent.length,0);
  assert.equal(order.paid_notified_at,null,"the claim is released after a failed send");
  await midtransNotification(payment,"settlement");
  assert.equal(sent.length,1);
}

// 3. Non-paid transitions do not email.
reset();
{
  const order=addOrder();
  const payment=addPendingPayment(order);
  await midtransNotification(payment,"expire");
  assert.equal(sent.length,0);
}

// 4. Without Resend configuration nothing is sent and nothing breaks.
resetEnv({RESEND_API_KEY:""}); reset();
{
  const order=addOrder();
  const payment=addPendingPayment(order);
  const res=await midtransNotification(payment,"settlement");
  assert.equal(res.statusCode,200);
  assert.equal(sent.length,0);
  assert.equal(order.paid_notified_at,null,"an unconfigured notifier must not claim the order");
}

// 5. Checkout: COD emails on creation, QRIS waits for payment, Transfer Bank is closed.
resetEnv(); reset();
{
  const cod=await checkout("COD");
  assert.equal(cod.statusCode,201);
  assert.equal(sent.length,1);
  assert.match(sent[0].subject,/Pesanan COD baru/);
  const qris=await checkout("QRIS");
  assert.equal(qris.statusCode,201);
  assert.equal(sent.length,1,"QRIS orders are announced when paid, not when created");
  const transfer=await checkout("Transfer Bank");
  assert.equal(transfer.statusCode,400,"Transfer Bank is not offered until it has a payment rail");
  assert.equal(rpcCalls,2,"a rejected method must not reach the database");
}

// 6. Customer-controlled text is escaped in the email body.
resetEnv(); reset();
{
  const order=addOrder({customer_name:'<img src=x onerror="alert(1)">'});
  const payment=addPendingPayment(order);
  await midtransNotification(payment,"settlement");
  assert.doesNotMatch(sent[0].html,/<img src=x/);
  assert.match(sent[0].html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
}

console.log("Phase 7E order notification verification passed.");
