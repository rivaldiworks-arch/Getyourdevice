-- Payment fee rates for the admin price calculator (Harga tab). One row, shared by every
-- admin and device, so the Midtrans contract rates are entered once. Admin-only: the
-- storefront and anonymous visitors cannot read it. Additive; apply before deploying the
-- code that reads it (the calculator falls back to the browser until then).
create table if not exists public.payment_fee_settings (
  id smallint primary key default 1,
  rates jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint payment_fee_settings_single_row check (id = 1)
);

alter table public.payment_fee_settings enable row level security;

drop policy if exists admin_read_payment_fee_settings on public.payment_fee_settings;
create policy admin_read_payment_fee_settings on public.payment_fee_settings
  for select to authenticated using (public.is_admin());
drop policy if exists admin_insert_payment_fee_settings on public.payment_fee_settings;
create policy admin_insert_payment_fee_settings on public.payment_fee_settings
  for insert to authenticated with check (public.is_admin());
drop policy if exists admin_update_payment_fee_settings on public.payment_fee_settings;
create policy admin_update_payment_fee_settings on public.payment_fee_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.payment_fee_settings from anon;
grant select, insert, update on public.payment_fee_settings to authenticated;

notify pgrst, 'reload schema';
