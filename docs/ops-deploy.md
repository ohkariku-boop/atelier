# Atelier ops checklist (non-Stripe)

## 1. Supabase Edge Function: close-expired-auctions

```bash
supabase login
supabase link --project-ref ogjxysfnidfclgjedjzs
supabase functions deploy close-expired-auctions
```

Schedule every 2–5 minutes (Dashboard → Database → Cron, or GitHub Action secrets):

- `SUPABASE_FUNCTION_URL` = `https://ogjxysfnidfclgjedjzs.supabase.co/functions/v1/close-expired-auctions`
- `SUPABASE_SERVICE_ROLE_KEY` = service role JWT

## 2. Email (Resend)

```bash
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set RECEIPT_FROM_ADDRESS="Atelier <receipts@yourdomain.com>"
supabase functions deploy send-receipt-email
supabase functions deploy notify-seller-sale
```

## 3. Web Push (optional)

Generate VAPID keys, then:

- GitHub / hosting: `VITE_VAPID_PUBLIC_KEY`
- Later: Edge Function to send pushes using private key + `push_subscriptions` table

## 4. GitHub Pages build secrets

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or publishable key)
