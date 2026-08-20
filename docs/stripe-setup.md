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

## 3. Supabase secrets + deploy functions

```bash
npx supabase login
npx supabase link --project-ref ogjxysfnidfclgjedjzs

npx supabase secrets set STRIPE_SECRET_KEY=sk_test_xxxx
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxx
npx supabase secrets set SITE_URL=https://ohkariku-boop.github.io/atelier
npx supabase secrets set PLATFORM_FEE_PERCENT=10

npx supabase functions deploy stripe-create-checkout
npx supabase functions deploy stripe-webhook
npx supabase functions deploy stripe-connect-onboard
```

## 4. App behavior

| Actor | Action |
|-------|--------|
| Buyer | Orders → **Pay with Stripe** → hosted Checkout → webhook marks order `escrow` |
| Artist | Studio Desk → **Connect Stripe** → Express onboarding |
| Fallback | If `STRIPE_SECRET_KEY` missing, Pay uses dummy payment RPC for demos |

## 5. Go live later

Switch to live keys, update webhook to live mode, complete Connect platform profile.
