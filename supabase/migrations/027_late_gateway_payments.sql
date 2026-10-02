-- Phase 8J: a payment Midtrans settles is always recorded, even when our row already
-- says 'expired' or 'failed'. Safe to re-run. Apply BEFORE deploying the Phase 8J code.
--
-- 1. prepare_payment allows expired/failed -> paid. Our expiry is our own estimate; the
--    gateway holds the money. Before this, the guard rejected the update and the webhook
--    acknowledged the notification, so a settled payment was dropped without a trace.
--    That happened when two "Bayar" requests raced on one Snap attempt (one retired the
--    row while the other handed its link to the customer), or when a VA chosen on a
--    retired Snap page was paid later.
-- 2. sync_order_payment_snapshot never moves an order's payment_status off 'paid' or
--    'refunded' because another attempt of the same order expired or failed. Only a
--    refund changes a paid order. Without this, a late payment on one attempt followed by
--    the expiry of another would show the paid order as expired again.
-- 3. email_log accepts 'seller-duplicate-paid', the alert sent when one order is paid
--    more than once.

create or replace function public.prepare_payment()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_order_total numeric(14,2);
begin
  select total into v_order_total from public.orders where id=new.order_id;
  if not found then raise exception using message='ORDER_NOT_FOUND',errcode='P0001'; end if;
  if new.amount<>v_order_total then raise exception using message='PAYMENT_AMOUNT_MISMATCH',errcode='P0001'; end if;
  if tg_op='UPDATE' and new.status<>old.status and not (
    (old.status='unpaid' and new.status in ('pending','paid','failed','expired')) or
    (old.status='pending' and new.status in ('paid','failed','expired')) or
    (old.status in ('failed','expired') and new.status='paid') or
    (old.status='paid' and new.status='refunded')
  ) then raise exception using message='INVALID_PAYMENT_TRANSITION',errcode='P0001'; end if;
  if tg_op='UPDATE' then
    new.order_id=old.order_id; new.amount=old.amount; new.payment_method=old.payment_method;
    new.updated_at=now();
  end if;
  if new.status='paid' and new.paid_at is null then new.paid_at=now(); end if;
  if new.status='failed' and new.failed_at is null then new.failed_at=now(); end if;
  return new;
end $$;

create or replace function public.sync_order_payment_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  update public.orders set
    payment_status=case
      when payment_status in ('paid','refunded') and new.status not in ('paid','refunded') then payment_status
      else new.status end,
    status=case when new.status='paid' and status='pending' then 'confirmed' else status end,
    payment_reference=case when new.status in ('paid','refunded')
      then coalesce(new.external_transaction_id,new.provider_reference,payment_reference) else payment_reference end
  where id=new.order_id;
  return new;
end $$;

alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('seller-created','seller-paid','seller-duplicate-paid','customer-created','customer-paid','customer-shipped'));

notify pgrst, 'reload schema';
