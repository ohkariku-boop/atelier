// Creates a Stripe Checkout Session for a pending_payment order.
// Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional: PLATFORM_FEE_PERCENT (default 10)

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PLATFORM_FEE_PERCENT = Number(Deno.env.get('PLATFORM_FEE_PERCENT') || '10');
const SITE_URL = Deno.env.get('SITE_URL') || 'https://ohkariku-boop.github.io/atelier';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  if (!STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({
        error: 'STRIPE_SECRET_KEY is not configured. Set it with: supabase secrets set STRIPE_SECRET_KEY=sk_test_...',
        code: 'STRIPE_NOT_CONFIGURED',
      }),
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

    const supabaseUser = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: 'order_id required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('*, artwork:artworks(title, image_url, user_id)')
      .eq('id', order_id)
      .maybeSingle();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (order.user_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: 'Not your order' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (order.status !== 'pending_payment') {
      return new Response(JSON.stringify({ error: `Order status is ${order.status}` }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    const amountCents = Math.round((Number(order.amount) + Number(order.shipping_cost || 0)) * 100);
    const feeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));

    // Seller Connect account if onboarded
    let transferData: Stripe.Checkout.SessionCreateParams.PaymentIntentData | undefined;
    if (order.artwork?.user_id) {
      const { data: seller } = await supabaseAdmin
        .from('profiles')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('id', order.artwork.user_id)
        .maybeSingle();
      if (seller?.stripe_account_id && seller.stripe_onboarding_complete) {
        transferData = {
          transfer_data: { destination: seller.stripe_account_id },
          application_fee_amount: feeCents,
        };
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: order.buyer_email || userData.user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (order.currency || 'usd').toLowerCase(),
            unit_amount: amountCents,
            product_data: {
              name: order.artwork?.title || order.title || 'Artwork purchase',
              description: `Atelier order ${order.receipt_number || order.id.slice(0, 8)} (incl. shipping)`,
              images: order.artwork?.image_url ? [order.artwork.image_url] : undefined,
            },
          },
        },
      ],
      payment_intent_data: transferData,
      metadata: {
        order_id: order.id,
        artwork_id: order.artwork_id || '',
      },
      success_url: `${SITE_URL}/#orders?paid=1&order_id=${order.id}`,
      cancel_url: `${SITE_URL}/#orders?cancelled=1&order_id=${order.id}`,
    });

    await supabaseAdmin
      .from('orders')
      .update({
        stripe_checkout_session_id: session.id,
        platform_fee_cents: feeCents,
      })
      .eq('id', order.id);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

# deploy trigger 2026-08-20T06:04:27Z
