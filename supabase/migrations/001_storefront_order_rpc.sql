-- Run once in the Supabase SQL editor after confirming the existing column names.
-- The function is the only anonymous order-write surface; table RLS remains enabled.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='storefront_read_active_products') then
    create policy storefront_read_active_products on public.products for select to anon using (is_active = true);
  end if;
end $$;

create or replace function public.create_storefront_order(
  p_customer jsonb, p_items jsonb, p_shipping_id text, p_payment_method text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid; v_order_id uuid; v_order_number text;
  v_subtotal numeric(14,2) := 0; v_shipping numeric(14,2); v_item jsonb; v_product record;
begin
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'invalid items'; end if;
  v_shipping := case p_shipping_id when 'regular' then 25000 when 'express' then 50000 when 'sameday' then 85000 when 'pickup' then 0 else null end;
  if v_shipping is null then raise exception 'invalid shipping'; end if;
  insert into customers (name,email,phone,address,city,postal_code,notes)
  values (p_customer->>'name',lower(p_customer->>'email'),p_customer->>'phone',p_customer->>'address',p_customer->>'city',p_customer->>'postal_code',p_customer->>'notes') returning id into v_customer_id;
  v_order_number := 'GYD-' || to_char(clock_timestamp(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into orders (customer_id,order_number,status,payment_method,shipping_method,shipping_cost,subtotal,grand_total)
  values (v_customer_id,v_order_number,'Pending',p_payment_method,p_shipping_id,v_shipping,0,0) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select id,name,price,stock into v_product from products where id=(v_item->>'product_id')::uuid and is_active=true for update;
    if not found or (v_item->>'quantity')::integer < 1 or v_product.stock < (v_item->>'quantity')::integer then raise exception 'invalid product or stock'; end if;
    v_subtotal := v_subtotal + v_product.price * (v_item->>'quantity')::integer;
    insert into order_items (order_id,product_id,product_name,quantity,unit_price,subtotal)
    values (v_order_id,v_product.id,v_product.name,(v_item->>'quantity')::integer,v_product.price,v_product.price*(v_item->>'quantity')::integer);
    update products set stock=stock-(v_item->>'quantity')::integer where id=v_product.id;
  end loop;
  update orders set subtotal=v_subtotal,grand_total=v_subtotal+v_shipping where id=v_order_id;
  return jsonb_build_object('order_number',v_order_number,'created_at',now(),'subtotal',v_subtotal,'shipping_cost',v_shipping,'grand_total',v_subtotal+v_shipping);
end $$;
revoke all on function public.create_storefront_order(jsonb,jsonb,text,text) from public;
grant execute on function public.create_storefront_order(jsonb,jsonb,text,text) to anon, authenticated;
