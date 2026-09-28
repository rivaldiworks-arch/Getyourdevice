-- Phase 8I: record every order email attempt. Additive; safe to re-run.
-- The notifier is best-effort and only logged to Vercel runtime logs, which the store
-- owner rarely reads. This table keeps the outcome of each attempt (sent, failed with the
-- Resend error, or skipped because configuration is missing) next to the order, so a
-- missing email can be diagnosed from the database. Server-only: RLS on, no policies.
create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  order_number text,
  kind text not null,
  status text not null,
  recipient text,
  detail text,
  provider_id text,
  constraint email_log_kind_check check (kind in ('seller-created','seller-paid','customer-created','customer-paid')),
  constraint email_log_status_check check (status in ('sent','failed','skipped'))
);

create index if not exists email_log_order_number_idx on public.email_log (order_number, created_at desc);

alter table public.email_log enable row level security;
revoke all on table public.email_log from anon, authenticated;

notify pgrst, 'reload schema';
