-- "Baru" showcase on the storefront home: the owner ticks up to three products in the
-- admin panel. Additive with a default, so apply it before deploying the code that reads it.
alter table public.products add column if not exists is_new boolean not null default false;

notify pgrst, 'reload schema';
