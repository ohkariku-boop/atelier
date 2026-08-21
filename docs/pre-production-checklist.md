# Pre-production checklist

## You must run in Supabase SQL Editor

Paste and run: `docs/APPLY_NOW_production_sql.sql`

Installs ensure_artist_profile, admin_refund_order, buy_now_price, purchase_buy_now.

## Stripe
Secrets + webhook + test card E2E. Do not set VITE_ALLOW_DUMMY_PAYMENT in production.

## SIT accounts
Password: SitTest2026!
