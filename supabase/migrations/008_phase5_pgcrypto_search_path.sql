-- Phase 5 hotfix: Supabase installs pgcrypto functions in the "extensions" schema.
-- The secure Phase 5 RPCs intentionally set a restricted search_path, but the first
-- version omitted "extensions", so digest(...) could not be resolved at runtime.
-- This changes only the function search_path; no data is modified.

alter function public.create_storefront_order_v2(jsonb,jsonb,text,text,text)
  set search_path = public, extensions, pg_temp;

alter function public.create_manual_payment_intent(uuid,text,text)
  set search_path = public, extensions, pg_temp;

notify pgrst, 'reload schema';
