-- Phase 5: provider-neutral payment records and order payment snapshots.
-- Additive, non-destructive, and safe to re-run. Apply manually in Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.orders add column if not exists payment_status text not null default 'unpaid';
alter table public.orders add column if not exists payment_reference text;

-- Existing orders are deliberately unpaid regardless of their fulfilment status or payment method.
update public.orders set payment_status='unpaid' where payment_status is null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='orders_payment_status_check' and conrelid='public.orders'::regclass) then
    alter table public.orders add constraint orders_payment_status_check
      check(payment_status in ('unpaid','pending','paid','failed','expired','refunded')) not valid;
  end if;
end $$;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null default 'manual',
  payment_method text not null,
  status text not null default 'unpaid',
  amount numeric(14,2) not null,
  provider_reference text,
  external_transaction_id text,
  payment_url text,
  qr_string text,
  expires_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_status_check check(status in ('unpaid','pending','paid','failed','expired','refunded')),
  constraint payments_amount_check check(amount >= 0),
  constraint payments_method_check check(payment_method in ('Transfer Bank','COD','QRIS'))
);

create index if not exists payments_order_id_idx on public.payments(order_id);
create index if not exists payments_provider_reference_idx on public.payments(provider_reference) where provider_reference is not null;
create index if not exists payments_external_transaction_id_idx on public.payments(external_transaction_id) where external_transaction_id is not null;
create index if not exists payments_status_idx on public.payments(status);
create index if not exists payments_created_at_idx on public.payments(created_at desc);
create unique index if not exists payments_one_active_per_order_idx on public.payments(order_id) where status in ('unpaid','pending');

create or replace function public.prepare_payment()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_order_total numeric(14,2);
begin
  select total into v_order_total from public.orders where id=new.order_id;
  if not found then raise exception using message='ORDER_NOT_FOUND',errcode='P0001'; end if;
  if new.amount<>v_order_total then raise exception using message='PAYMENT_AMOUNT_MISMATCH',errcode='P0001'; end if;
  if tg_op='UPDATE' and new.status<>old.status and not (
    (old.status='unpaid' and new.status in ('pending','paid','failed','expired')) or
    (old.status='pending' and new.status in ('paid','failed','expired')) or
    (old.status='paid' and new.status='refunded')
  ) then raise exception using message='INVALID_PAYMENT_TRANSITION',errcode='P0001'; end if;
  if tg_op='UPDATE' then
    new.order_id=old.order_id; new.amount=old.amount; new.payment_method=old.payment_method;
    new.updated_at=now();
  end if;
  if new.status='paid' and new.paid_at is null then new.paid_at=now(); end if;
  if new.status='failed' and new.failed_at is null then new.failed_at=now(); end if;
  return new;
end $$;

drop trigger if exists payments_prepare on public.payments;
create trigger payments_prepare before insert or update on public.payments
for each row execute function public.prepare_payment();

create or replace function public.sync_order_payment_snapshot()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  update public.orders set
    payment_status=new.status,
    payment_reference=case when new.status in ('paid','refunded')
      then coalesce(new.external_transaction_id,new.provider_reference,payment_reference) else payment_reference end
  where id=new.order_id;
  return new;
end $$;

drop trigger if exists payments_sync_order on public.payments;
create trigger payments_sync_order after insert or update of status,provider_reference,external_transaction_id on public.payments
for each row execute function public.sync_order_payment_snapshot();

-- The server creates only provider-neutral manual intents. The amount is always copied
-- from the locked order row. COD returns a snapshot and never creates a fake transaction.
create or replace function public.create_manual_payment_intent(p_order_id uuid default null,p_order_number text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_order public.orders%rowtype; v_payment public.payments%rowtype; v_reused boolean:=false;
begin
  if (p_order_id is null)=(p_order_number is null) then raise exception using message='INVALID_ORDER_IDENTIFIER',errcode='P0001'; end if;
  select * into v_order from public.orders
    where (p_order_id is not null and id=p_order_id) or (p_order_number is not null and order_number=p_order_number)
    for update;
  if not found then raise exception using message='ORDER_NOT_FOUND',errcode='P0001'; end if;
  if v_order.status in ('cancelled','completed') then raise exception using message='ORDER_NOT_PAYABLE',errcode='P0001'; end if;
  if v_order.payment_method not in ('Transfer Bank','COD','QRIS') then raise exception using message='INVALID_PAYMENT_METHOD',errcode='P0001'; end if;
  if v_order.payment_method='COD' then
    return jsonb_build_object('payment_method','COD','status','unpaid','provider','manual','reused',true);
  end if;
  select * into v_payment from public.payments where order_id=v_order.id and status in ('unpaid','pending') order by created_at desc limit 1;
  if found then v_reused:=true;
  else
    insert into public.payments(order_id,provider,payment_method,status,amount)
      values(v_order.id,'manual',v_order.payment_method,'unpaid',v_order.total) returning * into v_payment;
  end if;
  return jsonb_build_object('id',v_payment.id,'provider',v_payment.provider,'payment_method',v_payment.payment_method,
    'status',v_payment.status,'provider_reference',v_payment.provider_reference,'payment_url',v_payment.payment_url,
    'qr_string',v_payment.qr_string,'expires_at',v_payment.expires_at,'reused',v_reused);
end $$;
revoke all on function public.create_manual_payment_intent(uuid,text) from public;
grant execute on function public.create_manual_payment_intent(uuid,text) to anon,authenticated;

alter table public.payments enable row level security;
drop policy if exists admin_read_payments on public.payments;
create policy admin_read_payments on public.payments for select to authenticated using(public.is_admin());
revoke all on public.payments from anon;
revoke all on public.payments from authenticated;
grant select on public.payments to authenticated;

-- No direct payment writes are granted. Future verified provider adapters must call a
-- narrowly-scoped SECURITY DEFINER RPC that applies the same transition rules atomically.
