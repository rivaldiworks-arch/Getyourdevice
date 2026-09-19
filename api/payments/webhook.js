"use strict";
const { supabaseAdmin } = require("../_supabase");
const { canTransition } = require("./_provider");
const { getTransactionStatus, normalizeMidtransStatus, verifyNotificationSignature } = require("./_midtrans");

async function adminRows(path,options={}) {
  const response=await supabaseAdmin(path,options);
  const data=await response.json().catch(()=>[]);
  if(!response.ok) throw new Error(data?.message||data?.error||`Supabase admin request failed (${response.status})`);
  return data;
}

function safeProviderPayload(payload={}) {
  const {signature_key,...safe}=payload;
  return safe;
}

module.exports=async function handler(req,res) {
  if(req.method!=="POST") return res.status(405).setHeader("Allow","POST").json({error:"Method not allowed"});

  try {
    const payload=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
    if(!verifyNotificationSignature(payload)) return res.status(401).json({error:"Invalid webhook signature"});

    // Challenge Midtrans after signature verification and use the GET Status result as
    // the authoritative state instead of trusting the incoming body alone.
    const transaction=await getTransactionStatus(String(payload.order_id||""));
    const orderId=String(transaction.order_id||"");
    if(!orderId) return res.status(400).json({error:"Missing Midtrans order id"});

    const rows=await adminRows(`payments?select=*&provider=eq.midtrans&provider_reference=eq.${encodeURIComponent(orderId)}&limit=1`);
    const payment=rows?.[0];
    if(!payment) {
      console.error("Midtrans webhook payment not found",{orderId});
      return res.status(503).json({error:"Payment not ready"});
    }

    const providerAmount=Number(transaction.gross_amount);
    if(!Number.isFinite(providerAmount) || Math.abs(providerAmount-Number(payment.amount))>0.001) {
      console.error("Midtrans webhook amount mismatch",{orderId,providerAmount,paymentAmount:Number(payment.amount)});
      return res.status(409).json({error:"Payment amount mismatch"});
    }

    const nextStatus=normalizeMidtransStatus(transaction.transaction_status);
    if(!canTransition(payment.status,nextStatus)) {
      console.warn("Ignoring stale Midtrans status",{orderId,current:payment.status,next:nextStatus});
      return res.status(200).json({ok:true,ignored:true});
    }

    const changes={
      status:nextStatus,
      external_transaction_id:transaction.transaction_id||payment.external_transaction_id||null,
      provider_payload:safeProviderPayload(transaction)
    };
    const update=await supabaseAdmin(`payments?id=eq.${encodeURIComponent(payment.id)}`,{
      method:"PATCH",
      headers:{Prefer:"return=minimal"},
      body:JSON.stringify(changes)
    });
    if(!update.ok) {
      const data=await update.json().catch(()=>({}));
      throw new Error(data?.message||data?.error||`Payment update failed (${update.status})`);
    }

    return res.status(200).json({ok:true,paymentStatus:nextStatus});
  } catch(error) {
    if(error instanceof SyntaxError) return res.status(400).json({error:"Invalid JSON"});
    console.error("Midtrans webhook processing failed",{message:error.message,status:error.status||null});
    if(error.message==="MIDTRANS_SERVER_KEY is not configured" || error.message==="SUPABASE_SERVICE_ROLE_KEY is not configured") {
      return res.status(503).json({error:"Payment backend is not configured"});
    }
    return res.status(500).json({error:"Webhook processing failed"});
  }
};
