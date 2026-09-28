-- Phase 8L: product photo gallery. Additive; safe to re-run.
-- products.images holds the ordered gallery as [{ "url": "...", "shape": "square" | "landscape" }].
-- The admin crops every photo to one of two sizes before upload (square 1200x1200 or
-- landscape 1600x1200) and requires at least 3 photos per saved product. image_url stays
-- the cover (the first photo) so cards, cart, orders and emails keep working unchanged.
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.products drop constraint if exists products_images_check;
alter table public.products add constraint products_images_check
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 8);

notify pgrst, 'reload schema';
