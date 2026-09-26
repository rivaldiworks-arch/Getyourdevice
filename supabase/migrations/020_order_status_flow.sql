-- Phase 8C: order status follows the order flow instead of free-form admin edits.
-- Safe to re-run. Apply BEFORE deploying the Phase 8C code.
--
-- 1. orders_guard_status rejects status jumps that skip or reverse the flow:
--      pending    -> confirmed | cancelled
--                    (| completed, for COD picked up at the store)
--      confirmed  -> processing | shipped | completed | cancelled
--      processing -> shipped | completed | cancelled
--      shipped    -> completed | cancelled
--      completed, cancelled are final.
--    It applies to every writer: the payment snapshot trigger, the Biteship webhook,
--    admin actions and direct SQL through the API.
-- 2. orders_guard_cod refuses new COD orders that are not "Ambil di Toko". A courier
--    delivery cannot be booked before payment and nothing tells the courier to
--    collect cash, so a COD courier order could never be fulfilled.
-- 3. cancel_expired_unpaid_orders() cancels QRIS / Transfer Bank orders whose 24-hour
--    payment window closed without payment, which returns their reserved stock via
--    orders_sync_stock. pg_cron runs it every 15 minutes.

alter table public.orders add column if not exists auto_cancelled_at timestamptz;

-- 1. Status transitions ---------------------------------------------------------------
create or replace function public.guard_order_status_transition()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_from text:=lower(coalesce(old.status,'pending'));
  v_to text:=lower(coalesce(new.status,'pending'));
begin
  if v_to=v_from then
    return new;
  end if;
  if (v_from='pending' and v_to in ('confirmed','cancelled'))
     or (v_from='pending' and v_to='completed'
         and old.payment_method='COD' and old.shipping_method='pickup')
     or (v_from='confirmed' and v_to in ('processing','shipped','completed','cancelled'))
     or (v_from='processing' and v_to in ('shipped','completed','cancelled'))
     or (v_from='shipped' and v_to in ('completed','cancelled')) then
    return new;
  end if;
  raise exception using message='INVALID_ORDER_STATUS_TRANSITION', errcode='P0001',
    detail=format('Order %s cannot move from %s to %s', old.order_number, v_from, v_to);
end $$;

revoke execute on function public.guard_order_status_transition() from public, anon, authenticated;

-- Named to sort before orders_prepare and orders_sync_stock, so an invalid jump is
-- refused before stock is touched. prepare_order lower-cases status afterwards; the admin UI and
-- API always send lower-case values; the guard compares case-insensitively anyway.
drop trigger if exists orders_guard_status on public.orders;
create trigger orders_guard_status before update of status on public.orders
for each row execute function public.guard_order_status_transition();

-- 2. COD only for store pickup ---------------------------------------------------------
create or replace function public.guard_cod_pickup()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  if new.payment_method='COD' and coalesce(new.shipping_method,'')<>'pickup' then
    raise exception using message='COD_REQUIRES_PICKUP', errcode='P0001';
  end if;
  return new;
end $$;

revoke execute on function public.guard_cod_pickup() from public, anon, authenticated;

drop trigger if exists orders_guard_cod on public.orders;
create trigger orders_guard_cod before insert on public.orders
for each row execute function public.guard_cod_pickup();

-- 3. Auto-cancel unpaid orders ---------------------------------------------------------
-- An order is cancelled only when its payment window closed AND no payment attempt is
-- still payable at Midtrans (a Snap link or VA issued late in the window stays valid
-- for its own 24 hours). Payment rows are left untouched: if money still arrives, the
-- webhook records it and the seller email flags the order for a refund.
create or replace function public.cancel_expired_unpaid_orders()
returns integer language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_count integer;
begin
  with expired as (
    select o.id
    from public.orders o
    where o.status='pending'
      and o.payment_method in ('QRIS','Transfer Bank')
      and coalesce(o.payment_status,'unpaid') not in ('paid','refunded')
      and coalesce(o.payment_access_expires_at, o.created_at+interval '24 hours') < now()
      and not exists (
        select 1 from public.payments p
        where p.order_id=o.id
          and p.status in ('unpaid','pending')
          and p.expires_at > now()
      )
    for update of o skip locked
  )
  update public.orders o
  set status='cancelled', auto_cancelled_at=now()
  from expired
  where o.id=expired.id;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

revoke execute on function public.cancel_expired_unpaid_orders() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

-- cron.schedule with a job name replaces an existing job of that name.
select cron.schedule(
  'cancel-expired-unpaid-orders',
  '*/15 * * * *',
  'select public.cancel_expired_unpaid_orders()'
);

notify pgrst, 'reload schema';
