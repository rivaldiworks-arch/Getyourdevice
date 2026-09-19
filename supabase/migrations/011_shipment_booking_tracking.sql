-- Phase 6C: shipment booking, AWB/tracking, webhook status sync, and immutable parcel snapshots.

alter table public.order_items add column if not exists weight_grams integer;
alter table public.order_items add column if not exists length_cm numeric(10,2);
alter table public.order_items add column if not exists width_cm numeric(10,2);
alter table public.order_items add column if not exists height_cm numeric(10,2);

alter table public.orders add column if not exists shipping_order_id text;
alter table public.orders add column if not exists shipping_tracking_id text;
alter table public.orders add column if not exists shipping_status text;
alter table public.orders add column if not exists shipping_environment text;
alter table public.orders add column if not exists shipping_booked_at timestamptz;
alter table public.orders add column if not exists shipping_last_event_at timestamptz;
alter table public.orders add column if not exists shipping_cost_actual numeric(14,2);

create unique index if not exists orders_shipping_order_id_unique
  on public.orders(shipping_order_id) where shipping_order_id is not null;
create index if not exists orders_shipping_tracking_id_idx
  on public.orders(shipping_tracking_id) where shipping_tracking_id is not null;
create index if not exists orders_shipping_status_idx
  on public.orders(shipping_status) where shipping_status is not null;

create or replace function public.create_storefront_order_v3(
  p_customer jsonb,
  p_items jsonb,
  p_shipping_quote_id uuid,
  p_payment_method text,
  p_payment_token text
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_quote public.shipping_quotes%rowtype;
  v_result jsonb;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(14,2);
  v_total numeric(14,2);
begin
  select * into v_quote
  from public.shipping_quotes
  where id=p_shipping_quote_id
    and expires_at>now()
    and used_at is null
  for update;

  if not found then
    raise exception using message='SHIPPING_QUOTE_EXPIRED',errcode='P0001';
  end if;

  if lower(btrim(v_quote.destination_city))<>lower(btrim(coalesce(p_customer->>'city','')))
    or v_quote.destination_postal_code<>btrim(coalesce(p_customer->>'postal_code','')) then
    raise exception using message='SHIPPING_QUOTE_MISMATCH',errcode='P0001';
  end if;

  v_result:=public.create_storefront_order_v2(
    p_customer,
    p_items,
    v_quote.shipping_method,
    p_payment_method,
    p_payment_token
  );

  v_order_number:=v_result->>'order_number';

  update public.orders
  set shipping_method=v_quote.shipping_method,
      shipping_cost=v_quote.amount,
      total=subtotal+v_quote.amount,
      shipping_provider=v_quote.provider,
      shipping_service_code=v_quote.service_code,
      shipping_service_name=v_quote.service_name,
      shipping_eta_min_days=v_quote.eta_min_days,
      shipping_eta_max_days=v_quote.eta_max_days,
      shipping_quote_id=v_quote.id
  where order_number=v_order_number
  returning id,subtotal,total into v_order_id,v_subtotal,v_total;

  if not found then
    raise exception using message='ORDER_NOT_FOUND',errcode='P0001';
  end if;

  update public.order_items oi
  set weight_grams=p.weight_grams,
      length_cm=p.length_cm,
      width_cm=p.width_cm,
      height_cm=p.height_cm
  from public.products p
  where oi.order_id=v_order_id and oi.product_id=p.id;

  if v_quote.provider='biteship' and exists(
    select 1 from public.order_items
    where order_id=v_order_id
      and (weight_grams is null or length_cm is null or width_cm is null or height_cm is null)
  ) then
    raise exception using message='SHIPPING_ITEM_SNAPSHOT_MISSING',errcode='P0001';
  end if;

  update public.shipping_quotes
  set used_at=now(),order_id=v_order_id
  where id=v_quote.id;

  return jsonb_build_object(
    'order_number',v_order_number,
    'created_at',coalesce(v_result->>'created_at',now()::text),
    'subtotal',v_subtotal,
    'shipping_cost',v_quote.amount,
    'total',v_total,
    'grand_total',v_total,
    'shipping_provider',v_quote.provider,
    'shipping_service_code',v_quote.service_code,
    'shipping_service_name',v_quote.service_name,
    'shipping_eta_min_days',v_quote.eta_min_days,
    'shipping_eta_max_days',v_quote.eta_max_days
  );
end $$;

revoke all on function public.create_storefront_order_v3(jsonb,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_storefront_order_v3(jsonb,jsonb,uuid,text,text) to service_role;

notify pgrst, 'reload schema';
