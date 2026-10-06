"use strict";

// Order, item and product reads shared by shipment booking and label printing.
const { supabaseAdmin } = require("../_supabase");

function value(...values){return values.find(v=>v!==null&&v!==undefined&&v!=="");}

async function jsonRows(path) {
  const response=await supabaseAdmin(path);
  const data=await response.json().catch(()=>[]);
  if(!response.ok) throw new Error(data?.message||data?.error||`Supabase lookup failed (${response.status})`);
  return data||[];
}
async function patchOrder(id,body) {
  const response=await supabaseAdmin(`orders?id=eq.${encodeURIComponent(id)}`,{
    method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(body)
  });
  if(!response.ok) {
    const data=await response.json().catch(()=>({}));
    throw new Error(data?.message||data?.error||"Order shipping update failed");
  }
}
async function loadOrder(id) {
  const rows=await jsonRows(`orders?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows[0]||null;
}
async function loadItems(orderId) {
  return jsonRows(`order_items?select=*&order_id=eq.${encodeURIComponent(orderId)}`);
}

async function hydratePhysical(items) {
  const missing=items.filter(item=>!(Number(item.weight_grams)>0&&Number(item.length_cm)>0&&Number(item.width_cm)>0&&Number(item.height_cm)>0));
  if(!missing.length) return items;
  const ids=[...new Set(missing.map(item=>item.product_id).filter(Boolean))];
  if(!ids.length) return items;
  const products=await jsonRows(`products?select=id,weight_grams,length_cm,width_cm,height_cm&id=in.(${ids.map(encodeURIComponent).join(",")})`);
  const byId=new Map(products.map(p=>[String(p.id),p]));
  return items.map(item=>{
    const product=byId.get(String(item.product_id));
    return {
      ...item,
      weight_grams:value(item.weight_grams,product?.weight_grams),
      length_cm:value(item.length_cm,product?.length_cm),
      width_cm:value(item.width_cm,product?.width_cm),
      height_cm:value(item.height_cm,product?.height_cm)
    };
  });
}

module.exports={hydratePhysical,jsonRows,loadItems,loadOrder,patchOrder,value};
