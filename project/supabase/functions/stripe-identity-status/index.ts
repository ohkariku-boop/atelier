// Poll Stripe Identity session and sync profile (webhook backup).
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function applyStatus(
  admin: ReturnType<typeof createClient>,
  userId: string,
  session: Stripe.Identity.VerificationSession
) {
  const status = session.status;
  let kyc_status: string | null = null;
  let lastError: string | null = null;

  if (status === 'verified') {
    kyc_status = 'verified';
  } else if (status === 'requires_input') {
    const err = session.last_error;
    lastError = err?.code || err?.reason || 'requires_input';
    // keep pending unless explicit failure codes
    kyc_status = lastError && lastError !== 'requires_input' ? 'rejected' : 'pending';
  } else if (status === 'processing') {
    kyc_status = 'pending';
  } else if (status === 'canceled') {
    kyc_status = 'none';
  }

  const patch: Record<string, unknown> = {
    stripe_identity_session_id: session.id,
    stripe_identity_last_error: lastError,
  };
  if (kyc_status) patch.kyc_status = kyc_status;
  if (kyc_status === 'verified') {
    patch.kyc_verified_at = new Date().toISOString();
    patch.kyc_reviewed_at = new Date().toISOString();
  }

  await admin.from('profiles').update(patch).eq('id', userId);
  await admin.from('kyc_events').insert({
    user_id: userId,
    event_type: `status_${status}`,
    stripe_session_id: session.id,
    payload: { status, last_error: session.last_error || null },
  });

  if (kyc_status === 'verified') {
    await admin.from('notifications').insert({
      user_id: userId,
      type: 'kyc_update',
      title: 'Identity verified',
      body: 'You can place bids of $10,000 and above.',
    });
  }

  return kyc_status || status;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'STRIPE_NOT_CONFIGURED' }), {
      status: 501,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON || SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_identity_session_id, kyc_status')
      .eq('id', userId)
      .single();

    if (!profile?.stripe_identity_session_id) {
      return new Response(
        JSON.stringify({ kyc_status: profile?.kyc_status || 'none', synced: false }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const session = await stripe.identity.verificationSessions.retrieve(
      profile.stripe_identity_session_id
    );

    const kyc_status = await applyStatus(admin, userId, session);

    return new Response(
      JSON.stringify({
        kyc_status,
        stripe_status: session.status,
        synced: true,
        session_id: session.id,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
