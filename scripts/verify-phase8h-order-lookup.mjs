// Behavioural checks for Phase 8H: a guest opens an order from another device with the
// order number and the WhatsApp number used at checkout. Runs the real handler against
// an in-memory Supabase double.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
Object.assign(process.env,{
  SUPABASE_URL:"https://db.test",
  SUPABASE_ANON_KEY:"anon-test-key",
  SUPABASE_SERVICE_ROLE_KEY:"service-role-test-key-0123456789abcdef",
  SERVER_HMAC_SECRET:"hmac-test-secret-0123456789abcdef0123"
});

const TOKEN="b".repeat(64);
const order={id:"order-1",order_number:"GYD-20260928-0001",created_at:"2026-09-28T08:26:16Z",status:"confirmed",payment_method:"QRIS",payment_status:"paid",
  shipping_service_name:"Ambil di toko",shipping_cost:0,subtotal:1000,total:1000,customer_name:"Rivaldi",city:"Jakarta",
  customer_phone:"6281288451500",order_access_token_hash:createHash("sha256").update(TOKEN).digest("hex"),order_access_expires_at:new Date(Date.now()+86400000).toISOString()};
const rate={allowed:true,calls:0,buckets:[]};

globalThis.fetch=async (url,init={})=>{
  const {host,pathname,searchParams}=new URL(url);
  if(host!=="db.test") throw new Error(`Unexpected network call to ${host}`);
  const path=pathname.replace("/rest/v1/","");
  const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
  if(path==="rpc/consume_api_rate_limit"){
    const body=JSON.parse(init.body);rate.buckets.push(body.p_bucket);
    if(body.p_bucket==="orders:lookup"){rate.calls++;if(rate.fail)return json(500,{message:"down"});return json(200,{allowed:rate.allowed,retryAfter:120});}
    return json(200,{allowed:true});
  }
  if(path==="orders"){
    const number=searchParams.get("order_number").replace(/^eq\./,"");
    return json(200,number===order.order_number?[order]:[]);
  }
  if(path==="order_items") return json(200,[{product_id:"11111111-1111-4111-8111-111111111111",product_name:"Test",quantity:2,product_price:1000,subtotal:2000},{product_id:"22222222-2222-4222-8222-222222222222",product_name:"Dihapus",quantity:1,product_price:500,subtotal:500}]);
  if(path==="products"){
    assert.equal(searchParams.get("id"),"in.(11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222)");
    return json(200,[{id:"11111111-1111-4111-8111-111111111111",image_url:"https://cdn.example.test/test.jpg"}]);
  }
  throw new Error(`Unexpected Supabase call ${path}`);
};

console.error=()=>{};console.warn=()=>{};
const handler=require("../api/orders/detail.js");
async function lookup(body){
  const res={statusCode:200,headers:{},body:undefined,
    status(code){this.statusCode=code;return this;},
    setHeader(name,value){this.headers[name.toLowerCase()]=value;return this;},
    json(payload){this.body=payload;return this;}};
  await handler({method:"POST",headers:{"content-type":"application/json"},body,socket:{remoteAddress:"203.0.113.9"}},res);
  return res;
}

// 1. The checkout number opens the order, however the customer types it.
for(const phone of ["081288451500","+62 812-8845-1500","6281288451500","81288451500"]){
  const res=await lookup({orderNumber:order.order_number,phone});
  assert.equal(res.statusCode,200,`${phone} opens the order`);
  assert.equal(res.body.orderNumber,order.order_number);
  assert.equal(res.body.items[0].name,"Test");
  assert.equal(res.body.items[0].quantity,2);
  assert.equal(res.body.items[0].image,"https://cdn.example.test/test.jpg","each line carries the product photo");
  assert.equal(res.body.items[1].image,null,"a deleted product just has no photo");
  assert.equal(res.body.customerPhone,undefined,"the phone number is never echoed back");
}

// 2. A different number, an unknown order or a malformed input get no order data.
{
  const wrong=await lookup({orderNumber:order.order_number,phone:"081200000000"});
  assert.equal(wrong.statusCode,404);
  assert.equal(wrong.body.orderNumber,undefined);
  const unknown=await lookup({orderNumber:"GYD-20260928-9999",phone:"081288451500"});
  assert.equal(unknown.statusCode,404);
  assert.equal((await lookup({orderNumber:"12345",phone:"081288451500"})).statusCode,400);
  assert.equal((await lookup({orderNumber:order.order_number,phone:"12"})).statusCode,400);
}

// 3. Phone lookups have their own, stricter limit, and fail closed if it is unavailable.
{
  rate.calls=0;
  await lookup({orderNumber:order.order_number,phone:"081288451500"});
  assert.equal(rate.calls,1,"each phone lookup consumes the orders:lookup bucket");
  rate.allowed=false;
  const limited=await lookup({orderNumber:order.order_number,phone:"081288451500"});
  assert.equal(limited.statusCode,429);
  assert.equal(limited.headers["retry-after"],"120");
  rate.allowed=true;rate.fail=true;
  const down=await lookup({orderNumber:order.order_number,phone:"081288451500"});
  assert.equal(down.statusCode,429,"a limiter outage refuses phone lookups instead of allowing guessing");
  rate.fail=false;
}

// 4. The access-token path from the confirmation email is unchanged and not phone-limited.
{
  rate.calls=0;
  const res=await lookup({orderNumber:order.order_number,orderAccessToken:TOKEN});
  assert.equal(res.statusCode,200);
  assert.equal(rate.calls,0,"token lookups do not use the phone bucket");
  assert.equal((await lookup({orderNumber:order.order_number,orderAccessToken:"c".repeat(64)})).statusCode,404);
}

console.log("Phase 8H guest order lookup verification passed.");
