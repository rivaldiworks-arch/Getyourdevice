"use strict";

// Order status flow. Mirrors public.guard_order_status_transition (migration 020),
// which is authoritative; this copy lets writers skip a jump the database would refuse
// instead of failing the whole request.
const ORDER_TRANSITIONS=Object.freeze({
  pending:["confirmed","cancelled"],
  confirmed:["processing","shipped","completed","cancelled"],
  processing:["shipped","completed","cancelled"],
  shipped:["completed","cancelled"],
  completed:[],
  cancelled:[]
});

function canTransitionOrder(order,to) {
  const from=String(order?.status||"pending").toLowerCase();
  const next=String(to||"").toLowerCase();
  if(from===next) return true;
  if(from==="pending" && next==="completed") return order?.payment_method==="COD" && order?.shipping_method==="pickup";
  return (ORDER_TRANSITIONS[from]||[]).includes(next);
}

// Order status implied by a Biteship shipment status, or the current status when the
// shipment event does not move the order forward along the flow. A cancelled shipment
// (courier unavailable, booking cancelled) is not a cancelled order: the customer has
// usually paid, so the order stays put for the seller to rebook or refund.
function orderStatusForShipment(shippingStatus,order) {
  const shipping=String(shippingStatus||"").toLowerCase();
  const current=String(order?.status||"pending").toLowerCase();
  let next=current;
  if(shipping==="delivered") next="completed";
  else if(["picked","dropping_off","return_in_transit","returned","disposed"].includes(shipping)) next="shipped";
  else if(["confirmed","allocated","picking_up"].includes(shipping)) next="processing";
  return canTransitionOrder(order,next)?next:current;
}

module.exports={ORDER_TRANSITIONS,canTransitionOrder,orderStatusForShipment};
