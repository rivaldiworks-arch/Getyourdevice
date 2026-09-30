-- Customer "Pesanan dikirim" email. Additive; safe to re-run.
-- customer_shipped_notified_at is claimed before the email is sent, so repeated Biteship
-- webhook events (picked, then dropping_off) send it once.
alter table public.orders add column if not exists customer_shipped_notified_at timestamptz;

alter table public.email_log drop constraint if exists email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('seller-created','seller-paid','customer-created','customer-paid','customer-shipped'));

notify pgrst, 'reload schema';
