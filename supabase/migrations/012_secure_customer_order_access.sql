-- Phase 7A: secure guest order history capability.
-- Adds an independent long-lived order access token. Payment capability remains separate and short-lived.

alter table public.orders add column if not exists order_access_token_hash text;
alter table public.orders add column if not exists order_access_expires_at timestamptz;

create index if not exists orders_order_access_expires_at_idx
  on public.orders(order_access_expires_at)
  where order_access_token_hash is not null;

create or replace function public.create_storefront_order_v4(
  p_customer jsonb,
  p_items jsonb,
  p_shipping_quote_id uuid,
  p_payment_method text,
  p_payment_token text,
  p_order_access_token text
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_result jsonb;
  v_order_number text;
begin
  if coalesce(length(p_order_access_token),0) < 64 then
    raise exception using message='ORDER_ACCESS_TOKEN_INVALID',errcode='P0001';
  end if;

  v_result:=public.create_storefront_order_v3(
    p_customer,
    p_items,
    p_shipping_quote_id,
    p_payment_method,
    p_payment_token
  );

  v_order_number:=v_result->>'order_number';

  update public.orders
  set order_access_token_hash=encode(digest(p_order_access_token,'sha256'),'hex'),
      order_access_expires_at=now()+interval '365 days'
  where order_number=v_order_number;

  if not found then
    raise exception using message='ORDER_NOT_FOUND',errcode='P0001';
  end if;

  return v_result;
end $$;

revoke all on function public.create_storefront_order_v4(jsonb,jsonb,uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.create_storefront_order_v4(jsonb,jsonb,uuid,text,text,text)
  to service_role;

notify pgrst, 'reload schema';
