// Behavioural checks for Phase 8D: printable shipping labels. Runs the real
// /api/shipping/label handler against in-memory Supabase (auth + REST) and Biteship
// doubles, and checks the Code 128 encoder against hand-computed symbol values.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
function resetEnv(overrides={}){
  Object.assign(process.env,{
    SUPABASE_URL:"https://db.test",SUPABASE_ANON_KEY:"anon",SUPABASE_SERVICE_ROLE_KEY:"service-role-test-key-0123456789abcdef",
    BITESHIP_API_KEY:"biteship_live.test-key",SHIPPING_ORIGIN_POSTAL_CODE:"13220",SHIPPING_ORIGIN_CONTACT_NAME:"Rivaldi",
    SHIPPING_ORIGIN_CONTACT_PHONE:"081234567890",SHIPPING_ORIGIN_ADDRESS:"Jl. Pemuda No. 1, Rawamangun, Jakarta Timur",SHIPPING_ORIGIN_ORGANIZATION:"GETYOURDEVICE",
    ...overrides
  });
}
resetEnv();

const db={orders:[],items:[],products:[],patches:[]};
const biteship={orders:new Map(),calls:0};
let role="admin";
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
const eq=(url,key)=>new URL(url).searchParams.get(key)?.replace(/^eq\./,"");
globalThis.fetch=async (url,init={})=>{
  const u=new URL(url);
  if(u.host==="api.biteship.com"){
    biteship.calls++;
    const id=u.pathname.split("/").pop();
    return json(200,{success:true,...biteship.orders.get(id)});
  }
  if(u.host!=="db.test") throw new Error(`Unexpected network call to ${u.host}`);
  if(u.pathname==="/auth/v1/user") return init.headers.Authorization==="Bearer good"?json(200,{id:"admin-1"}):json(401,{msg:"invalid"});
  const path=u.pathname.replace("/rest/v1/","");
  if(path==="admin_profiles") return json(200,role?[{id:"admin-1",role}]:[]);
  if(path==="orders"&&init.method==="PATCH"){db.patches.push({id:eq(url,"id"),...JSON.parse(init.body)});return new Response(null,{status:204});}
  if(path==="orders") return json(200,db.orders.filter(order=>order.id===eq(url,"id")));
  if(path==="order_items") return json(200,db.items.filter(item=>item.order_id===eq(url,"order_id")));
  if(path==="products"){const ids=u.searchParams.get("id").replace(/^in\.\(|\)$/g,"").split(",");return json(200,db.products.filter(p=>ids.includes(p.id)));}
  throw new Error(`Unexpected Supabase call ${init.method||"GET"} ${path}`);
};
async function label(orderId,token="good"){
  const res={statusCode:200,headers:{},status(c){this.statusCode=c;return this;},setHeader(n,v){this.headers[n]=v;return this;},json(p){this.body=p;return this;}};
  await require("../api/shipping/label.js")({method:"POST",headers:{authorization:`Bearer ${token}`},body:{orderId}},res);
  return res;
}
console.error=()=>{};

const order={id:"o1",order_number:"GYD-20260926-0007",created_at:"2026-09-26T08:00:00Z",customer_name:"Oslo",customer_phone:"6281288451500",
  shipping_address:"Jl. Rawamangun Muka No. 5",city:"Jakarta Timur",postal_code:"13220",shipping_service_code:"jne:reg",shipping_service_name:"JNE Reguler",
  shipping_order_id:"bs-1",tracking_number:"JNE0012345678",shipping_environment:"live",notes:"Titip satpam"};
db.orders.push(order,{...order,id:"o-unbooked",shipping_order_id:null,tracking_number:null},{...order,id:"o-pending",shipping_order_id:"bs-2",tracking_number:null});
db.items.push(
  {order_id:"o1",product_id:"p1",product_name:"Galaxy A56 5G",quantity:1,weight_grams:450},
  {order_id:"o1",product_id:"p2",product_name:"Mouse",quantity:2,weight_grams:null},
  {order_id:"o-pending",product_id:"p2",product_name:"Mouse",quantity:1}
);
db.products.push({id:"p2",weight_grams:120,length_cm:10,width_cm:6,height_cm:4});

// 1. Full label data for a booked shipment.
{
  const res=await label("o1");
  assert.equal(res.statusCode,200);
  const data=res.body;
  assert.equal(data.trackingNumber,"JNE0012345678");
  assert.deepEqual(data.courier,{company:"jne",type:"reg",name:"JNE Reguler"});
  assert.deepEqual(data.recipient,{name:"Oslo",phone:"6281288451500",address:"Jl. Rawamangun Muka No. 5",city:"Jakarta Timur",postalCode:"13220",note:"Titip satpam"});
  assert.deepEqual(data.sender,{name:"GETYOURDEVICE",contact:"Rivaldi",phone:"081234567890",address:"Jl. Pemuda No. 1, Rawamangun, Jakarta Timur",postalCode:"13220"});
  assert.deepEqual(data.items,[{name:"Galaxy A56 5G",quantity:1},{name:"Mouse",quantity:2}]);
  assert.equal(data.weightGrams,450+2*120,"item weight falls back to the product");
  assert.equal(biteship.calls,0,"a stored waybill needs no Biteship call");
}
// 2. Not booked yet.
{
  const res=await label("o-unbooked");
  assert.equal(res.statusCode,409);
  assert.match(res.body.error,/Buat pengiriman Biteship/);
}
// 3. Waybill assigned after booking: fetched once from Biteship and stored.
{
  biteship.orders.set("bs-2",{id:"bs-2",courier:{waybill_id:null,link:null}});
  let res=await label("o-pending");
  assert.equal(res.statusCode,409);
  assert.equal(res.body.code,"WAYBILL_PENDING");
  biteship.orders.set("bs-2",{id:"bs-2",courier:{waybill_id:"JP9988776655",link:"https://track.test/JP9988776655"}});
  res=await label("o-pending");
  assert.equal(res.statusCode,200);
  assert.equal(res.body.trackingNumber,"JP9988776655");
  assert.deepEqual(db.patches.at(-1),{id:"o-pending",tracking_number:"JP9988776655",tracking_url:"https://track.test/JP9988776655"});
}
// 4. Admin only.
assert.equal((await label("o1","bad")).statusCode,401);
role="viewer";
assert.equal((await label("o1")).statusCode,403);
role="admin";
// 5. Sender address missing on the server.
resetEnv({SHIPPING_ORIGIN_ADDRESS:""});
assert.equal((await label("o1")).statusCode,503);
resetEnv();

// ---------------------------------------------------------------- Code 128
globalThis.window={};
require("../shipping-label.js");
const { code128Values, code128Svg, labelHTML } = globalThis.window.GydLabel;
assert.deepEqual(code128Values("AB"),[104,33,34,102,106],"Code B with checksum (104+33+2*34) mod 103");
assert.deepEqual(code128Values("JP1234567890"),[104,42,48,99,12,34,56,78,90,93,106],"letters in B, digit run switches to C");
assert.deepEqual(code128Values("12345"),[104,17,99,23,45,53,106],"odd digit run keeps one digit in B");
assert.deepEqual(code128Values("0012345678"),[105,0,12,34,56,78,21,106],"all digits: Code C, (105+0+24+102+224+390) mod 103 = 21");
assert.throws(()=>code128Values("RESI—1"),/ASCII/);
const svg=code128Svg("JNE0012345678");
const modules=[...svg.matchAll(/<rect x="(\d+)" y="0" width="(\d)"/g)];
assert.ok(modules.length>20);
const viewWidth=Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
const last=modules.at(-1);
assert.equal(Number(last[1])+Number(last[2])+10,viewWidth,"10-module quiet zone after the stop bar");
assert.equal(Number(modules[0][1]),10,"10-module quiet zone before the start bar");
const html=labelHTML({orderNumber:"GYD-1",trackingNumber:"X1",courier:{company:"jne",type:"reg"},recipient:{name:'<img src=x onerror="alert(1)">'},sender:{},items:[{name:"<b>x</b>",quantity:1}],environment:"test"});
assert.doesNotMatch(html,/<img src=x/,"customer text is escaped");
assert.match(html,/LABEL UJI COBA/,"Biteship test bookings are marked");
const many=labelHTML({orderNumber:"GYD-1",trackingNumber:"X1",courier:{},recipient:{},sender:{},items:Array.from({length:9},(_,i)=>({name:`Item ${i}`,quantity:2}))});
assert.equal((many.match(/<li>/g)||[]).length,7,"six items plus a summary line");
assert.match(many,/\+6 barang lainnya/);

console.log("Phase 8D shipping label verification passed.");
