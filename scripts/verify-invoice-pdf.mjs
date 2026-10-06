// Checks the hand-written invoice PDF (api/_invoice.js): a structurally valid file
// (header, objects at their xref offsets, trailer), the order data on the page with
// PDF-special and non-WinAnsi characters handled, extra pages for long orders, and the
// non-PKP wording (no PPN, not a Faktur Pajak).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";

const require=createRequire(import.meta.url);
const { buildInvoicePdf, invoiceNumber } = require("../api/_invoice.js");

const order={order_number:"GYD-20260930-0001",payment_method:"QRIS",subtotal:24600000,discount:0,total:24612000,shipping_cost:12000,
  customer_name:"Budi (Santoso) \\ 🙂",customer_phone:"6281234567890",customer_email:"budi@example.com",
  shipping_address:"Jalan Merdeka No. 10 RT 1 RW 2 Kelurahan Sukamaju Kecamatan Sukajaya yang namanya sangat panjang sekali",
  city:"Cirebon",postal_code:"45153",shipping_service_name:"JNE · Reguler",shipping_method:"courier"};
const items=[{product_name:"iPhone 17 Pro Max 256 GB Cosmic Orange Garansi Resmi",quantity:1,unit_price:24599000,subtotal:24599000},
  {product_name:"Test product",quantity:2,subtotal:1000}];

function inspect(pdf) {
  const raw=pdf.toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.4\n"),"PDF header");
  assert.ok(raw.endsWith("%%EOF\n"),"PDF trailer");
  const startxref=Number(raw.match(/startxref\n(\d+)\n%%EOF\n$/)[1]);
  assert.ok(raw.slice(startxref).startsWith("xref\n"),"startxref points at the xref table");
  const [,first,count]=raw.slice(startxref).match(/^xref\n(\d+) (\d+)\n/);
  assert.equal(Number(first),0);
  const entries=raw.slice(startxref).split("\n").slice(3,3+Number(count)-1);
  entries.forEach((entry,index)=>{
    const offset=Number(entry.slice(0,10));
    assert.ok(raw.slice(offset).startsWith(`${index+1} 0 obj\n`),`object ${index+1} sits at its xref offset`);
  });
  assert.match(raw,new RegExp(`/Size ${count} /Root 1 0 R`));
  const text=[...raw.matchAll(/\/Filter \/FlateDecode >>\nstream\n/g)].map(match=>{
    const start=match.index+match[0].length;
    const length=Number(raw.slice(0,match.index).match(/\/Length (\d+) $/)[1]);
    return inflateSync(pdf.subarray(start,start+length)).toString("latin1");
  }).join("\n");
  const pages=Number(raw.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1]);
  return {raw,text,pages};
}

// 1. One page with the order data, escaping and the non-PKP wording.
{
  const {raw,text,pages}=inspect(buildInvoicePdf(order,items,{paymentLabel:"QRIS / e-wallet",supportEmail:"support@getyourdevice.id",paidAt:new Date("2026-09-30T03:00:00Z")}));
  assert.equal(pages,1);
  assert.match(raw,/\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
  assert.match(raw,/\/Subtype \/Image \/Width 900 \/Height 191 .*\/Filter \/DCTDecode/);
  for(const expected of ["(INVOICE)","(LUNAS)","(INV-20260930-0001)","(GYD-20260930-0001)","(30 September 2026)","(QRIS / e-wallet)","(GETYOURDEVICE)",
    "(support@getyourdevice.id)","(Rp24.599.000)","(Rp24.612.000)","(Rp12.000)","(Ongkos kirim \xb7 JNE \xb7 Reguler)","(Cirebon 45153)"]) {
    assert.ok(text.includes(expected),`the invoice shows ${expected}`);
  }
  assert.ok(text.includes("(Budi \\(Santoso\\) \\\\ ?)"),"parentheses and backslashes are escaped; unsupported characters become ?");
  assert.ok(text.includes("(Rp500)"),"a unit price falls back to subtotal / quantity");
  assert.ok(text.includes("bukan Faktur Pajak"),"non-PKP: not a tax invoice");
  assert.doesNotMatch(text,/PPN|NPWP/,"non-PKP: no VAT lines");
  assert.doesNotMatch(text,/Diskon/,"no discount row when there is no discount");
  const addressLines=text.match(/\(Jalan Merdeka[^)]*\)|\(Kecamatan[^)]*\)|\(sangat[^)]*\)/g)||[];
  assert.ok(addressLines.length>=2,"a long address wraps");
}

// 2. A discount row, pickup wording and extra pages for a long order.
{
  const many=Array.from({length:40},(_,index)=>({product_name:`Produk nomor ${index+1}`,quantity:1,unit_price:10000,subtotal:10000}));
  const {text,pages}=inspect(buildInvoicePdf({...order,discount:5000,shipping_method:"pickup",shipping_cost:0},many));
  assert.ok(pages>1,"a long order continues on another page");
  assert.ok(text.includes("(Produk nomor 40)"));
  assert.ok(text.includes("(-Rp5.000)"));
  assert.ok(text.includes("(Pengiriman \\(ambil di toko\\))"));
}

assert.equal(invoiceNumber("GYD-20261003-0042"),"INV-20261003-0042");
console.log("Invoice PDF verification passed.");
