-- Phase 6: provider-neutral shipping quotes and immutable order shipping snapshots.
-- Apply manually in Supabase SQL Editor before merging the Phase 6 application code.

create extension if not exists pgcrypto;

create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'internal',
  service_code text not null,
  service_name text not null,
  shipping_method text not null,
  amount numeric(14,2) not null,
  currency text not null default 'IDR',
  eta_min_days integer,
  eta_max_days integer,
  destination_city text not null,
  destination_postal_code text not null,
  cart_fingerprint text not null,
  provider_reference text,
  expires_at timestamptz not null,
  used_at timestamptz,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint shipping_quotes_amount_check check(amount >= 0),
  constraint shipping_quotes_eta_check check(
    (eta_min_days is null and eta_max_days is null)
    or (eta_min_days >= 0 and eta_max_days >= eta_min_days)
  ),
  constraint shipping_quotes_method_check check(shipping_method in ('regular','express','sameday','pickup'))
);

create index if not exists shipping_quotes_expires_at_idx on public.shipping_quotes(expires_at);
create index if not exists shipping_quotes_order_id_idx on public.shipping_quotes(order_id);

alter table public.orders add column if not exists shipping_provider text;
alter table public.orders add column if not exists shipping_service_code text;
alter table public.orders add column if not exists shipping_service_name text;
alter table public.orders add column if not exists shipping_eta_min_days integer;
alter table public.orders add column if not exists shipping_eta_max_days integer;
alter table public.orders add column if not exists shipping_quote_id uuid references public.shipping_quotes(id) on delete set null;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists tracking_url text;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;

create index if not exists orders_shipping_quote_id_idx on public.orders(shipping_quote_id);
create index if not exists orders_tracking_number_idx on public.orders(tracking_number) where tracking_number is not null;

alter table public.shipping_quotes enable row level security;
revoke all on public.shipping_quotes from anon,authenticated;
grant select,insert,update on public.shipping_quotes to service_role;

-- Checkout v3 consumes a server-created quote. Quote amount and ETA are copied to
-- the order so historical orders never change when future courier pricing changes.
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
