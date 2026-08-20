# Stripe Connect + Checkout setup (Atelier)

Code is ready. You only need to add Stripe account credentials.

## 1. Stripe Dashboard

1. Create/open account at https://dashboard.stripe.com
2. Use **Test mode** first
3. **Developers → API keys**
   - Secret key: `sk_test_...`
   - Publishable key: `pk_test_...` (optional for hosted Checkout)
4. **Settings → Connect** → enable Connect; Express accounts recommended
5. **Developers → Webhooks → Add endpoint**
   - URL: `https://ogjxysfnidfclgjedjzs.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `account.updated`
   - Copy **Webhook signing secret** `whsec_...`

## 2. SQL (Supabase SQL Editor)

Run the SQL in `project/supabase/migrations/20260820010000_stripe_connect_fields.sql`.

## 3. Secrets (Supabase Dashboard — no CLI)

**Project Settings → Edge Functions → Secrets** (or Project Settings → Secrets):

| Name | Value |
|------|--------|
| `STRIPE_SECRET_KEY` | `sk_test_...` from Stripe |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe webhook |
| `SITE_URL` | `https://ohkariku-boop.github.io/atelier` |
| `PLATFORM_FEE_PERCENT` | `10` (optional) |

## 3b. Deploy functions via GitHub Action (no local CLI)

1. Create a Supabase access token:  
   https://supabase.com/dashboard/account/tokens  
2. GitHub repo → **Settings → Secrets and variables → Actions**:
   - `SUPABASE_ACCESS_TOKEN` = that token  
   - `SUPABASE_PROJECT_REF` = `ogjxysfnidfclgjedjzs` (optional if default used)
3. **Actions → Deploy Supabase Edge Functions → Run workflow**

Or push a change under `project/supabase/functions/` on `main` (auto-runs).

Webhook function is deployed with `--no-verify-jwt` so Stripe can POST without a user JWT.

## 4. App behavior

| Actor | Action |
|-------|--------|
| Buyer | Orders → **Pay with Stripe** → hosted Checkout → webhook marks order `escrow` |
| Artist | Studio Desk → **Connect Stripe** → Express onboarding |
| Fallback | If `STRIPE_SECRET_KEY` missing, Pay uses dummy payment RPC for demos |

## 5. Go live later

Switch to live keys, update webhook to live mode, complete Connect platform profile.
