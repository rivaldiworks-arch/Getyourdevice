-- Phase 8K: admins record refunds made outside the store (Midtrans dashboard, bank
-- transfer). Additive and safe to re-run. Apply BEFORE deploying the Phase 8K code.
--
-- The money goes back through Midtrans or the bank; this only records that it did, so a
-- paid-but-cancelled order or a double payment no longer has to be tracked from memory.
--
-- 1. payments gains refund_amount/method/reference/note, refunded_at and refunded_by.
-- 2. record_payment_refund() is the only way to write them. Admin-only (is_admin()), it
--    moves one paid attempt to 'refunded'. Allowed when the order is cancelled, or when
--    the order has another paid attempt (a double payment). Refunding an order that is
--    still being fulfilled means cancelling it first.
-- 3. sync_order_payment_snapshot keeps the order 'paid' while any attempt is still paid,
--    so refunding the extra payment of a double-paid order leaves the order paid, and a
--    refund no longer replaces the order's payment reference.

alter table public.payments
  add column if not exists refund_amount numeric(14,2),
  add column if not exists refund_method text,
  add column if not exists refund_reference text,
  add column if not exists refund_note text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid;

alter table public.payments drop constraint if exists payments_refund_method_check;
alter table public.payments add constraint payments_refund_method_check
  check (refund_method is null or refund_method in ('midtrans','bank_transfer','cash','other'));

create or replace function public.record_payment_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text default null,
  p_note text default null
)
returns public.payments language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reference text:=nullif(btrim(coalesce(p_reference,'')),'');
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
  if not public.is_admin() then
    raise exception using message='NOT_ADMIN', errcode='42501';
  end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found then raise exception using message='PAYMENT_NOT_FOUND', errcode='P0001'; end if;
  if v_payment.status<>'paid' then raise exception using message='PAYMENT_NOT_REFUNDABLE', errcode='P0001'; end if;
  select * into v_order from public.orders where id=v_payment.order_id;
  if v_order.status<>'cancelled' and not exists (
    select 1 from public.payments p where p.order_id=v_payment.order_id and p.id<>v_payment.id and p.status='paid'
  ) then
    raise exception using message='REFUND_REQUIRES_CANCELLED_ORDER', errcode='P0001';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>v_payment.amount then
    raise exception using message='INVALID_REFUND_AMOUNT', errcode='P0001';
  end if;
  if p_method is null or p_method not in ('midtrans','bank_transfer','cash','other') then
    raise exception using message='INVALID_REFUND_METHOD', errcode='P0001';
  end if;
  if length(coalesce(v_reference,''))>120 or length(coalesce(v_note,''))>500 then
    raise exception using message='REFUND_DETAILS_TOO_LONG', errcode='P0001';
  end if;

  update public.payments set
    status='refunded',
    refund_amount=round(p_amount,2),
    refund_method=p_method,
    refund_reference=v_reference,
    refund_note=v_note,
    refunded_at=now(),
    refunded_by=auth.uid()
  where id=v_payment.id
  returning * into v_payment;
  return v_payment;
end $$;

revoke all on function public.record_payment_refund(uuid,numeric,text,text,text) from public, anon;
grant execute on function public.record_payment_refund(uuid,numeric,text,text,text) to authenticated;

create or replace function public.sync_order_payment_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  update public.orders set
    payment_status=case
      when new.status<>'paid' and exists (
        select 1 from public.payments p where p.order_id=new.order_id and p.id<>new.id and p.status='paid'
      ) then 'paid'
      when payment_status in ('paid','refunded') and new.status not in ('paid','refunded') then payment_status
      else new.status end,
    status=case when new.status='paid' and status='pending' then 'confirmed' else status end,
    -- A refund keeps the reference of the payment the order was settled with.
    payment_reference=case
      when new.status='paid' then coalesce(new.external_transaction_id,new.provider_reference,payment_reference)
      when new.status='refunded' then coalesce(payment_reference,new.external_transaction_id,new.provider_reference)
      else payment_reference end
  where id=new.order_id;
  return new;
end $$;

notify pgrst, 'reload schema';
