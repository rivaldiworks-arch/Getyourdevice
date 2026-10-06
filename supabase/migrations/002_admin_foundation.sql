-- Phase 1: additive product schema alignment, admin profiles, and RLS.
-- Safe to re-run. Existing product rows are never deleted or overwritten.

create extension if not exists pgcrypto;

alter table public.products add column if not exists name text;
alter table public.products add column if not exists brand text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists specifications jsonb default '{}'::jsonb;
alter table public.products add column if not exists price numeric(14,2);
alter table public.products add column if not exists original_price numeric(14,2);
alter table public.products add column if not exists stock integer default 0;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists rating numeric(2,1) default 0;
alter table public.products add column if not exists is_active boolean default true;
alter table public.products add column if not exists created_at timestamptz default now();
alter table public.products add column if not exists updated_at timestamptz default now();

update public.products set specifications='{}'::jsonb where specifications is null;
update public.products set stock=0 where stock is null;
update public.products set is_active=true where is_active is null;
update public.products set created_at=now() where created_at is null;
update public.products set updated_at=now() where updated_at is null;

create table if not exists public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  constraint admin_profiles_role_check check (role in ('admin','viewer'))
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.admin_profiles where id=auth.uid() and role='admin') $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.set_products_updated_at()
returns trigger language plpgsql set search_path=public,pg_temp
as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_products_updated_at();

alter table public.products enable row level security;
alter table public.admin_profiles enable row level security;

drop policy if exists storefront_read_active_products on public.products;
drop policy if exists admin_read_all_products on public.products;
drop policy if exists admin_insert_products on public.products;
drop policy if exists admin_update_products on public.products;
drop policy if exists admin_delete_products on public.products;
create policy storefront_read_active_products on public.products for select to anon, authenticated using (is_active=true);
create policy admin_read_all_products on public.products for select to authenticated using (public.is_admin());
create policy admin_insert_products on public.products for insert to authenticated with check (public.is_admin());
create policy admin_update_products on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete_products on public.products for delete to authenticated using (public.is_admin());

drop policy if exists admin_read_own_profile on public.admin_profiles;
create policy admin_read_own_profile on public.admin_profiles for select to authenticated using (id=auth.uid());

-- Orders are intentionally not reshaped. If present, admins receive read-only access.
do $$ declare table_name text; begin
  foreach table_name in array array['orders','order_items'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists admin_read_%I on public.%I', table_name, table_name);
      execute format('create policy admin_read_%I on public.%I for select to authenticated using (public.is_admin())', table_name, table_name);
    end if;
  end loop;
end $$;

grant select on public.admin_profiles to authenticated;
grant select,insert,update,delete on public.products to authenticated;
