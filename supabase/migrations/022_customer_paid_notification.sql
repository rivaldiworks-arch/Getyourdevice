-- Phase 8H: customer emails. Additive; safe to re-run.
-- customer_paid_notified_at is claimed before the "Pembayaran diterima" email is sent to
-- the customer, separately from paid_notified_at (the seller's email), so a retry of one
-- never re-sends the other.
alter table public.orders add column if not exists customer_paid_notified_at timestamptz;

notify pgrst, 'reload schema';
