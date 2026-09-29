// Pickup coordinates for Biteship bookings: optional, validated, and sent as
// origin_coordinate when set (Pos Indonesia pickup requires it, error 40002040).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require=createRequire(import.meta.url);
const base={BITESHIP_API_KEY:"biteship_test.x",SHIPPING_ORIGIN_POSTAL_CODE:"10140",SHIPPING_ORIGIN_CONTACT_NAME:"Toko",SHIPPING_ORIGIN_CONTACT_PHONE:"081234567890",SHIPPING_ORIGIN_ADDRESS:"Jl. Contoh No. 1, Jakarta"};
function withEnv(extra,fn){
  const saved={...process.env};
  for(const key of ["SHIPPING_ORIGIN_LATITUDE","SHIPPING_ORIGIN_LONGITUDE"]) delete process.env[key];
  Object.assign(process.env,base,extra);
  try{return fn();}finally{process.env=saved;}
}
const { bookingConfig }=require("../api/shipping/_biteship.js");

assert.equal(withEnv({},()=>bookingConfig().originCoordinate),null,"no coordinate when unset");
assert.deepEqual(withEnv({SHIPPING_ORIGIN_LATITUDE:" -6.1702 ",SHIPPING_ORIGIN_LONGITUDE:"106.8012"},()=>bookingConfig().originCoordinate),{latitude:-6.1702,longitude:106.8012});
for(const bad of [{SHIPPING_ORIGIN_LATITUDE:"-6.17"},{SHIPPING_ORIGIN_LONGITUDE:"106.8"},{SHIPPING_ORIGIN_LATITUDE:"106.8",SHIPPING_ORIGIN_LONGITUDE:"-6.17"},{SHIPPING_ORIGIN_LATITUDE:"abc",SHIPPING_ORIGIN_LONGITUDE:"106.8"}]){
  assert.throws(()=>withEnv(bad,()=>bookingConfig()),/SHIPPING_ORIGIN_LATITUDE\/LONGITUDE is not configured correctly/,`rejects ${JSON.stringify(bad)}`);
}

const book=await readFile(new URL("../api/shipping/book.js",import.meta.url),"utf8");
assert.match(book,/origin_coordinate:cfg\.originCoordinate/,"booking sends the pickup coordinate");
assert.match(book,/40002040/,"missing-coordinate rejection gets a clear admin message");
assert.match(book,/SHIPPING_ORIGIN_\.\*not configured/,"a bad coordinate setting maps to the origin configuration error");
console.log("Shipping origin coordinate verification passed.");
