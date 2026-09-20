-- Phase 7C: duplicate-order protection with checkout idempotency.
-- A high-entropy browser key identifies one logical checkout attempt.
-- Only its SHA-256 digest is stored. Replays return the original order instead of creating another one.

alter table public.orders
  add column if not exists checkout_idempotency_key_hash text;

alter table public.orders
  add column if not exists checkout_idempotency_created_at timestamptz;

create unique index if not exists orders_checkout_idempotency_key_hash_uidx
  on public.orders(checkout_idempotency_key_hash)
  where checkout_idempotency_key_hash is not null;

create or replace function public.create_storefront_order_v5(
  p_customer jsonb,
  p_items jsonb,
  p_shipping_quote_id uuid,
  p_payment_method text,
  p_payment_token text,
  p_order_access_token text,
  p_checkout_idempotency_key text,
  p_cart_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
  v_key_hash text;
  v_existing public.orders%rowtype;
  v_quote public.shipping_quotes%rowtype;
  v_result jsonb;
  v_order_number text;
  v_order_id uuid;
begin
  if coalesce(p_checkout_idempotency_key,'') !~ '^[0-9a-fA-F]{64}$' then
    raise exception using message='INVALID_IDEMPOTENCY_KEY',errcode='P0001';
  end if;
  if coalesce(p_cart_fingerprint,'') !~ '^[0-9a-f]{64}$' then
    raise exception using message='INVALID_CART_FINGERPRINT',errcode='P0001';
  end if;

  v_key_hash:=encode(digest(lower(p_checkout_idempotency_key),'sha256'),'hex');

  -- Serialize concurrent retries that use the same checkout key. A second request
  -- waits for the first transaction and then reuses its committed order.
  perform pg_advisory_xact_lock(hashtextextended(v_key_hash,0));

  select * into v_existing
  from public.orders
  where checkout_idempotency_key_hash=v_key_hash
  for update;

  if found then
    if v_existing.checkout_idempotency_created_at is null
       or v_existing.checkout_idempotency_created_at < now()-interval '24 hours' then
      raise exception using message='IDEMPOTENCY_REPLAY_EXPIRED',errcode='P0001';
    end if;
    return jsonb_build_object(
      'order_number',v_existing.order_number,
      'created_at',v_existing.created_at,
      'subtotal',v_existing.subtotal,
      'shipping_cost',v_existing.shipping_cost,
      'total',v_existing.total,
      'grand_total',v_existing.total,
      'shipping_provider',v_existing.shipping_provider,
      'shipping_service_code',v_existing.shipping_service_code,
      'shipping_service_name',v_existing.shipping_service_name,
      'shipping_eta_min_days',v_existing.shipping_eta_min_days,
      'shipping_eta_max_days',v_existing.shipping_eta_max_days,
      'reused',true
    );
  end if;

  -- For a first attempt, validate the server-issued quote and bind it to the
  -- exact cart before calling the existing authoritative order writer.
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

  if v_quote.cart_fingerprint<>p_cart_fingerprint then
    raise exception using message='SHIPPING_QUOTE_CART_MISMATCH',errcode='P0001';
  end if;

  v_result:=public.create_storefront_order_v4(
    p_customer,
    p_items,
    p_shipping_quote_id,
    p_payment_method,
    p_payment_token,
    p_order_access_token
  );

  v_order_number:=v_result->>'order_number';

  update public.orders
  set checkout_idempotency_key_hash=v_key_hash,
      checkout_idempotency_created_at=now()
  where order_number=v_order_number
  returning id into v_order_id;

  if not found then
    raise exception using message='ORDER_NOT_FOUND',errcode='P0001';
  end if;

  return v_result || jsonb_build_object('reused',false);
end
$$;

revoke all on function public.create_storefront_order_v5(jsonb,jsonb,uuid,text,text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.create_storefront_order_v5(jsonb,jsonb,uuid,text,text,text,text,text)
  to service_role;

notify pgrst, 'reload schema';
