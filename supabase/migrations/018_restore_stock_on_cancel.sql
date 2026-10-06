-- Phase 7G: return reserved stock when an order is cancelled before it ships.
-- Safe to re-run.
--
-- Checkout decrements products.stock when the order is created. Nothing gave it back
-- on cancellation, so every unpaid QRIS order an admin cancelled kept its units locked
-- forever and products eventually showed as sold out while still on the shelf.
--
-- orders.stock_restored_at makes the restore idempotent: it is set when stock is
-- returned and cleared if the cancellation is reversed (which re-reserves the stock, or
-- fails when there is no longer enough). Orders cancelled after they shipped or
-- completed are not restocked, because the goods have left the warehouse.

alter table public.orders
  add column if not exists stock_restored_at timestamptz;

create or replace function public.sync_order_stock_on_status()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_short record;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Cancelled before shipping: give the reserved units back once.
  if new.status='cancelled'
     and old.status in ('pending','confirmed','processing')
     and new.stock_restored_at is null then
    update public.products p
    set stock=p.stock+i.qty
    from (
      select product_id, sum(quantity)::int as qty
      from public.order_items
      where order_id=new.id and product_id is not null
      group by product_id
    ) i
    where p.id=i.product_id;
    new.stock_restored_at=now();

  -- Cancellation reversed: reserve the units again, or refuse if they were sold meanwhile.
  elsif old.status='cancelled'
     and new.status in ('pending','confirmed','processing')
     and new.stock_restored_at is not null then
    select p.name into v_short
    from public.order_items oi join public.products p on p.id=oi.product_id
    where oi.order_id=new.id
    group by p.id, p.name, p.stock
    having p.stock < sum(oi.quantity)
    limit 1;
    if found then
      raise exception using message='INSUFFICIENT_STOCK', errcode='P0001',
        detail=format('Not enough stock to reopen order %s (%s)', new.order_number, v_short.name);
    end if;
    update public.products p
    set stock=p.stock-i.qty
    from (
      select product_id, sum(quantity)::int as qty
      from public.order_items
      where order_id=new.id and product_id is not null
      group by product_id
    ) i
    where p.id=i.product_id;
    new.stock_restored_at=null;
  end if;

  return new;
end $$;

revoke execute on function public.sync_order_stock_on_status() from public, anon, authenticated;

drop trigger if exists orders_sync_stock on public.orders;
create trigger orders_sync_stock before update of status on public.orders
for each row execute function public.sync_order_stock_on_status();

-- One-time repair: orders already cancelled before this trigger existed and never
-- shipped still hold their stock. Restore them exactly once.
with pending_restore as (
  select o.id from public.orders o
  where o.status='cancelled' and o.stock_restored_at is null and o.shipped_at is null
),
restored as (
  update public.products p
  set stock=p.stock+i.qty
  from (
    select oi.product_id, sum(oi.quantity)::int as qty
    from public.order_items oi join pending_restore r on r.id=oi.order_id
    where oi.product_id is not null
    group by oi.product_id
  ) i
  where p.id=i.product_id
  returning p.id
)
update public.orders o
set stock_restored_at=now()
from pending_restore r
where o.id=r.id;

notify pgrst, 'reload schema';
