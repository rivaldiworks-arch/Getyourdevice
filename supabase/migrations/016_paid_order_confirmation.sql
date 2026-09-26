-- Phase 7E: confirm orders automatically once payment lands, and record seller
-- notifications so each paid order is emailed exactly once.
-- Additive and safe to re-run. Apply BEFORE deploying the Phase 7E code.

-- Set atomically by the API before it emails the seller about a paid order. Only the
-- request that flips it from null sends the email, so webhook retries and the
-- payment API's own status sync cannot produce duplicates.
alter table public.orders
  add column if not exists paid_notified_at timestamptz;

-- Replaces the Phase 5 snapshot trigger function. Besides mirroring the payment status
-- onto the order, a paid payment now moves a still-'pending' order to 'confirmed'.
-- Orders an admin has already progressed (processing/shipped/...) or cancelled are
-- left untouched. Running this inside the payments trigger covers every path that
-- can mark a payment paid: the Midtrans webhook, the payment API's status sync, and
-- manual admin updates.
create or replace function public.sync_order_payment_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  update public.orders set
    payment_status=new.status,
    status=case when new.status='paid' and status='pending' then 'confirmed' else status end,
    payment_reference=case when new.status in ('paid','refunded')
      then coalesce(new.external_transaction_id,new.provider_reference,payment_reference) else payment_reference end
  where id=new.order_id;
  return new;
end $$;

notify pgrst, 'reload schema';
