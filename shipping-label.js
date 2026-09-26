"use strict";

// Printable 100x150 mm shipping label for the admin panel. Biteship has no label API,
// so the label is rendered here from /api/shipping/label and printed (or saved as
// PDF) through the browser's print dialog. The waybill barcode is Code 128.
(function(){
  // Code 128 bar/space widths for symbol values 0-106 (106 is the stop pattern).
  const PATTERNS=["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112"];
  const START_B=104,START_C=105,CODE_B=100,CODE_C=99,STOP=106;

  // Symbol values for text: Code C (digit pairs) for runs of 4+ digits, Code B otherwise.
  function code128Values(text){
    const value=String(text||"");
    if(!value||/[^\x20-\x7e]/.test(value)) throw new Error("Resi hanya boleh berisi karakter ASCII.");
    const values=[];let set=null,i=0;
    const digitRun=from=>{let n=0;while(from+n<value.length&&value[from+n]>="0"&&value[from+n]<="9")n++;return n;};
    const useSet=next=>{if(set===next)return;values.push(set?(next==="C"?CODE_C:CODE_B):(next==="C"?START_C:START_B));set=next;};
    while(i<value.length){
      const run=digitRun(i);
      if(run>=4||(set==="C"&&run>=2)){
        // An odd run keeps its first digit in Code B so the rest pairs up evenly.
        if(run%2===1){useSet("B");values.push(value.charCodeAt(i)-32);i++;continue;}
        useSet("C");
        for(let end=i+run;i<end;i+=2)values.push(Number(value.slice(i,i+2)));
        continue;
      }
      useSet("B");values.push(value.charCodeAt(i)-32);i++;
    }
    const checksum=values.reduce((sum,v,index)=>sum+v*(index||1),0)%103;
    return [...values,checksum,STOP];
  }

  // Inline SVG barcode, 10-module quiet zone either side. The SVG stretches to the
  // label width; bars keep their ratios because every module scales together.
  function code128Svg(text,{height=60}={}){
    const widths=code128Values(text).map(v=>PATTERNS[v]).join("");
    let x=10,bars="";
    [...widths].forEach((w,index)=>{const width=Number(w);if(index%2===0)bars+=`<rect x="${x}" y="0" width="${width}" height="${height}"/>`;x+=width;});
    const total=x+10;
    return `<svg class="label-barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode resi ${escapeHTML(text)}"><rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${bars}</g></svg>`;
  }

  function escapeHTML(value=""){return String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);}
  function weightLabel(grams){if(!grams)return "-";return grams>=1000?`${(grams/1000).toLocaleString("id-ID",{maximumFractionDigits:2})} kg`:`${grams} g`;}

  function labelHTML(data){
    const courier=String(data.courier?.company||"").toUpperCase();
    const service=String(data.courier?.type||"").toUpperCase();
    const recipient=data.recipient||{},sender=data.sender||{};
    const items=(data.items||[]);
    // Six lines fit the label; the rest is summarised so nothing is silently cut off.
    const shown=items.slice(0,6),hidden=items.slice(6).reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
    const count=items.reduce((sum,item)=>sum+(Number(item.quantity)||0),0);
    const created=data.createdAt?new Date(data.createdAt).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}):"-";
    return `<article class="shipping-label">
      <header class="label-head"><strong class="label-store">${escapeHTML(sender.name||"GETYOURDEVICE")}</strong><span class="label-courier"><b>${escapeHTML(courier||data.courier?.name||"KURIR")}</b>${service?`<small>${escapeHTML(service)}</small>`:""}</span></header>
      ${data.environment==="test"?'<p class="label-test">LABEL UJI COBA — BUKAN PENGIRIMAN NYATA</p>':""}
      <section class="label-waybill">${code128Svg(data.trackingNumber)}<p><span>No. Resi</span><strong>${escapeHTML(data.trackingNumber)}</strong></p></section>
      <section class="label-party label-recipient"><h4>Penerima</h4><strong>${escapeHTML(recipient.name)}</strong><p>${escapeHTML(recipient.phone)}</p><p>${escapeHTML(recipient.address)}</p><p><b>${escapeHTML([recipient.city,recipient.postalCode].filter(Boolean).join(" "))}</b></p></section>
      <section class="label-party label-sender"><h4>Pengirim</h4><p><b>${escapeHTML(sender.contact||sender.name)}</b> · ${escapeHTML(sender.phone)}</p><p>${escapeHTML(sender.address)}${sender.postalCode?` ${escapeHTML(sender.postalCode)}`:""}</p></section>
      <section class="label-meta"><div><span>Pesanan</span><b>${escapeHTML(data.orderNumber)}</b></div><div><span>Tanggal</span><b>${escapeHTML(created)}</b></div><div><span>Berat</span><b>${escapeHTML(weightLabel(data.weightGrams))}</b></div><div><span>Jumlah</span><b>${count} barang</b></div></section>
      <section class="label-items"><h4>Isi paket</h4><ul>${shown.map(item=>`<li>${escapeHTML(item.name)} <b>× ${Number(item.quantity)||1}</b></li>`).join("")}${hidden?`<li><b>+${hidden} barang lainnya</b></li>`:""}</ul>${recipient.note?`<p class="label-note"><b>Catatan:</b> ${escapeHTML(recipient.note)}</p>`:""}</section>
    </article>`;
  }

  window.GydLabel={code128Values,code128Svg,labelHTML};
})();
