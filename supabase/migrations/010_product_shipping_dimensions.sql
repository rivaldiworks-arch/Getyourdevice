-- Phase 6B: product physical shipping metadata for live courier rates.
-- Nullable by design so existing listings keep working until the admin updates them.

alter table public.products add column if not exists weight_grams integer;
alter table public.products add column if not exists length_cm numeric(10,2);
alter table public.products add column if not exists width_cm numeric(10,2);
alter table public.products add column if not exists height_cm numeric(10,2);

do $$ begin
  if not exists(select 1 from pg_constraint where conname='products_weight_grams_check' and conrelid='public.products'::regclass) then
    alter table public.products add constraint products_weight_grams_check check(weight_grams is null or weight_grams>0) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='products_length_cm_check' and conrelid='public.products'::regclass) then
    alter table public.products add constraint products_length_cm_check check(length_cm is null or length_cm>0) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='products_width_cm_check' and conrelid='public.products'::regclass) then
    alter table public.products add constraint products_width_cm_check check(width_cm is null or width_cm>0) not valid;
  end if;
  if not exists(select 1 from pg_constraint where conname='products_height_cm_check' and conrelid='public.products'::regclass) then
    alter table public.products add constraint products_height_cm_check check(height_cm is null or height_cm>0) not valid;
  end if;
end $$;

notify pgrst, 'reload schema';
