// Notify bidders when lots are ending soon (in-app + optional Web Push).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional Web Push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:)
//
// Windows: ~60m and ~15m before end_time. Deduped via auction_ending_alerts.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || Deno.env.get('VITE_VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:ops@atelier.app';
const SITE_URL = Deno.env.get('SITE_URL') || 'https://ohkariku-boop.github.io/atelier';
const CRON_SECRET = Deno.env.get('CRON_SECRET'); // optional shared secret

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

type WindowDef = { label: string; minMs: number; maxMs: number };

const WINDOWS: WindowDef[] = [
  { label: '1h', minMs: 45 * 60 * 1000, maxMs: 75 * 60 * 1000 },
  { label: '15m', minMs: 10 * 60 * 1000, maxMs: 20 * 60 * 1000 },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Allow service role or optional cron secret
  const auth = req.headers.get('Authorization') || '';
  const cronHeader = req.headers.get('x-cron-secret') || '';
  const bearer = auth.replace(/^Bearer\s+/i, '');
  let allowed = false;
  if (CRON_SECRET && cronHeader === CRON_SECRET) allowed = true;
  if (bearer === SERVICE_ROLE_KEY) allowed = true;
  if (bearer) {
    try {
      const payload = JSON.parse(atob(bearer.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'service_role') allowed = true;
    } catch {
      /* ignore */
    }
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = Date.now();

  const pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  if (pushEnabled) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  }

  const summary = {
    windows: [] as Array<Record<string, unknown>>,
    in_app: 0,
    push_sent: 0,
    push_failed: 0,
    push_enabled: pushEnabled,
    ran_at: new Date().toISOString(),
  };

  for (const win of WINDOWS) {
    const from = new Date(now + win.minMs).toISOString();
    const to = new Date(now + win.maxMs).toISOString();

    const { data: auctions, error } = await admin
      .from('auctions')
      .select('id, end_time, status, is_flash, artwork:artworks(id, title)')
      .in('status', ['live', 'flash'])
      .gte('end_time', from)
      .lte('end_time', to);

    if (error) {
      summary.windows.push({ label: win.label, error: error.message });
      continue;
    }

    const list = auctions || [];
    let notifiedUsers = 0;

    for (const a of list) {
      const title = (a.artwork as { title?: string } | null)?.title || 'A lot';
      const artworkId = (a.artwork as { id?: string } | null)?.id;

      // Distinct bidders on this auction
      const { data: bids } = await admin
        .from('bids')
        .select('user_id')
        .eq('auction_id', a.id)
        .not('user_id', 'is', null);

      const userIds = [...new Set((bids || []).map((b: { user_id: string }) => b.user_id).filter(Boolean))];
      if (userIds.length === 0) continue;

      for (const userId of userIds) {
        // Dedup
        const { error: dedupErr } = await admin.from('auction_ending_alerts').insert({
          auction_id: a.id,
          user_id: userId,
          window_label: win.label,
        });
        if (dedupErr) {
          // unique violation — already alerted
          continue;
        }

        const when =
          win.label === '15m' ? 'about 15 minutes' : 'about an hour';
        const flash = a.is_flash || a.status === 'flash' ? 'Flash sale' : 'Auction';
        const body = `${flash}: "${title}" ends in ${when}. Place your final bid.`;
        const url = `${SITE_URL}/#auction/${a.id}`;

        await admin.from('notifications').insert({
          user_id: userId,
          type: 'auction_ending',
          title: win.label === '15m' ? 'Ending very soon' : 'Ending soon',
          body,
          artwork_id: artworkId || null,
          auction_id: a.id,
        });
        summary.in_app++;
        notifiedUsers++;

        if (pushEnabled) {
          const { data: subs } = await admin
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', userId);

          for (const sub of subs || []) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                JSON.stringify({
                  title: win.label === '15m' ? 'Atelier · Ending very soon' : 'Atelier · Ending soon',
                  body,
                  url,
                })
              );
              summary.push_sent++;
            } catch (e) {
              summary.push_failed++;
              console.error('push fail', e);
              // Drop gone subscriptions
              const statusCode = (e as { statusCode?: number })?.statusCode;
              if (statusCode === 404 || statusCode === 410) {
                await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
              }
            }
          }
        }
      }
    }

    summary.windows.push({
      label: win.label,
      auctions: list.length,
      users_notified: notifiedUsers,
    });
  }

  return new Response(JSON.stringify(summary), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
