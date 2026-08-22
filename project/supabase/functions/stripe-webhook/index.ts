// Stripe webhook → checkout paid + Identity KYC sync.
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function syncIdentitySession(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Identity.VerificationSession
) {
  const userId =
    session.metadata?.supabase_user_id ||
    (
      await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_identity_session_id', session.id)
        .maybeSingle()
    ).data?.id;

  if (!userId) {
    console.error('Identity session: no user for', session.id);
    return;
  }

  const status = session.status;
  const patch: Record<string, unknown> = {
    stripe_identity_session_id: session.id,
  };

  if (status === 'verified') {
    patch.kyc_status = 'verified';
    patch.kyc_verified_at = new Date().toISOString();
    patch.kyc_reviewed_at = new Date().toISOString();
    patch.stripe_identity_last_error = null;
  } else if (status === 'requires_input') {
    const code = session.last_error?.code || session.last_error?.reason || 'requires_input';
    patch.stripe_identity_last_error = code;
    patch.kyc_status = code === 'consent_declined' ? 'rejected' : 'pending';
  } else if (status === 'canceled') {
    patch.kyc_status = 'none';
  } else if (status === 'processing') {
    patch.kyc_status = 'pending';
  }

  await supabase.from('profiles').update(patch).eq('id', userId);
  await supabase.from('kyc_events').insert({
    user_id: userId,
    event_type: `webhook_${status}`,
    stripe_session_id: session.id,
    payload: { status, last_error: session.last_error || null },
  });

  if (status === 'verified') {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'kyc_update',
      title: 'Identity verified',
      body: 'Your identity was verified. You can place high-value bids.',
    });
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'Stripe webhook not configured' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;
    if (orderId) {
      const { error } = await supabase.rpc('complete_stripe_payment', {
        p_order_id: orderId,
        p_payment_intent_id:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id || null,
        p_checkout_session_id: session.id,
      });
      if (error) {
        console.error('complete_stripe_payment failed', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      try {
        await supabase.functions.invoke('send-receipt-email', { body: { order_id: orderId } });
      } catch {
        /* ignore */
      }
      try {
        await supabase.functions.invoke('notify-seller-sale', { body: { order_id: orderId } });
      } catch {
        /* ignore */
      }
    }
  }

  // Identity events
  if (
    event.type === 'identity.verification_session.verified' ||
    event.type === 'identity.verification_session.requires_input' ||
    event.type === 'identity.verification_session.processing' ||
    event.type === 'identity.verification_session.canceled'
  ) {
    const session = event.data.object as Stripe.Identity.VerificationSession;
    try {
      await syncIdentitySession(supabase, session);
    } catch (e) {
      console.error('Identity sync failed', e);
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
