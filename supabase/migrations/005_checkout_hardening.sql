-- Phase 4: safely align legacy checkout constraints and harden canonical writes.
-- Legacy columns and historical values are retained; only obsolete NOT NULL requirements are relaxed.

alter table if exists public.orders add column if not exists order_notes text;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='whatsapp') then
    alter table public.orders alter column whatsapp drop not null;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='unit_price') then
    alter table public.order_items alter column unit_price drop not null;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='order_items' and column_name='total_price') then
    alter table public.order_items alter column total_price drop not null;
  end if;
end $$;

create or replace function public.create_storefront_order_v2(
  p_customer jsonb, p_items jsonb, p_shipping_id text, p_payment_method text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_customer_id uuid; v_order_id uuid; v_order_number text;
  v_subtotal numeric(14,2):=0; v_shipping numeric(14,2); v_total numeric(14,2); v_item jsonb; v_product record;
begin
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception using message='INVALID_ITEMS',errcode='P0001'; end if;
  if length(btrim(coalesce(p_customer->>'full_name','')))<3
    or (p_customer->>'whatsapp') !~ '^[+]?[0-9]{9,15}$'
    or (p_customer->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or length(btrim(coalesce(p_customer->>'address','')))<10
    or length(btrim(coalesce(p_customer->>'city','')))<2
    or (p_customer->>'postal_code') !~ '^[0-9]{5}$'
  then raise exception using message='INVALID_CUSTOMER',errcode='P0001'; end if;
  if p_payment_method not in ('Transfer Bank','COD','QRIS') then raise exception using message='INVALID_PAYMENT',errcode='P0001'; end if;
  v_shipping:=case p_shipping_id when 'regular' then 25000 when 'express' then 50000 when 'sameday' then 85000 when 'pickup' then 0 else null end;
  if v_shipping is null then raise exception using message='INVALID_SHIPPING',errcode='P0001'; end if;

  -- Guest records remain one-per-order: conservative reliability avoids accidentally merging people.
  insert into public.customers(full_name,whatsapp,email,address,city,postal_code)
  values(btrim(p_customer->>'full_name'),btrim(p_customer->>'whatsapp'),lower(btrim(p_customer->>'email')),btrim(p_customer->>'address'),btrim(p_customer->>'city'),btrim(p_customer->>'postal_code')) returning id into v_customer_id;
  insert into public.orders(customer_id,customer_name,customer_email,customer_phone,shipping_address,city,postal_code,status,payment_method,shipping_method,shipping_cost,subtotal,discount,total,order_notes)
  values(v_customer_id,btrim(p_customer->>'full_name'),lower(btrim(p_customer->>'email')),btrim(p_customer->>'whatsapp'),btrim(p_customer->>'address'),btrim(p_customer->>'city'),btrim(p_customer->>'postal_code'),'pending',p_payment_method,p_shipping_id,v_shipping,0,0,0,nullif(btrim(p_customer->>'notes'),''))
  returning id,order_number into v_order_id,v_order_number;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' or coalesce(v_item->>'quantity','') !~ '^[0-9]+$' then raise exception using message='INVALID_QUANTITY',errcode='P0001'; end if;
    if coalesce(v_item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using message='INVALID_PRODUCT',errcode='P0001'; end if;
    select id,name,price,stock into v_product from public.products where id=(v_item->>'product_id')::uuid and is_active=true for update;
    if not found then raise exception using message='INVALID_PRODUCT',errcode='P0001'; end if;
    if (v_item->>'quantity')::integer<1 or (v_item->>'quantity')::integer>99 then raise exception using message='INVALID_QUANTITY',errcode='P0001'; end if;
    if v_product.stock<(v_item->>'quantity')::integer then raise exception using message='INSUFFICIENT_STOCK',errcode='P0001'; end if;
    v_subtotal:=v_subtotal+v_product.price*(v_item->>'quantity')::integer;
    insert into public.order_items(order_id,product_id,product_name,product_price,price,quantity,subtotal)
    values(v_order_id,v_product.id,v_product.name,v_product.price,v_product.price,(v_item->>'quantity')::integer,v_product.price*(v_item->>'quantity')::integer);
    update public.products set stock=stock-(v_item->>'quantity')::integer where id=v_product.id;
  end loop;
  v_total:=v_subtotal+v_shipping;
  update public.orders set subtotal=v_subtotal,total=v_total where id=v_order_id;
  -- Keep an installed legacy compatibility total synchronized without requiring that column on fresh databases.
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='grand_total') then
    execute 'update public.orders set grand_total=$1 where id=$2' using v_total,v_order_id;
  end if;
  return jsonb_build_object('order_number',v_order_number,'created_at',now(),'subtotal',v_subtotal,'shipping_cost',v_shipping,'total',v_total,'grand_total',v_total);
end $$;
revoke all on function public.create_storefront_order_v2(jsonb,jsonb,text,text) from public;
grant execute on function public.create_storefront_order_v2(jsonb,jsonb,text,text) to anon,authenticated;
