-- Phase 5 hotfix: repair RPC compatibility for databases that applied an earlier
-- draft of migration 006 before capability-token security was added.
-- Safe to run after 006. No data is deleted.

create extension if not exists pgcrypto;

alter table public.orders add column if not exists payment_access_token_hash text;
alter table public.orders add column if not exists payment_access_expires_at timestamptz;

create unique index if not exists payments_provider_reference_uidx
  on public.payments(provider,provider_reference)
  where provider_reference is not null;

create unique index if not exists payments_external_transaction_id_uidx
  on public.payments(provider,external_transaction_id)
  where external_transaction_id is not null;

-- New checkout RPC overload. The existing 4-argument implementation remains the
-- canonical order writer; this wrapper atomically attaches a guest payment capability.
create or replace function public.create_storefront_order_v2(
  p_customer jsonb,
  p_items jsonb,
  p_shipping_id text,
  p_payment_method text,
  p_payment_token text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_result jsonb;
  v_order_number text;
begin
  if p_payment_token is null or length(p_payment_token)<32 then
    raise exception using message='INVALID_PAYMENT_TOKEN',errcode='P0001';
  end if;

  v_result:=public.create_storefront_order_v2(
    p_customer,p_items,p_shipping_id,p_payment_method
  );
  v_order_number:=v_result->>'order_number';

  update public.orders
  set payment_access_token_hash=encode(digest(p_payment_token,'sha256'),'hex'),
      payment_access_expires_at=now()+interval '24 hours'
  where order_number=v_order_number;

  if not found then
    raise exception using message='ORDER_NOT_FOUND',errcode='P0001';
  end if;

  return v_result;
end $$;

revoke all on function public.create_storefront_order_v2(jsonb,jsonb,text,text,text) from public;
grant execute on function public.create_storefront_order_v2(jsonb,jsonb,text,text,text) to anon,authenticated;

-- Stale clients must not create tokenless orders after Phase 5.
revoke execute on function public.create_storefront_order_v2(jsonb,jsonb,text,text) from anon,authenticated;

-- Remove the earlier insecure payment-intent RPC if it exists.
revoke all on function public.create_manual_payment_intent(uuid,text) from public,anon,authenticated;
drop function if exists public.create_manual_payment_intent(uuid,text);

-- Secure payment-intent RPC. Order number/UUID alone is insufficient: caller must
-- present the high-entropy token issued only in the successful checkout response.
create or replace function public.create_manual_payment_intent(
  p_order_id uuid default null,
  p_order_number text default null,
  p_payment_token text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_reused boolean:=false;
  v_token_hash text;
begin
  if (p_order_id is null)=(p_order_number is null) then
    raise exception using message='INVALID_ORDER_IDENTIFIER',errcode='P0001';
  end if;

  select * into v_order
  from public.orders
  where (p_order_id is not null and id=p_order_id)
     or (p_order_number is not null and order_number=p_order_number)
  for update;

  if not found then
    raise exception using message='ORDER_NOT_FOUND',errcode='P0001';
  end if;

  if p_payment_token is null or length(p_payment_token)<32
    or v_order.payment_access_token_hash is null
    or v_order.payment_access_expires_at is null
    or v_order.payment_access_expires_at<=now() then
    raise exception using message='PAYMENT_ACCESS_DENIED',errcode='P0001';
  end if;

  v_token_hash:=encode(digest(p_payment_token,'sha256'),'hex');
  if v_token_hash<>v_order.payment_access_token_hash then
    raise exception using message='PAYMENT_ACCESS_DENIED',errcode='P0001';
  end if;

  if v_order.status in ('cancelled','completed')
    or v_order.payment_status in ('paid','refunded') then
    raise exception using message='ORDER_NOT_PAYABLE',errcode='P0001';
  end if;

  if v_order.payment_method not in ('Transfer Bank','COD','QRIS') then
    raise exception using message='INVALID_PAYMENT_METHOD',errcode='P0001';
  end if;

  if v_order.payment_method='COD' then
    return jsonb_build_object(
      'payment_method','COD',
      'status','unpaid',
      'provider','manual',
      'reused',true
    );
  end if;

  select * into v_payment
  from public.payments
  where order_id=v_order.id
    and status in ('unpaid','pending')
  order by created_at desc
  limit 1;

  if found then
    v_reused:=true;
  else
    insert into public.payments(order_id,provider,payment_method,status,amount)
    values(v_order.id,'manual',v_order.payment_method,'unpaid',v_order.total)
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'id',v_payment.id,
    'provider',v_payment.provider,
    'payment_method',v_payment.payment_method,
    'status',v_payment.status,
    'provider_reference',v_payment.provider_reference,
    'payment_url',v_payment.payment_url,
    'qr_string',v_payment.qr_string,
    'expires_at',v_payment.expires_at,
    'reused',v_reused
  );
end $$;

revoke all on function public.create_manual_payment_intent(uuid,text,text) from public;
grant execute on function public.create_manual_payment_intent(uuid,text,text) to anon,authenticated;

notify pgrst, 'reload schema';
