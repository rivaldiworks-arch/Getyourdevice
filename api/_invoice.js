"use strict";
const { deflateSync } = require("node:zlib");
const { HELVETICA_WIDTHS, HELVETICA_BOLD_WIDTHS, LOGO_WIDTH, LOGO_HEIGHT, LOGO_JPEG_BASE64 } = require("./_invoiceAssets");

// Invoice PDF attached to the customer's "Pembayaran diterima" email. Written by hand
// (A4, the built-in Helvetica fonts, one JPEG logo) so the API keeps zero dependencies.
// The store is not a PKP, so the invoice carries no PPN and says it is not a Faktur Pajak.

const PAGE_W=595.28,PAGE_H=841.89,MARGIN=48,RIGHT=PAGE_W-MARGIN;
const INK="0.09 0.13 0.2",MUTED="0.37 0.42 0.48",BRAND="0.08 0.27 0.63",RULE="0.87 0.89 0.92";
const STORE={name:"GETYOURDEVICE",site:"www.getyourdevice.id",whatsapp:"WhatsApp 0812-8845-1500"};

// WinAnsi (cp1252) code for a character; characters the built-in fonts cannot draw become "?".
const CP1252_EXTRA=new Map(Object.entries({"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,
  "‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159}));
function winAnsi(char) {
  const code=char.codePointAt(0);
  if(code>=32 && code<=126) return code;
  if(code>=160 && code<=255) return code;
  return CP1252_EXTRA.get(char)??63;
}
function clean(value) {
  return String(value??"").replace(/\s+/g," ").trim();
}
function textWidth(text,bold,size) {
  const widths=bold?HELVETICA_BOLD_WIDTHS:HELVETICA_WIDTHS;
  let total=0;
  for(const char of text) total+=widths[winAnsi(char)-32]||556;
  return total*size/1000;
}
function pdfString(text) {
  let out="";
  for(const char of text) {
    const code=winAnsi(char);
    out+=code===40||code===41||code===92?`\\${String.fromCharCode(code)}`:String.fromCharCode(code);
  }
  return `(${out})`;
}
// Greedy word wrap; a single word wider than the line is cut by characters.
function wrap(text,bold,size,maxWidth) {
  const lines=[];
  let line="";
  for(const word of clean(text).split(" ").filter(Boolean)) {
    const candidate=line?`${line} ${word}`:word;
    if(textWidth(candidate,bold,size)<=maxWidth) { line=candidate; continue; }
    if(line) lines.push(line);
    line=word;
    while(textWidth(line,bold,size)>maxWidth) {
      let cut=line.length-1;
      while(cut>1 && textWidth(line.slice(0,cut),bold,size)>maxWidth) cut--;
      lines.push(line.slice(0,cut));
      line=line.slice(cut);
    }
  }
  if(line) lines.push(line);
  return lines.length?lines:[""];
}
function rupiah(value) {
  return `Rp${Math.round(Number(value)||0).toLocaleString("id-ID")}`;
}
function jakartaDate(date) {
  return new Date(date).toLocaleDateString("id-ID",{timeZone:"Asia/Jakarta",day:"numeric",month:"long",year:"numeric"});
}
function invoiceNumber(orderNumber) {
  return `INV-${String(orderNumber||"").replace(/^GYD-/,"")}`;
}
function unitPrice(item) {
  const quantity=Number(item.quantity)||1;
  const explicit=[item.unit_price,item.product_price,item.price].map(Number).find(value=>Number.isFinite(value)&&value>0);
  return explicit??(Number(item.subtotal)||0)/quantity;
}

class Page {
  constructor() { this.ops=[]; }
  text(x,y,text,{bold=false,size=10,color=INK,align="left"}={}) {
    const value=clean(text);
    const left=align==="right"?x-textWidth(value,bold,size):x;
    this.ops.push(`BT ${color} rg /${bold?"F2":"F1"} ${size} Tf ${left.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`);
  }
  rule(x1,y,x2,{color=RULE,width=0.8}={}) {
    this.ops.push(`${color} RG ${width} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
  }
  box(x,y,w,h,color) {
    this.ops.push(`${color} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  logo(x,y,height) {
    const width=height*LOGO_WIDTH/LOGO_HEIGHT;
    this.ops.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Logo Do Q`);
  }
}

function assemble(pages) {
  const logo=Buffer.from(LOGO_JPEG_BASE64,"base64");
  const objects=[];
  const add=body=>{ objects.push(body); return objects.length; };
  const catalog=add(null),pagesId=add(null);
  const regular=add(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>","latin1"));
  const bold=add(Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>","latin1"));
  const image=add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${LOGO_WIDTH} /Height ${LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>\nstream\n`,"latin1"),logo,Buffer.from("\nendstream","latin1")]));
  const pageIds=pages.map(page=>{
    const content=deflateSync(Buffer.from(page.ops.join("\n"),"latin1"));
    const contentId=add(Buffer.concat([Buffer.from(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n`,"latin1"),content,Buffer.from("\nendstream","latin1")]));
    return add(Buffer.from(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> /XObject << /Logo ${image} 0 R >> >> /Contents ${contentId} 0 R >>`,"latin1"));
  });
  objects[catalog-1]=Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`,"latin1");
  objects[pagesId-1]=Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,"latin1");

  const chunks=[Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n","latin1")];
  let offset=chunks[0].length;
  const offsets=objects.map((body,index)=>{
    const chunk=Buffer.concat([Buffer.from(`${index+1} 0 obj\n`,"latin1"),body,Buffer.from("\nendobj\n","latin1")]);
    const at=offset;
    chunks.push(chunk); offset+=chunk.length;
    return at;
  });
  const xref=[`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`,...offsets.map(at=>`${String(at).padStart(10,"0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R >>\nstartxref\n${offset}\n%%EOF\n`,"latin1"));
  return Buffer.concat(chunks);
}

// order: an orders row; items: order_items rows; paidAt: when the payment settled.
function buildInvoicePdf(order,items,{paidAt=new Date(),paymentLabel=order.payment_method,supportEmail=null}={}) {
  const pages=[new Page()];
  let page=pages[0];
  let y=PAGE_H-MARGIN;

  // Header: logo left, title and paid badge right.
  page.logo(MARGIN,y-32,32);
  page.text(RIGHT,y-20,"INVOICE",{bold:true,size:22,color:BRAND,align:"right"});
  const badge="LUNAS",badgeW=textWidth(badge,true,9)+16;
  page.box(RIGHT-badgeW,y-44,badgeW,16,"0.09 0.55 0.32");
  page.text(RIGHT-8,y-39,badge,{bold:true,size:9,color:"1 1 1",align:"right"});
  y-=70;
  page.rule(MARGIN,y,RIGHT);
  y-=22;

  // Invoice facts.
  const facts=[["Nomor invoice",invoiceNumber(order.order_number)],["Nomor pesanan",order.order_number],["Tanggal pembayaran",jakartaDate(paidAt)],["Metode pembayaran",paymentLabel]];
  facts.forEach(([label,value],index)=>{
    const x=MARGIN+(index%2)*((RIGHT-MARGIN)/2);
    const row=y-Math.floor(index/2)*32;
    page.text(x,row,label.toUpperCase(),{size:7.5,color:MUTED});
    page.text(x,row-13,value,{bold:true,size:10.5});
  });
  y-=78;

  // From / bill to.
  const colW=(RIGHT-MARGIN)/2-16,billX=MARGIN+(RIGHT-MARGIN)/2;
  page.text(MARGIN,y,"DARI",{size:7.5,color:MUTED});
  page.text(billX,y,"DITAGIHKAN KEPADA",{size:7.5,color:MUTED});
  const from=[STORE.site,STORE.whatsapp,...(supportEmail?[supportEmail]:[])];
  page.text(MARGIN,y-15,STORE.name,{bold:true,size:10.5});
  from.forEach((line,index)=>page.text(MARGIN,y-30-index*13,line,{size:9.5,color:MUTED}));
  page.text(billX,y-15,wrap(order.customer_name||"-",true,10.5,colW)[0],{bold:true,size:10.5});
  const billLines=[order.customer_phone,order.customer_email,...wrap(order.shipping_address,false,9.5,colW),[order.city,order.postal_code].filter(Boolean).join(" ")].map(clean).filter(Boolean);
  billLines.forEach((line,index)=>page.text(billX,y-30-index*13,line,{size:9.5,color:MUTED}));
  y-=30+Math.max(from.length,billLines.length)*13+18;

  // Items.
  const colQty=RIGHT-190,colPrice=RIGHT-95,nameW=colQty-MARGIN-40;
  const header=()=>{
    page.box(MARGIN,y-7,RIGHT-MARGIN,22,"0.95 0.96 0.97");
    page.text(MARGIN+8,y,"PRODUK",{bold:true,size:8,color:MUTED});
    page.text(colQty,y,"QTY",{bold:true,size:8,color:MUTED,align:"right"});
    page.text(colPrice,y,"HARGA",{bold:true,size:8,color:MUTED,align:"right"});
    page.text(RIGHT-8,y,"SUBTOTAL",{bold:true,size:8,color:MUTED,align:"right"});
    y-=28;
  };
  header();
  for(const item of items) {
    const quantity=Number(item.quantity)||1,price=unitPrice(item);
    const subtotal=Number(item.subtotal)||price*quantity;
    const lines=wrap(item.product_name||"Produk",false,10,nameW);
    if(y-lines.length*13<MARGIN+150) { page=new Page(); pages.push(page); y=PAGE_H-MARGIN; header(); }
    lines.forEach((line,index)=>page.text(MARGIN+8,y-index*13,line,{size:10}));
    page.text(colQty,y,String(quantity),{size:10,align:"right"});
    page.text(colPrice,y,rupiah(price),{size:10,align:"right"});
    page.text(RIGHT-8,y,rupiah(subtotal),{size:10,align:"right"});
    y-=lines.length*13+6;
    page.rule(MARGIN,y+2,RIGHT);
    y-=14;
  }

  // Totals.
  const itemsTotal=items.reduce((sum,item)=>sum+(Number(item.subtotal)||unitPrice(item)*(Number(item.quantity)||1)),0);
  const subtotal=Number(order.subtotal)>0?Number(order.subtotal):itemsTotal;
  const discount=Number(order.discount)||0;
  const pickup=order.shipping_method==="pickup";
  const rows=[["Subtotal produk",rupiah(subtotal)],[pickup?"Pengiriman (ambil di toko)":`Ongkos kirim${order.shipping_service_name?` · ${clean(order.shipping_service_name)}`:""}`,rupiah(order.shipping_cost)],
    ...(discount>0?[["Diskon",`-${rupiah(discount)}`]]:[])];
  const labelX=RIGHT-250;
  for(const [label,value] of rows) {
    page.text(labelX,y,label,{size:9.5,color:MUTED});
    page.text(RIGHT-8,y,value,{size:10,align:"right"});
    y-=17;
  }
  page.rule(labelX,y+6,RIGHT,{color:INK,width:1});
  y-=12;
  page.text(labelX,y,"Total dibayar",{bold:true,size:11});
  page.text(RIGHT-8,y,rupiah(order.total),{bold:true,size:14,color:BRAND,align:"right"});

  // Footer.
  const footerY=MARGIN+28;
  page.rule(MARGIN,footerY+16,RIGHT);
  page.text(MARGIN,footerY,"Terima kasih telah berbelanja di GETYOURDEVICE. Simpan invoice ini sebagai bukti pembelian dan untuk klaim garansi.",{size:8.5,color:MUTED});
  page.text(MARGIN,footerY-12,"Invoice ini diterbitkan secara elektronik, sah tanpa tanda tangan, dan bukan Faktur Pajak.",{size:8.5,color:MUTED});

  return assemble(pages);
}

module.exports={buildInvoicePdf,invoiceNumber};
