-- Phase 7D: record which Midtrans environment issued each gateway payment.
-- Additive, non-destructive, and safe to re-run. Apply BEFORE deploying the Phase 7D code.
--
-- Sandbox and production are separate Midtrans accounts. A pending sandbox QR can never
-- be paid once the store runs on production keys, so the payment API must recognise and
-- retire such rows instead of showing them to customers.
--
-- Existing rows are intentionally NOT backfilled: an UPDATE would re-run the
-- payments_prepare trigger, which can reject historical rows whose order total was
-- edited later. The API treats a null environment on a Midtrans row as 'sandbox',
-- because every Midtrans row created before this migration came from sandbox.
-- Manual rows (Transfer Bank) are not tied to a gateway and stay null.

alter table public.payments
  add column if not exists provider_environment text;

do $$ begin
  if not exists(
    select 1 from pg_constraint
    where conname='payments_provider_environment_check' and conrelid='public.payments'::regclass
  ) then
    alter table public.payments add constraint payments_provider_environment_check
      check(provider_environment is null or provider_environment in ('sandbox','production'));
  end if;
end $$;

notify pgrst, 'reload schema';
