// Supabase Edge Function: close-expired-auctions
//
// Reliably closes all auctions whose end_time has passed.
// Intended to be called on a schedule (every 1–5 minutes).
//
// ## Setup
// 1. Deploy:
//      supabase functions deploy close-expired-auctions
//
// 2. Schedule it (pick one):
//
//    A) Supabase Cron (Dashboard → Database → Cron Jobs) — recommended:
//       SELECT cron.schedule(
//         'close-expired-auctions',
//         '*/2 * * * *',   -- every 2 minutes
//         $$
//         SELECT net.http_post(
//           url := 'https://<project-ref>.supabase.co/functions/v1/close-expired-auctions',
//           headers := jsonb_build_object(
//             'Content-Type', 'application/json',
//             'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
//           ),
//           body := '{}'::jsonb
//         );
//         $$
//       );
//
//    B) External cron (cron-job.org, GitHub Actions, etc.) POSTing to the
//       function URL with the service role key in the Authorization header.
//
//    C) The included GitHub Action workflow (see .github/workflows/close-auctions.yml)
//
// The function is idempotent and safe to call frequently.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  // Allow both POST (cron) and GET (manual health / dry-run checks)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Simple shared-secret style protection: require service role key
  // (or a dedicated CRON_SECRET if you prefer).
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token || token !== SERVICE_ROLE_KEY) {
    // Also accept a CRON_SECRET if set (useful for external schedulers)
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret || token !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('close_all_expired_auctions');

  if (error) {
    console.error('close_all_expired_auctions failed:', error);
    return new Response(
      JSON.stringify({ error: error.message, details: error }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log('close-expired-auctions result:', JSON.stringify(data));

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
