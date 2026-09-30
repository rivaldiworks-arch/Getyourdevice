// Behavioural checks for the customer "Pesanan dikirim" email: the Biteship webhook
// sends it once when the courier has the parcel, with the resi, and a mail problem never
// fails the webhook. Runs the real handler against an in-memory Supabase + Resend double.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require=createRequire(import.meta.url);
const SECRET="webhook-secret-0123456789abcdef";
Object.assign(process.env,{
  SUPABASE_URL:"https://db.test",
  SUPABASE_ANON_KEY:"anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY:"service-role-test-key-0123456789abcdef",
  RESEND_API_KEY:"re_test_key",
  CUSTOMER_EMAIL_FROM:"getyourdevice <support@getyourdevice.id>",
  BITESHIP_WEBHOOK_HEADER_NAME:"x-getyourdevice-webhook-secret",
  BITESHIP_WEBHOOK_HEADER_SECRET:SECRET
});

const db={orders:new Map(),items:[],emailLog:[]};
const sent=[];
let resendFailures=0;
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const param=(url,name)=>new URL(url).searchParams.get(name);

function addOrder(fields={}) {
  const order={id:randomUUID(),order_number:`GYD-20260930-${String(db.orders.size+1).padStart(4,"0")}`,created_at:new Date().toISOString(),
    status:"confirmed",payment_method:"QRIS",payment_status:"paid",total:13000,shipping_cost:12000,customer_name:"Budi <Santoso>",
    customer_phone:"6281234567890",customer_email:"budi@example.com",shipping_address:"Jalan Merdeka No. 10",city:"Cirebon",postal_code:"45153",
    shipping_service_name:"JNE Reguler",shipping_method:"courier",shipping_status:"confirmed",shipping_order_id:`bs-${randomUUID()}`,
    tracking_number:"0123082600493118",customer_shipped_notified_at:null,...fields};
  db.orders.set(order.id,order);
  db.items.push({order_id:order.id,product_name:"Test product",quantity:1,subtotal:1000});
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
  if(host!=="db.test") throw new Error(`Unexpected network call to ${host}`);
  const path=pathname.replace("/rest/v1/","");
  if(path==="email_log" && init.method==="POST") { db.emailLog.push(body); return new Response(null,{status:201}); }
  if(path==="orders" && (init.method||"GET")==="GET") {
    const id=param(url,"id")?.replace(/^eq\./,"");
    if(id) return json(200,[...db.orders.values()].filter(order=>order.id===id));
    const shipment=param(url,"shipping_order_id")?.replace(/^eq\./,"");
    if(shipment) return json(200,[...db.orders.values()].filter(order=>order.shipping_order_id===shipment));
    const number=param(url,"order_number")?.replace(/^eq\./,"");
    return json(200,[...db.orders.values()].filter(order=>order.order_number===number));
  }
  if(path==="orders" && init.method==="PATCH") {
    const order=db.orders.get(param(url,"id").replace(/^eq\./,""));
    if(param(url,"customer_shipped_notified_at")==="is.null" && order.customer_shipped_notified_at!==null) return json(200,[]);
    Object.assign(order,body);
    return init.headers?.Prefer==="return=minimal"?new Response(null,{status:204}):json(200,[order]);
  }
  if(path==="order_items") return json(200,db.items.filter(item=>item.order_id===param(url,"order_id").replace(/^eq\./,"")));
  throw new Error(`Unexpected Supabase call ${init.method||"GET"} ${path}`);
};

async function event(order,status,{secret=SECRET,extra={}}={}) {
  const res={statusCode:200,headers:{},body:undefined,
    status(code){this.statusCode=code;return this;},
    setHeader(name,value){this.headers[name.toLowerCase()]=value;return this;},
    json(payload){this.body=payload;return this;}};
  await webhook({method:"POST",headers:{"content-type":"application/json","x-getyourdevice-webhook-secret":secret},
    body:{event:"order.status",order_id:order.shipping_order_id,status,...extra}},res);
  return res;
}
function reset() { db.orders.clear(); db.items.length=0; db.emailLog.length=0; sent.length=0; resendFailures=0; }

console.error=()=>{};
const webhook=require("../api/shipping/webhook.js");

// 1. Allocation does not email; pickup emails once with the resi; later events do not repeat it.
reset();
{
  const order=addOrder();
  assert.equal((await event(order,"allocated")).statusCode,200);
  assert.equal(sent.length,0,"no email before the courier has the parcel");
  assert.equal((await event(order,"picked")).statusCode,200);
  assert.equal(order.status,"shipped");
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].to,["budi@example.com"]);
  assert.equal(sent[0].subject,`Pesanan dikirim · ${order.order_number} · resi 0123082600493118`);
  assert.match(sent[0].html,/Pesanan Anda sedang dikirim/);
  assert.match(sent[0].html,/Nomor resi/);
  assert.match(sent[0].html,/0123082600493118/);
  assert.match(sent[0].html,/JNE Reguler/);
  assert.match(sent[0].html,new RegExp(`/#lacak/${order.order_number}`));
  assert.match(sent[0].html,/Budi &lt;Santoso&gt;/,"customer data is escaped");
  assert.match(sent[0].text,/Nomor resi: 0123082600493118/);
  assert.equal(sent[0].reply_to,"support@getyourdevice.id");
  assert.ok(order.customer_shipped_notified_at);
  await event(order,"dropping_off");
  await event(order,"picked");
  assert.equal(sent.length,1,"sent exactly once per order");
  assert.deepEqual(db.emailLog.map(row=>[row.kind,row.status,row.recipient]),[["customer-shipped","sent","bu***@example.com"]]);
}

// 2. dropping_off without a prior picked event still sends it.
reset();
{
  const order=addOrder();
  await event(order,"dropping_off");
  assert.equal(sent.length,1);
}

// 3. A Resend failure keeps the webhook 200 and releases the claim, so the next event retries.
reset();
{
  const order=addOrder();
  resendFailures=1;
  const res=await event(order,"picked");
  assert.equal(res.statusCode,200,"a mail failure never fails the webhook");
  assert.equal(order.status,"shipped","the shipment update is saved regardless");
  assert.equal(order.customer_shipped_notified_at,null,"the claim is released");
  assert.equal(db.emailLog.at(-1).status,"failed");
  await event(order,"dropping_off");
  assert.equal(sent.length,1,"the next event sends it");
}

// 4. No email for a cancelled order, an invalid address, missing configuration or a bad secret.
reset();
{
  const cancelled=addOrder({status:"cancelled"});
  await event(cancelled,"picked");
  const invalid=addOrder({customer_email:"not-an-email"});
  await event(invalid,"picked");
  assert.equal(sent.length,0);
  assert.equal(db.emailLog.at(-1).detail,"Email pembeli tidak valid");

  const unauthorised=addOrder();
  assert.equal((await event(unauthorised,"picked",{secret:"wrong"})).statusCode,401);
  assert.equal(unauthorised.status,"confirmed");
  assert.equal(sent.length,0);

  const from=process.env.CUSTOMER_EMAIL_FROM;
  delete process.env.CUSTOMER_EMAIL_FROM;
  const unconfigured=addOrder();
  assert.equal((await event(unconfigured,"picked")).statusCode,200);
  assert.equal(sent.length,0);
  assert.equal(db.emailLog.at(-1).status,"skipped");
  process.env.CUSTOMER_EMAIL_FROM=from;
}

// 5. No resi yet: the email still goes out, without an empty resi row.
reset();
{
  const order=addOrder({tracking_number:null});
  await event(order,"picked");
  assert.equal(sent[0].subject,`Pesanan dikirim · ${order.order_number}`);
  assert.doesNotMatch(sent[0].html,/Nomor resi/);
}

// 6. The migration adds the claim column and allows the new email_log kind.
const migration=await readFile(new URL("../supabase/migrations/025_customer_shipped_notification.sql",import.meta.url),"utf8");
assert.match(migration,/add column if not exists customer_shipped_notified_at timestamptz/);
assert.match(migration,/'customer-shipped'/);

console.log("Customer shipped email verification passed.");
