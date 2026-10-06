-- Phase 8F: each product states which warranty it carries.
-- Safe to re-run. Additive and nullable, so apply it before deploying the code that reads it.
--   resmi  — official manufacturer warranty in Indonesia
--   tam    — warranty from distributor PT Teletama Artha Mandiri (TAM)
--   blibli — warranty from Blibli
-- NULL means the warranty has not been filled in yet; the storefront then shows nothing
-- rather than guessing.
alter table public.products add column if not exists warranty text;

alter table public.products drop constraint if exists products_warranty_check;
alter table public.products add constraint products_warranty_check
  check (warranty is null or warranty in ('resmi','tam','blibli'));

notify pgrst, 'reload schema';
