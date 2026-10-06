-- Phase 3: additive order-management schema, numbering, timestamps, and admin RLS.
-- Existing orders/items are retained. Safe to re-run where PostgreSQL permits.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid,
  order_number text,
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_address text,
  city text,
  postal_code text,
  shipping_method text,
  payment_method text,
  subtotal numeric(14,2) not null default 0,
  shipping_cost numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists order_number text;
alter table public.orders add column if not exists customer_id uuid;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists shipping_address text;
alter table public.orders add column if not exists city text;
alter table public.orders add column if not exists postal_code text;
alter table public.orders add column if not exists shipping_method text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists subtotal numeric(14,2) default 0;
alter table public.orders add column if not exists shipping_cost numeric(14,2) default 0;
alter table public.orders add column if not exists discount numeric(14,2) default 0;
alter table public.orders add column if not exists total numeric(14,2) default 0;
alter table public.orders add column if not exists status text default 'pending';
alter table public.orders add column if not exists created_at timestamptz default now();
alter table public.orders add column if not exists updated_at timestamptz default now();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_price numeric(14,2) not null default 0,
  price numeric(14,2) not null default 0,
  quantity integer not null,
  subtotal numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.order_items add column if not exists product_name text;
alter table public.order_items add column if not exists product_price numeric(14,2) default 0;
alter table public.order_items add column if not exists price numeric(14,2) default 0;
alter table public.order_items add column if not exists quantity integer;
alter table public.order_items add column if not exists subtotal numeric(14,2) default 0;
alter table public.order_items add column if not exists created_at timestamptz default now();

-- Preserve compatibility with the original checkout schema, which called this snapshot `price`.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='price') then
    execute 'update public.order_items set product_price=price where product_price is null or product_price=0';
  end if;
end $$;

-- Copy customer snapshots from the existing normalized customer record when available.
do $$ begin
  if to_regclass('public.customers') is not null
     and exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='customer_id') then
    execute $sql$
      update public.orders o set
        customer_name=coalesce(o.customer_name,c.full_name),
        customer_email=coalesce(o.customer_email,c.email),
        customer_phone=coalesce(o.customer_phone,c.whatsapp),
        shipping_address=coalesce(o.shipping_address,c.address),
        city=coalesce(o.city,c.city),
        postal_code=coalesce(o.postal_code,c.postal_code)
      from public.customers c where o.customer_id=c.id
    $sql$;
  end if;
end $$;

update public.orders set status=lower(status) where lower(status) in ('pending','confirmed','processing','shipped','completed','cancelled');
update public.orders set discount=0 where discount is null;
update public.orders set created_at=now() where created_at is null;
update public.orders set updated_at=coalesce(created_at,now()) where updated_at is null;

create table if not exists public.order_number_counters (
  order_date date primary key,
  last_value integer not null check (last_value > 0)
);

create or replace function public.next_order_number()
returns text language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_date date := (clock_timestamp() at time zone 'Asia/Jakarta')::date; v_value integer;
begin
  insert into public.order_number_counters(order_date,last_value) values(v_date,1)
  on conflict(order_date) do update set last_value=public.order_number_counters.last_value+1
  returning last_value into v_value;
  return 'GYD-' || to_char(v_date,'YYYYMMDD') || '-' || lpad(v_value::text,4,'0');
end $$;
revoke all on function public.next_order_number() from public;

create or replace function public.prepare_order()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  if nullif(btrim(new.order_number),'') is null then new.order_number=public.next_order_number(); end if;
  new.status=lower(coalesce(new.status,'pending'));
  if tg_op='UPDATE' then new.updated_at=now(); else new.updated_at=coalesce(new.updated_at,now()); end if;
  return new;
end $$;
drop trigger if exists orders_prepare on public.orders;
create trigger orders_prepare before insert or update on public.orders for each row execute function public.prepare_order();

-- Assign server-generated numbers to historical rows that did not have one.
update public.orders set order_number=public.next_order_number() where nullif(btrim(order_number),'') is null;

-- NOT VALID keeps unexpected legacy statuses intact while enforcing the vocabulary on new changes.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending','confirmed','processing','shipped','completed','cancelled')) not valid;
alter table public.order_items drop constraint if exists order_items_quantity_check;
alter table public.order_items add constraint order_items_quantity_check check (quantity > 0) not valid;
create unique index if not exists orders_order_number_unique on public.orders(order_number) where order_number is not null;
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_number_counters enable row level security;
drop policy if exists admin_read_orders on public.orders;
drop policy if exists admin_update_orders on public.orders;
drop policy if exists admin_read_order_items on public.order_items;
create policy admin_read_orders on public.orders for select to authenticated using (public.is_admin());
create policy admin_update_orders on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_read_order_items on public.order_items for select to authenticated using (public.is_admin());

revoke all on public.orders, public.order_items, public.order_number_counters from anon;
revoke all on public.order_number_counters from authenticated;
grant select,update on public.orders to authenticated;
grant select on public.order_items to authenticated;

-- Keep checkout server/database-side while writing the new customer snapshots and status format.
create or replace function public.create_storefront_order_v2(
  p_customer jsonb, p_items jsonb, p_shipping_id text, p_payment_method text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_customer_id uuid; v_order_id uuid; v_order_number text;
  v_subtotal numeric(14,2):=0; v_shipping numeric(14,2); v_item jsonb; v_product record;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'invalid items'; end if;
  if nullif(btrim(p_customer->>'full_name'),'') is null or nullif(btrim(p_customer->>'whatsapp'),'') is null
    or nullif(btrim(p_customer->>'email'),'') is null or nullif(btrim(p_customer->>'address'),'') is null
    or nullif(btrim(p_customer->>'city'),'') is null or nullif(btrim(p_customer->>'postal_code'),'') is null
  then raise exception using message='INVALID_CUSTOMER',errcode='P0001'; end if;
  v_shipping:=case p_shipping_id when 'regular' then 25000 when 'express' then 50000 when 'sameday' then 85000 when 'pickup' then 0 else null end;
  if v_shipping is null then raise exception 'invalid shipping'; end if;
  insert into public.customers(full_name,whatsapp,email,address,city,postal_code)
  values(btrim(p_customer->>'full_name'),btrim(p_customer->>'whatsapp'),lower(btrim(p_customer->>'email')),btrim(p_customer->>'address'),btrim(p_customer->>'city'),btrim(p_customer->>'postal_code')) returning id into v_customer_id;
  insert into public.orders(customer_id,customer_name,customer_email,customer_phone,shipping_address,city,postal_code,status,payment_method,shipping_method,shipping_cost,subtotal,discount,total)
  values(v_customer_id,btrim(p_customer->>'full_name'),lower(btrim(p_customer->>'email')),btrim(p_customer->>'whatsapp'),btrim(p_customer->>'address'),btrim(p_customer->>'city'),btrim(p_customer->>'postal_code'),'pending',p_payment_method,p_shipping_id,v_shipping,0,0,0)
  returning id,order_number into v_order_id,v_order_number;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select id,name,price,stock into v_product from public.products where id=(v_item->>'product_id')::uuid and is_active=true for update;
    if not found then raise exception using message='INVALID_PRODUCT',errcode='P0001'; end if;
    if (v_item->>'quantity')::integer<1 then raise exception using message='INVALID_QUANTITY',errcode='P0001'; end if;
    if v_product.stock<(v_item->>'quantity')::integer then raise exception using message='INSUFFICIENT_STOCK',errcode='P0001'; end if;
    v_subtotal:=v_subtotal+v_product.price*(v_item->>'quantity')::integer;
    insert into public.order_items(order_id,product_id,product_name,product_price,price,quantity,subtotal)
    values(v_order_id,v_product.id,v_product.name,v_product.price,v_product.price,(v_item->>'quantity')::integer,v_product.price*(v_item->>'quantity')::integer);
    update public.products set stock=stock-(v_item->>'quantity')::integer where id=v_product.id;
  end loop;
  update public.orders set subtotal=v_subtotal,total=v_subtotal+v_shipping where id=v_order_id;
  return jsonb_build_object('order_number',v_order_number,'created_at',now(),'subtotal',v_subtotal,'shipping_cost',v_shipping,'grand_total',v_subtotal+v_shipping);
end $$;
revoke all on function public.create_storefront_order_v2(jsonb,jsonb,text,text) from public;
grant execute on function public.create_storefront_order_v2(jsonb,jsonb,text,text) to anon,authenticated;
