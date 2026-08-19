# Atelier ops deploy checklist

Project ref: `ogjxysfnidfclgjedjzs`  
API URL: `https://ogjxysfnidfclgjedjzs.supabase.co`  
Site: https://ohkariku-boop.github.io/atelier/

---

## A. GitHub repository secrets (required for Pages + cron)

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|-------------|--------|
| `VITE_SUPABASE_URL` | `https://ogjxysfnidfclgjedjzs.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your **anon** / publishable key (Dashboard → Settings → API) |
| `SUPABASE_URL` | `https://ogjxysfnidfclgjedjzs.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your **service_role** JWT (keep private) |

Optional (only if you use the Edge Function URL path instead of RPC):

| `SUPABASE_FUNCTION_URL` | `https://ogjxysfnidfclgjedjzs.supabase.co/functions/v1/close-expired-auctions` |

After saving secrets, run **Actions → Deploy to GitHub Pages → Run workflow**.

---

## B. Auction closer (works without Edge Function)

GitHub Action **Close Expired Auctions** calls:

`POST /rest/v1/rpc/close_all_expired_auctions`

every 5 minutes once `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set.

Manual test from terminal:

```bash
curl -X POST \
  "https://ogjxysfnidfclgjedjzs.supabase.co/rest/v1/rpc/close_all_expired_auctions" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## C. Deploy Edge Function (optional, recommended later)

On your machine with [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
# Login once
npx supabase login

cd project   # or repo root that contains supabase/
npx supabase link --project-ref ogjxysfnidfclgjedjzs

npx supabase functions deploy close-expired-auctions
npx supabase functions deploy send-receipt-email
npx supabase functions deploy notify-seller-sale
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase for Edge Functions.

---

## D. Resend (transactional email)

1. Create account at https://resend.com  
2. Verify a sending domain (or use resend.dev for tests)  
3. Create an API key  

```bash
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx
npx supabase secrets set RECEIPT_FROM_ADDRESS="Atelier <receipts@yourdomain.com>"

npx supabase functions deploy send-receipt-email
npx supabase functions deploy notify-seller-sale
```

Wire DB webhooks or app calls to invoke these functions with `{ "order_id": "..." }` when payment completes (Stripe path).

---

## E. Web Push (optional)

1. Generate VAPID keys (e.g. `npx web-push generate-vapid-keys`)  
2. Add **public** key as GitHub secret / Pages env: `VITE_VAPID_PUBLIC_KEY`  
3. Store private key only as a Supabase secret for a future `send-push` function  
4. Users click **Enable push** in the app header  

---

## F. Quick health checks

| Check | How |
|-------|-----|
| Site loads | https://ohkariku-boop.github.io/atelier/ |
| RPC closer | curl above → JSON with `closed`, `sold`, … |
| Pages build | Actions → Deploy to GitHub Pages → green |
| Cron closer | Actions → Close Expired Auctions → green, not “skipping” |
| Email function | `POST .../functions/v1/send-receipt-email` with body `{ "order_id": "..." }` |
