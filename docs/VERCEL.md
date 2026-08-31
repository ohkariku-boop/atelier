# Deploy Atelier on Vercel

## One-time setup

1. Go to https://vercel.com/new and import `ohkariku-boop/atelier`.
2. **Root Directory:** `project`
3. Framework: Vite (auto). Build: `npm run build`. Output: `dist`.
4. Environment variables (Production + Preview):

   - `VITE_SUPABASE_URL` = `https://ogjxysfnidfclgjedjzs.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your anon/publishable key
   - `VITE_STRIPE_PUBLISHABLE_KEY` = optional
   - `VITE_VAPID_PUBLIC_KEY` = optional

5. Deploy. Vercel sets `VERCEL=1`, so `vite.config.ts` uses `base: '/'`.

## Supabase Auth

Authentication → URL configuration:

- Site URL: `https://<your-project>.vercel.app`
- Redirect URLs: `https://<your-project>.vercel.app/**`

Add your custom domain the same way when you attach one.

## GitHub Pages

Still works via Actions with `VITE_BASE_PATH=/atelier/`. You can disable the Pages workflow if Vercel is primary.
