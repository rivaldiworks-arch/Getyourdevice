// Behavioural checks for Phase 7D. Unlike the regex contract scripts, this executes
// the real API handlers against an in-memory Supabase + Midtrans double.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const SANDBOX_KEY="SB-Mid-server-test-sandbox-key";
const PRODUCTION_KEY="Mid-server-test-production-key";
const SERVICE_ROLE="service-role-test-key-0123456789abcdef";

function resetEnv(overrides={}) {
  for(const key of ["MIDTRANS_SERVER_KEY","MIDTRANS_ENV","MIDTRANS_QRIS_ACQUIRER","MIDTRANS_VA_BANKS","VERCEL_ENV","SERVER_HMAC_SECRET"]) delete process.env[key];
  Object.assign(process.env,{
    SUPABASE_URL:"https://db.test",
    SUPABASE_ANON_KEY:"anon-test-key",
    SUPABASE_SERVICE_ROLE_KEY:SERVICE_ROLE,
    SERVER_HMAC_SECRET:"hmac-test-secret-0123456789abcdef0123",
    MIDTRANS_SERVER_KEY:PRODUCTION_KEY,
    MIDTRANS_ENV:"production",
    VERCEL_ENV:"production",
    ...overrides
  });
}

// ---------------------------------------------------------------- fake backend
const TRANSITIONS={unpaid:["pending","paid","failed","expired"],pending:["paid","failed","expired"],paid:["refunded"],failed:[],expired:[],refunded:[]};
const db={orders:new Map(),payments:[]};
const midtrans={transactions:new Map(),charges:[],statusCalls:0};
const calls={paymentPatches:[]};

function addOrder({orderNumber="GYD-20260925-0001",total=150000,method="QRIS"}={}) {
  const order={id:randomUUID(),order_number:orderNumber,total,payment_method:method,status:"pending",payment_status:"unpaid"};
  db.orders.set(order.id,order);
  return order;
}
function addPayment(order,fields={}) {
  const payment={id:randomUUID(),order_id:order.id,provider:"manual",payment_method:order.payment_method,status:"unpaid",amount:order.total,
    provider_reference:null,external_transaction_id:null,payment_url:null,qr_string:null,expires_at:null,provider_environment:null,
    created_at:new Date(Date.now()+db.payments.length).toISOString(),...fields};
  db.payments.push(payment);
  return payment;
}
function json(status,body) {
  return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
}
function eq(url,column) {
  return new URL(url).searchParams.get(column)?.replace(/^eq\./,"");
}

function supabaseFetch(url,init) {
  const path=new URL(url).pathname.replace("/rest/v1/","");
  const body=init.body?JSON.parse(init.body):{};
  if(path==="rpc/consume_api_rate_limit") return json(200,{allowed:true,limit:100,remaining:99});
  if(path==="rpc/create_manual_payment_intent") {
    const order=[...db.orders.values()].find(row=>row.order_number===body.p_order_number);
    if(!order) return json(400,{message:"ORDER_NOT_FOUND"});
    if(["paid","refunded"].includes(order.payment_status)) return json(400,{message:"ORDER_NOT_PAYABLE"});
    let payment=db.payments.filter(row=>row.order_id===order.id && ["unpaid","pending"].includes(row.status)).at(-1);
    const reused=Boolean(payment);
    if(!payment) payment=addPayment(order);
    return json(200,{id:payment.id,provider:payment.provider,payment_method:payment.payment_method,status:payment.status,reused});
  }
  if(path==="payments" && (init.method||"GET")==="GET") return json(200,db.payments.filter(row=>row.id===eq(url,"id")||row.provider_reference===eq(url,"provider_reference")).slice(0,1));
  if(path==="payments" && init.method==="PATCH") {
    const payment=db.payments.find(row=>row.id===eq(url,"id"));
    if(body.status && body.status!==payment.status && !TRANSITIONS[payment.status].includes(body.status)) return json(400,{message:"INVALID_PAYMENT_TRANSITION"});
    if(body.provider_reference && db.payments.some(row=>row!==payment && row.provider===(body.provider||payment.provider) && row.provider_reference===body.provider_reference)) {
      return json(409,{message:"duplicate key value violates unique constraint payments_provider_reference_uidx"});
    }
    Object.assign(payment,body);
    calls.paymentPatches.push({id:payment.id,...body});
    db.orders.get(payment.order_id).payment_status=payment.status;
    return json(200,[payment]);
  }
  if(path==="orders") return json(200,[db.orders.get(eq(url,"id"))].filter(Boolean));
  throw new Error(`Unexpected Supabase call ${init.method||"GET"} ${path}`);
}

function midtransFetch(url,init) {
  const {pathname}=new URL(url);
  if(pathname==="/v2/charge") {
    const body=JSON.parse(init.body);
    const orderId=body.transaction_details.order_id;
    midtrans.charges.push({orderId,host:new URL(url).host,acquirer:body.qris?.acquirer,paymentType:body.payment_type,bank:body.bank_transfer?.bank,expiry:body.custom_expiry});
    if(midtrans.chargeError) return json(200,midtrans.chargeError);
    if(midtrans.transactions.has(orderId)) return json(200,{status_code:"406",status_message:"The request could not be completed due to a conflict with the current state"});
    const common={order_id:orderId,transaction_id:randomUUID(),transaction_status:"pending",gross_amount:`${body.transaction_details.gross_amount}.00`};
    let transaction;
    if(body.payment_type==="qris") transaction={...common,actions:[{name:"generate-qr-code",url:`https://qr.test/${orderId}.png`}]};
    else if(body.payment_type==="echannel") transaction={...common,bill_key:"70012345678",biller_code:"70012",expiry_time:"2026-09-27 13:20:00"};
    else if(body.bank_transfer.bank==="permata") transaction={...common,permata_va_number:"8562000012345678",expiry_time:"2026-09-27 13:20:00"};
    else transaction={...common,va_numbers:[{bank:body.bank_transfer.bank,va_number:`9880${orderId.length}${midtrans.charges.length}`}],expiry_time:"2026-09-27 13:20:00"};
    midtrans.transactions.set(orderId,transaction);
    return json(200,{status_code:"201",...transaction});
  }
  const status=pathname.match(/^\/v2\/(.+)\/status$/);
  if(status) {
    midtrans.statusCalls++;
    const transaction=midtrans.transactions.get(decodeURIComponent(status[1]));
    return transaction?json(200,{status_code:"200",...transaction}):json(200,{status_code:"404",status_message:"Transaction doesn't exist."});
  }
  throw new Error(`Unexpected Midtrans call ${pathname}`);
}

globalThis.fetch=async (url,init={})=>{
  const {host}=new URL(url);
  if(host==="db.test") return supabaseFetch(url,init);
  if(host==="api.midtrans.com"||host==="api.sandbox.midtrans.com") return midtransFetch(url,init);
  throw new Error(`Unexpected network call to ${host}`);
};

function resetBackend() {
  db.orders.clear(); db.payments.length=0;
  midtrans.transactions.clear(); midtrans.charges.length=0; midtrans.statusCalls=0; midtrans.chargeError=null;
  calls.paymentPatches.length=0;
}

async function invoke(handler,{body,headers={}}={}) {
  const res={statusCode:200,headers:{},body:undefined,
    status(code){this.statusCode=code;return this;},
    setHeader(name,value){this.headers[name.toLowerCase()]=value;return this;},
    getHeader(name){return this.headers[name.toLowerCase()];},
    json(payload){this.body=payload;return this;}};
  await handler({method:"POST",headers:{"content-type":"application/json",...headers},body,socket:{remoteAddress:"203.0.113.9"}},res);
  return res;
}

const originalConsole={warn:console.warn,error:console.error};
console.warn=()=>{}; console.error=()=>{};

resetEnv();
const createPayment=require("../api/payments/create.js");
const webhook=require("../api/payments/webhook.js");
const createOrder=require("../api/orders.js");
const {midtransConfig,midtransOrderId}=require("../api/payments/_midtrans.js");
const {serverHmac,isServerConfigError}=require("../api/_secrets.js");

const TOKEN="a".repeat(64);
const pay=order=>invoke(createPayment,{body:{orderNumber:order.order_number,paymentToken:TOKEN}});
const payVa=(order,bank)=>invoke(createPayment,{body:{orderNumber:order.order_number,paymentToken:TOKEN,...(bank?{bank}:{})}});

// ------------------------------------------------ 0. storage outage still fails open
resetEnv(); resetBackend();
{
  const realFetch=globalThis.fetch;
  globalThis.fetch=async (url,init={})=>new URL(url).pathname.endsWith("rpc/consume_api_rate_limit")?json(503,{message:"unavailable"}):realFetch(url,init);
  const order=addOrder();
  const res=await pay(order);
  assert.equal(res.statusCode,201,"a limiter storage outage must not take payments down");
  globalThis.fetch=realFetch;
}

// ------------------------------------------------ 1. gateway configuration guard
for(const [label,env,pattern] of [
  ["sandbox key on production",{MIDTRANS_SERVER_KEY:SANDBOX_KEY},/does not match MIDTRANS_ENV=production/],
  ["production key on sandbox",{MIDTRANS_ENV:"sandbox"},/does not match MIDTRANS_ENV=sandbox/],
  ["unknown environment",{MIDTRANS_ENV:"staging"},/must be sandbox or production/],
  ["missing key",{MIDTRANS_SERVER_KEY:""},/is not configured/],
  ["production on a preview deployment",{VERCEL_ENV:"preview"},/not allowed on VERCEL_ENV=preview/]
]) {
  resetEnv(env);
  assert.throws(()=>midtransConfig(),error=>isServerConfigError(error)&&pattern.test(error.message),label);
}
resetEnv({MIDTRANS_SERVER_KEY:SANDBOX_KEY,MIDTRANS_ENV:"sandbox",VERCEL_ENV:"preview"});
assert.equal(midtransConfig().baseUrl,"https://api.sandbox.midtrans.com","sandbox must stay usable on previews");
resetEnv({VERCEL_ENV:""});
assert.equal(midtransConfig().baseUrl,"https://api.midtrans.com","local runs without VERCEL_ENV may use production explicitly");

resetEnv({MIDTRANS_SERVER_KEY:SANDBOX_KEY});
resetBackend();
{
  const order=addOrder();
  const res=await pay(order);
  assert.equal(res.statusCode,503,"misconfigured gateway must fail closed with 503");
  assert.equal(midtrans.charges.length,0,"no charge may be attempted with a mismatched key");
  assert.equal(db.payments[0].provider,"manual","the payment row must stay untouched");
}

// ------------------------------------------------ 2. first charge uses a per-attempt id
resetEnv(); resetBackend();
{
  const order=addOrder();
  const res=await pay(order);
  assert.equal(res.statusCode,201);
  const [payment]=db.payments;
  assert.equal(midtrans.charges[0].host,"api.midtrans.com");
  assert.equal(midtrans.charges[0].orderId,midtransOrderId(order.order_number,payment.id));
  assert.match(payment.provider_reference,/^GYD-20260925-0001-[0-9a-f]{12}$/);
  assert.equal(payment.provider_environment,"production");
  assert.equal(payment.status,"pending");
  assert.equal(res.body.paymentUrl,`https://qr.test/${payment.provider_reference}.png`);

  // 3. A still-valid QR is reused without contacting Midtrans again.
  const again=await pay(order);
  assert.equal(again.statusCode,200);
  assert.equal(again.body.paymentUrl,res.body.paymentUrl);
  assert.equal(midtrans.charges.length,1);
  assert.equal(midtrans.statusCalls,0);
}

// ------------------------------------------------ 4. expired QR is renewed, not a dead end
resetEnv(); resetBackend();
{
  const order=addOrder();
  await pay(order);
  const first=db.payments[0];
  first.expires_at=new Date(Date.now()-60_000).toISOString();
  midtrans.transactions.get(first.provider_reference).transaction_status="expire";
  const res=await pay(order);
  assert.equal(res.statusCode,201,"a new QR attempt must be created after expiry");
  assert.equal(first.status,"expired");
  assert.equal(db.payments.length,2);
  const second=db.payments[1];
  assert.notEqual(second.provider_reference,first.provider_reference,"Midtrans rejects reused order ids, so each attempt needs its own");
  assert.equal(second.status,"pending");
  assert.equal(midtrans.charges.length,2);
  assert.equal(db.orders.get(order.id).payment_status,"pending");
}

// ------------------------------------------------ 5. missed 'expire' webhook, Midtrans still pending
resetEnv(); resetBackend();
{
  const order=addOrder();
  await pay(order);
  db.payments[0].expires_at=new Date(Date.now()-60_000).toISOString();
  const res=await pay(order);
  assert.equal(res.statusCode,200,"Midtrans is authoritative: its still-valid QR is returned");
  assert.equal(db.payments.length,1);
  assert.equal(midtrans.charges.length,1);
  assert.equal(midtrans.statusCalls,1);
}

// ------------------------------------------------ 6. paid at Midtrans but webhook missed
resetEnv(); resetBackend();
{
  const order=addOrder();
  await pay(order);
  const payment=db.payments[0];
  payment.expires_at=new Date(Date.now()-60_000).toISOString();
  midtrans.transactions.get(payment.provider_reference).transaction_status="settlement";
  const res=await pay(order);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.paymentStatus,"paid","customer must see the payment as received, not a new QR");
  assert.equal(payment.status,"paid");
  assert.equal(midtrans.charges.length,1,"a paid order must never be charged again");
}

// ------------------------------------------------ 7. sandbox QR left over when switching to production
resetEnv(); resetBackend();
{
  const order=addOrder();
  const legacy=addPayment(order,{provider:"midtrans",status:"pending",provider_reference:order.order_number,
    payment_url:"https://sandbox.test/qr.png",expires_at:new Date(Date.now()+10*60_000).toISOString(),provider_environment:null});
  const res=await pay(order);
  assert.equal(res.statusCode,201);
  assert.equal(legacy.status,"expired","a pre-migration (sandbox) QR must be retired under production keys");
  assert.notEqual(res.body.paymentUrl,"https://sandbox.test/qr.png");
  assert.equal(db.payments[1].provider_environment,"production");
  assert.equal(midtrans.statusCalls,0,"a sandbox reference must not be looked up on production");
}
resetEnv({MIDTRANS_SERVER_KEY:SANDBOX_KEY,MIDTRANS_ENV:"sandbox",VERCEL_ENV:"preview"}); resetBackend();
{
  const order=addOrder();
  addPayment(order,{provider:"midtrans",status:"pending",provider_reference:order.order_number,
    payment_url:"https://sandbox.test/qr.png",expires_at:new Date(Date.now()+10*60_000).toISOString()});
  const res=await pay(order);
  assert.equal(res.statusCode,200,"legacy sandbox rows stay valid while still running sandbox");
  assert.equal(res.body.paymentUrl,"https://sandbox.test/qr.png");
}

// ------------------------------------------------ 8. retry after Midtrans accepted but DB write was lost
resetEnv(); resetBackend();
{
  const order=addOrder();
  const payment=addPayment(order);
  const reference=midtransOrderId(order.order_number,payment.id);
  midtrans.transactions.set(reference,{order_id:reference,transaction_id:randomUUID(),transaction_status:"pending",gross_amount:"150000.00",
    actions:[{name:"generate-qr-code",url:`https://qr.test/${reference}.png`}]});
  const res=await pay(order);
  assert.equal(res.statusCode,200,"the existing attempt row is reused");
  assert.equal(res.body.paymentUrl,`https://qr.test/${reference}.png`);
  assert.equal(payment.provider_reference,reference,"the duplicate charge (406) must recover the same transaction");
  assert.equal(midtrans.transactions.size,1);
}

// ------------------------------------------------ 9. webhook ignores duplicate notifications
resetEnv(); resetBackend();
{
  const order=addOrder();
  await pay(order);
  const payment=db.payments[0];
  const notify=transactionStatus=>{
    const transaction=midtrans.transactions.get(payment.provider_reference);
    transaction.transaction_status=transactionStatus;
    const statusCode="200";
    const signature=createHash("sha512").update(`${transaction.order_id}${statusCode}${transaction.gross_amount}${PRODUCTION_KEY}`).digest("hex");
    return invoke(webhook,{body:{order_id:transaction.order_id,status_code:statusCode,gross_amount:transaction.gross_amount,signature_key:signature}});
  };
  calls.paymentPatches.length=0;
  const duplicate=await notify("pending");
  assert.equal(duplicate.statusCode,200);
  assert.equal(duplicate.body.duplicate,true);
  assert.equal(calls.paymentPatches.length,0,"a repeated status must not rewrite the payment row");
  const settled=await notify("settlement");
  assert.equal(settled.body.paymentStatus,"paid");
  assert.equal(payment.status,"paid");
  const forged=await invoke(webhook,{body:{order_id:payment.provider_reference,status_code:"200",gross_amount:"150000.00",signature_key:"0".repeat(128)}});
  assert.equal(forged.statusCode,401);
}

// ------------------------------------------------ 10. dedicated HMAC secret
resetEnv();
{
  const key="b".repeat(64);
  assert.equal(serverHmac("payment",key),serverHmac("payment",key),"derivation must be deterministic for idempotent replays");
  assert.notEqual(serverHmac("payment",key),serverHmac("order-access",key),"purposes must be domain-separated");
  assert.throws(()=>serverHmac("Bad Purpose",key));
  for(const [label,secret,pattern] of [
    ["missing",undefined,/not configured/],
    ["too short","short-secret",/at least 32 characters/],
    ["reused service role key",SERVICE_ROLE,/must differ/]
  ]) {
    resetEnv(secret===undefined?{}:{SERVER_HMAC_SECRET:secret});
    if(secret===undefined) delete process.env.SERVER_HMAC_SECRET;
    assert.throws(()=>serverHmac("payment",key),error=>isServerConfigError(error)&&pattern.test(error.message),label);
  }
  const res=await invoke(createOrder,{body:{customer:{full_name:"Budi Santoso",whatsapp:"081234567890",email:"budi@example.com",address:"Jalan Merdeka No. 10",city:"Jakarta",postal_code:"10110"},
    items:[{productId:randomUUID(),quantity:1}],shippingQuoteId:randomUUID(),payment:"QRIS"}});
  assert.equal(res.statusCode,503,"checkout must fail closed when the HMAC secret is invalid");
  const detail=await invoke(require("../api/orders/detail.js"),{body:{orderNumber:"GYD-20260925-0001",orderAccessToken:"c".repeat(64)}});
  assert.equal(detail.statusCode,503,"a misconfigured limiter must not be silently disabled");
}

// ------------------------------------------------ 11. QRIS acquirer and inactive channel
resetEnv(); resetBackend();
{
  const order=addOrder();
  await pay(order);
  assert.equal(midtrans.charges[0].acquirer,"gopay","GoPay stays the default QRIS acquirer");
}
resetEnv({MIDTRANS_QRIS_ACQUIRER:"airpay shopee"}); resetBackend();
{
  const order=addOrder();
  const res=await pay(order);
  assert.equal(res.statusCode,201);
  assert.equal(midtrans.charges[0].acquirer,"airpay shopee","ShopeePay QRIS is selectable without a code change");
}
// ------------------------------------------------ 12. Transfer Bank via Virtual Account
resetEnv(); resetBackend();
{
  const order=addOrder({method:"Transfer Bank",total:12999000});
  const missing=await payVa(order);
  assert.equal(missing.statusCode,400);
  assert.equal(missing.body.code,"BANK_REQUIRED","a VA needs a bank before it can be issued");
  assert.equal(midtrans.charges.length,0);

  const res=await payVa(order,"bni");
  assert.equal(res.statusCode,200,"the attempt row created by the bank-less request is reused");
  assert.equal(midtrans.charges[0].paymentType,"bank_transfer");
  assert.equal(midtrans.charges[0].bank,"bni");
  assert.deepEqual(midtrans.charges[0].expiry,{expiry_duration:24,unit:"hour"});
  const payment=db.payments.at(-1);
  assert.equal(payment.provider,"midtrans");
  assert.equal(payment.va_bank,"bni");
  assert.ok(payment.va_number);
  assert.equal(payment.provider_environment,"production");
  assert.match(payment.provider_reference,/^GYD-20260925-0001-[0-9a-f]{12}$/);
  assert.equal(payment.expires_at,"2026-09-27T06:20:00.000Z","Midtrans expiry_time is Western Indonesia Time");
  assert.equal(res.body.vaBank,"bni");
  assert.equal(res.body.vaNumber,payment.va_number);
  assert.equal(res.body.paymentUrl,undefined);
  assert.ok(Number(order.total)>10000000,"VA has no QRIS-style amount cap");

  payment.expires_at=new Date(Date.now()+60*60_000).toISOString();
  const again=await payVa(order,"bri");
  assert.equal(again.statusCode,200);
  assert.equal(again.body.vaBank,"bni","an active VA is kept; issuing a second one could let the customer pay twice");
  assert.equal(midtrans.charges.length,1);
}
resetEnv(); resetBackend();
{
  const order=addOrder({method:"Transfer Bank"});
  const res=await payVa(order,"mandiri");
  assert.equal(res.statusCode,201);
  assert.equal(midtrans.charges[0].paymentType,"echannel","Mandiri uses Bill Payment");
  assert.equal(res.body.vaBank,"mandiri");
  assert.equal(res.body.vaNumber,"70012345678");
  assert.equal(res.body.billerCode,"70012");
}
resetEnv(); resetBackend();
{
  const order=addOrder({method:"Transfer Bank"});
  const res=await payVa(order,"permata");
  assert.equal(res.body.vaBank,"permata");
  assert.equal(res.body.vaNumber,"8562000012345678");
}
resetEnv(); resetBackend();
{
  // Expired VA is renewed with a new Midtrans order_id and the bank the customer picks now.
  const order=addOrder({method:"Transfer Bank"});
  await payVa(order,"bni");
  const first=db.payments.at(-1);
  first.expires_at=new Date(Date.now()-60_000).toISOString();
  midtrans.transactions.get(first.provider_reference).transaction_status="expire";
  const res=await payVa(order,"bri");
  assert.equal(res.statusCode,201);
  assert.equal(first.status,"expired");
  assert.equal(res.body.vaBank,"bri");
  assert.notEqual(db.payments.at(-1).provider_reference,first.provider_reference);
}
resetEnv(); resetBackend();
{
  const order=addOrder({method:"Transfer Bank"});
  const unknown=await payVa(order,"bca");
  assert.equal(unknown.statusCode,400);
  assert.equal(unknown.body.code,"BANK_UNAVAILABLE");
  resetEnv({MIDTRANS_VA_BANKS:"bni,mandiri"});
  const disabled=await payVa(order,"bri");
  assert.equal(disabled.statusCode,400,"banks removed from MIDTRANS_VA_BANKS are refused");
  resetEnv({MIDTRANS_VA_BANKS:"bni,bca"});
  assert.throws(()=>require("../api/payments/_midtrans.js").enabledVaBanks(),error=>isServerConfigError(error));
}
resetEnv(); resetBackend();
{
  midtrans.chargeError={status_code:"402",status_message:"Payment channel is not activated."};
  const order=addOrder({method:"Transfer Bank"});
  const res=await payVa(order,"cimb");
  assert.equal(res.statusCode,503);
  assert.equal(res.body.code,"BANK_UNAVAILABLE","an inactive bank asks the customer to pick another one");
}
resetEnv(); resetBackend();
{
  const order=addOrder({total:12999000});
  const res=await pay(order);
  assert.equal(res.statusCode,409);
  assert.equal(res.body.code,"QRIS_LIMIT");
  assert.equal(midtrans.charges.length,0,"QRIS above Rp10.000.000 is refused before calling Midtrans");
}
resetEnv(); resetBackend();
{
  // The webhook settles VA payments exactly like QRIS.
  const order=addOrder({method:"Transfer Bank"});
  await payVa(order,"bni");
  const payment=db.payments.at(-1);
  const transaction=midtrans.transactions.get(payment.provider_reference);
  transaction.transaction_status="settlement";
  const signature=createHash("sha512").update(`${transaction.order_id}200${transaction.gross_amount}${PRODUCTION_KEY}`).digest("hex");
  const res=await invoke(webhook,{body:{order_id:transaction.order_id,status_code:"200",gross_amount:transaction.gross_amount,signature_key:signature}});
  assert.equal(res.body.paymentStatus,"paid");
  assert.equal(payment.status,"paid");
}

resetEnv({MIDTRANS_QRIS_ACQUIRER:"ovo"});
assert.throws(()=>midtransConfig(),error=>isServerConfigError(error)&&/MIDTRANS_QRIS_ACQUIRER/.test(error.message));
resetEnv(); resetBackend();
{
  // Exact production response seen when GoPay QRIS is not activated for the merchant.
  midtrans.chargeError={status_code:"404",status_message:"Merchant pop id is not found"};
  const order=addOrder();
  const res=await pay(order);
  assert.equal(res.statusCode,503,"an inactive QRIS channel is a merchant setup problem, not a server error");
  assert.equal(res.body.error,"QRIS Midtrans belum aktif untuk merchant ini.");
  assert.equal(db.payments[0].provider,"manual","the payment row stays untouched");
}

console.warn=originalConsole.warn; console.error=originalConsole.error;
console.log("Phase 7D production readiness verification passed.");
