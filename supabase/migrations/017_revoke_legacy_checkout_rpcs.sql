-- Phase 7F: close direct database access to superseded checkout RPCs.
-- Safe to re-run. Reversible with the matching GRANT statements if ever needed.
--
-- The storefront has created orders only through POST /api/orders ->
-- create_storefront_order_v5 (service_role) since Phase 7C. The original checkout RPCs
-- below were still executable by `anon`, whose key is public, so anyone could call
-- /rest/v1/rpc/... directly and create orders while skipping every API protection:
-- rate limiting, server-issued shipping quotes, idempotency and the checkout payment
-- method allow-list. Each call also decrements stock, so it enabled stock draining.
--
-- next_order_number() is only needed inside the order triggers, which run as the
-- function owner; exposing it publicly only let callers burn order numbers.
--
-- Intentionally NOT revoked:
--   create_manual_payment_intent: called by the payment API with the anon key and
--     guarded by the per-order payment capability token.
--   is_admin: evaluated inside RLS policies for anon and authenticated readers.

revoke execute on function public.create_storefront_order(jsonb,jsonb,text,text)
  from public, anon, authenticated;
revoke execute on function public.create_storefront_order_v2(jsonb,jsonb,text,text,text)
  from public, anon, authenticated;
revoke execute on function public.next_order_number()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
