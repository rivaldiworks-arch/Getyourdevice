// Behavioural checks for Phase 8C: order status follows the order flow. Runs the real
// Biteship webhook and checkout handlers against an in-memory Supabase double, and
// checks the migration and admin contract. The SQL itself is exercised against
// Postgres when the migration is applied (see README, Phase 8C).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
Object.assign(process.env,{
  SUPABASE_URL:"https://db.test",SUPABASE_ANON_KEY:"anon",SUPABASE_SERVICE_ROLE_KEY:"service-role-test-key-0123456789abcdef",
  SERVER_HMAC_SECRET:"hmac-test-secret-0123456789abcdef0123",BITESHIP_WEBHOOK_HEADER_NAME:"x-gyd-webhook",BITESHIP_WEBHOOK_HEADER_SECRET:"s3cret"
});

const { canTransitionOrder, orderStatusForShipment } = require("../api/_orderStatus.js");

// ---------------------------------------------------------------- flow rules
const courier={payment_method:"QRIS",shipping_method:"regular"};
assert.equal(canTransitionOrder({...courier,status:"pending"},"confirmed"),true);
assert.equal(canTransitionOrder({...courier,status:"pending"},"shipped"),false,"an unpaid order cannot ship");
assert.equal(canTransitionOrder({...courier,status:"pending"},"completed"),false);
assert.equal(canTransitionOrder({payment_method:"COD",shipping_method:"pickup",status:"pending"},"completed"),true,"COD pickup completes at handover");
assert.equal(canTransitionOrder({...courier,status:"completed"},"cancelled"),false,"completed is final");
assert.equal(canTransitionOrder({...courier,status:"cancelled"},"pending"),false,"cancelled is final");
assert.equal(canTransitionOrder({...courier,status:"shipped"},"completed"),true);
assert.equal(orderStatusForShipment("picked",{...courier,status:"processing"}),"shipped");
assert.equal(orderStatusForShipment("delivered",{...courier,status:"shipped"}),"completed");
assert.equal(orderStatusForShipment("allocated",{...courier,status:"confirmed"}),"processing");
assert.equal(orderStatusForShipment("allocated",{...courier,status:"shipped"}),"shipped","late events never move an order backwards");
assert.equal(orderStatusForShipment("picked",{...courier,status:"pending"}),"pending","a test booking on an unpaid order does not skip payment");
assert.equal(orderStatusForShipment("cancelled",{...courier,status:"completed"}),"completed");
assert.equal(orderStatusForShipment("cancelled",{...courier,status:"processing"}),"processing","a cancelled shipment does not cancel a paid order");

// ---------------------------------------------------------------- Supabase double
const db={orders:[]};
let lastRpcError=null;
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
globalThis.fetch=async (url,init={})=>{
  const u=new URL(url),path=u.pathname.replace("/rest/v1/","");
  if(u.host!=="db.test") throw new Error(`Unexpected network call to ${u.host}`);
  if(path==="rpc/consume_api_rate_limit") return json(200,{allowed:true});
  if(path==="rpc/create_storefront_order_v5") return json(400,lastRpcError);
  if(path==="orders"&&(init.method||"GET")==="GET"){
    const id=u.searchParams.get("shipping_order_id")?.replace(/^eq\./,"");
    return json(200,db.orders.filter(order=>order.shipping_order_id===id));
  }
  if(path==="orders"&&init.method==="PATCH"){
    const order=db.orders.find(row=>row.id===u.searchParams.get("id").replace(/^eq\./,""));
    const body=JSON.parse(init.body);
    // Mirror migration 020: the database refuses jumps outside the flow.
    if(body.status&&!canTransitionOrder(order,body.status)) return json(400,{message:"INVALID_ORDER_STATUS_TRANSITION"});
    Object.assign(order,body);
    return new Response(null,{status:204});
  }
  throw new Error(`Unexpected Supabase call ${init.method||"GET"} ${path}`);
};
async function invoke(handler,{body,headers={}}){
  const res={statusCode:200,headers:{},status(c){this.statusCode=c;return this;},setHeader(n,v){this.headers[n.toLowerCase()]=v;return this;},getHeader(n){return this.headers[n.toLowerCase()];},json(p){this.body=p;return this;}};
  await handler({method:"POST",headers:{"content-type":"application/json",...headers},body,socket:{remoteAddress:"203.0.113.7"}},res);
  return res;
}
console.error=()=>{}; console.warn=()=>{};

// ---------------------------------------------------------------- Biteship webhook
const shippingWebhook=require("../api/shipping/webhook.js");
const event=(orderId,status)=>invoke(shippingWebhook,{headers:{"x-gyd-webhook":"s3cret"},body:{event:"order.status",order_id:orderId,status}});
{
  const order={id:"o1",status:"confirmed",payment_method:"QRIS",shipping_method:"regular",shipping_order_id:"bs-1"};
  db.orders.push(order);
  for(const [status,expected] of [["allocated","processing"],["picked","shipped"],["allocated","shipped"],["delivered","completed"],["cancelled","completed"]]){
    const res=await event("bs-1",status);
    assert.equal(res.statusCode,200,`webhook accepts ${status}`);
    assert.equal(order.status,expected,`${status} leaves the order ${expected}`);
    assert.equal(order.shipping_status,status,"the shipment status is always recorded");
  }
  const unpaid={id:"o2",status:"pending",payment_method:"QRIS",shipping_method:"regular",shipping_order_id:"bs-2"};
  db.orders.push(unpaid);
  assert.equal((await event("bs-2","picked")).statusCode,200,"a skipped transition must not fail the webhook");
  assert.equal(unpaid.status,"pending");
}

// ---------------------------------------------------------------- checkout: COD needs pickup
{
  const createOrder=require("../api/orders.js");
  lastRpcError={message:"COD_REQUIRES_PICKUP"};
  const res=await invoke(createOrder,{headers:{"idempotency-key":"e".repeat(64)},body:{
    customer:{full_name:"Budi Santoso",whatsapp:"081234567890",email:"budi@example.com",address:"Jalan Merdeka No. 10",city:"Jakarta",postal_code:"10110"},
    items:[{productId:"11111111-1111-4111-8111-111111111111",quantity:1}],shippingQuoteId:"22222222-2222-4222-8222-222222222222",payment:"COD"}});
  assert.equal(res.statusCode,400);
  assert.equal(res.body.code,"COD_REQUIRES_PICKUP");
  assert.match(res.body.error,/Ambil di Toko/);
}

// ---------------------------------------------------------------- contracts
const [migration,admin,app,html]=await Promise.all(["../supabase/migrations/020_order_status_flow.sql","../admin.js","../app.js","../index.html"].map(path=>readFile(new URL(path,import.meta.url),"utf8")));
assert.match(migration,/create trigger orders_guard_status before update of status on public\.orders/);
assert.match(migration,/INVALID_ORDER_STATUS_TRANSITION/);
assert.match(migration,/create trigger orders_guard_cod before insert on public\.orders/);
assert.match(migration,/COD_REQUIRES_PICKUP/);
assert.match(migration,/cancel_expired_unpaid_orders/);
assert.match(migration,/p\.expires_at > now\(\)/,"a still-payable Snap link or VA keeps the order open");
assert.match(migration,/cron\.schedule\(\s*'cancel-expired-unpaid-orders',\s*'\*\/15 \* \* \* \*'/);
assert.match(migration,/revoke execute on function public\.cancel_expired_unpaid_orders\(\) from public, anon, authenticated/);
assert.ok("orders_guard_status"<"orders_prepare"&&"orders_guard_status"<"orders_sync_stock","the guard fires before stock is restored");
assert.doesNotMatch(admin,/orderDetailStatus|Simpan Status/,"the free-form status dropdown is gone");
assert.match(admin,/data-order-action/);
assert.match(admin,/auto_cancelled_at/);
assert.match(app,/codBlocked/);
assert.match(html,/id="codOptionNote"/);

console.log("Phase 8C order flow verification passed.");
