import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration,adapter,quotes,adminHtml,adminJs,storefront] = await Promise.all([
  readFile(new URL("../supabase/migrations/010_product_shipping_dimensions.sql",import.meta.url),"utf8"),
  readFile(new URL("../api/shipping/_biteship.js",import.meta.url),"utf8"),
  readFile(new URL("../api/shipping/quotes.js",import.meta.url),"utf8"),
  readFile(new URL("../admin.html",import.meta.url),"utf8"),
  readFile(new URL("../admin.js",import.meta.url),"utf8"),
  readFile(new URL("../app.js",import.meta.url),"utf8")
]);

assert.match(migration,/weight_grams integer/);
assert.match(migration,/length_cm numeric/);
assert.match(migration,/width_cm numeric/);
assert.match(migration,/height_cm numeric/);

assert.match(adapter,/https:\/\/api\.biteship\.com/);
assert.match(adapter,/\/v1\/rates\/couriers/);
assert.match(adapter,/authorization:apiKey/);
assert.match(adapter,/origin_postal_code:Number\(originPostalCode\)/);
assert.match(adapter,/destination_postal_code:Number\(destinationPostalCode\)/);
assert.match(adapter,/jne,jnt,sicepat,anteraja,ninja,pos,tiki/);
// The adapter may check the key prefix, but must never embed an actual key.
assert.doesNotMatch(adapter,/biteship_(test|live)\.[A-Za-z0-9_-]{8,}/);

assert.match(quotes,/weight_grams,length_cm,width_cm,height_cm/);
assert.match(quotes,/retrieveRates/);
assert.match(quotes,/missingShippingSpecs/);
assert.match(quotes,/Tarif kurir live sedang tidak tersedia/);
assert.match(quotes,/provider:"internal"/);

for(const id of ["weightGrams","lengthCm","widthCm","heightCm"]) assert.match(adminHtml,new RegExp(`id="${id}"`));
assert.match(adminJs,/weight_grams/);
assert.match(adminJs,/Untuk tarif kurir live, isi berat, panjang, lebar, dan tinggi sekaligus/);
assert.match(storefront,/Tarif kurir live via Biteship/);
assert.match(storefront,/shippingRatesLive/);

console.log("Biteship live-rate integration verification passed.");
