// Create Stripe Identity VerificationSession for logged-in user.
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') || 'https://ohkariku-boop.github.io/atelier';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SB_PUBLISHABLE_KEY') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured', code: 'STRIPE_NOT_CONFIGURED' }),
      { status: 501, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON || SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: profile, error: profErr } = await admin
      .from('profiles')
      .select('id, kyc_status, aml_risk_flag, stripe_identity_session_id, display_name')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (profile.aml_risk_flag) {
      return new Response(JSON.stringify({ error: 'Account restricted', code: 'RESTRICTED' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (profile.kyc_status === 'verified') {
      return new Response(
        JSON.stringify({ already_verified: true, kyc_status: 'verified' }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: {
        supabase_user_id: userId,
      },
      options: {
        document: {
          require_matching_selfie: true,
        },
      },
      return_url: `${SITE_URL}/#kyc?identity=return`,
    });

    await admin
      .from('profiles')
      .update({
        stripe_identity_session_id: session.id,
        kyc_status: 'pending',
        kyc_submitted_at: new Date().toISOString(),
        stripe_identity_last_error: null,
      })
      .eq('id', userId);

    await admin.from('kyc_events').insert({
      user_id: userId,
      event_type: 'session_created',
      stripe_session_id: session.id,
      payload: { status: session.status },
    });

    return new Response(
      JSON.stringify({
        session_id: session.id,
        client_secret: session.client_secret,
        url: session.url,
        status: session.status,
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
