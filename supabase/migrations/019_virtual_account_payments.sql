-- Phase 8A: Midtrans Virtual Account (Transfer Bank) payment instructions.
-- Additive and safe to re-run. Apply BEFORE deploying the Phase 8A code.
--
-- A Transfer Bank attempt is charged through Midtrans Core API as a bank VA
-- (BNI/BRI/Permata/CIMB) or Mandiri Bill Payment. The instructions the customer needs
-- are stored explicitly instead of being dug out of provider_payload, which the
-- webhook overwrites with each status notification.
--   va_bank     which bank issued the instructions
--   va_number   VA number, or the Mandiri bill key
--   biller_code Mandiri company/biller code (null for the other banks)

alter table public.payments add column if not exists va_bank text;
alter table public.payments add column if not exists va_number text;
alter table public.payments add column if not exists biller_code text;

do $$ begin
  if not exists(
    select 1 from pg_constraint
    where conname='payments_va_bank_check' and conrelid='public.payments'::regclass
  ) then
    alter table public.payments add constraint payments_va_bank_check
      check(va_bank is null or va_bank in ('bni','bri','mandiri','permata','cimb'));
  end if;
end $$;

notify pgrst, 'reload schema';
