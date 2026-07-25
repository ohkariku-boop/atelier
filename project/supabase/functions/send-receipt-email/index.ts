// Supabase Edge Function: send-receipt-email
//
// Sends a purchase receipt email to the buyer after an order is created
// (auto-sold or seller-accepted). Uses Resend (https://resend.com) - a
// simple transactional email API with a generous free tier.
//
// ## To actually activate this (it will NOT send real email until you do):
// 1. Create a free Resend account at https://resend.com and get an API key.
// 2. Verify a sending domain in Resend (or use their shared test domain
//    for initial testing - check Resend's docs for the current test address).
// 3. Set the key as a Supabase secret:
//      supabase secrets set RESEND_API_KEY=re_your_key_here
// 4. Deploy this function:
//      supabase functions deploy send-receipt-email
//
// Until those steps are done, this function will return a clear error
// (not a silent fake success) - the calling code in src/lib/closeAuction.ts
// already treats email failures as best-effort and won't break the
// purchase flow either way.

import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FROM_ADDRESS = Deno.env.get('RECEIPT_FROM_ADDRESS') || 'Atelier <receipts@yourdomain.com>';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!RESEND_API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'RESEND_API_KEY is not configured - this function is deployed but not activated yet. See the comment at the top of this file for setup steps.',
      }),
      { status: 501, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let orderId: string;
  try {
    const body = await req.json();
    orderId = body.order_id;
    if (!orderId) throw new Error('order_id is required');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body - expected { order_id }' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, artwork:artworks(title, image_url), artist:artworks(artist:artists(name))')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!order.buyer_email) {
    return new Response(JSON.stringify({ error: 'Order has no buyer email on file' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const total = order.amount + order.shipping_cost;
  const artworkTitle = order.artwork?.title || 'your artwork';
  const artistName = order.artist?.artist?.name || 'the artist';

  const html = `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h1 style="font-size: 20px; font-weight: 600;">Purchase Confirmed</h1>
      <p style="font-size: 14px; line-height: 1.6;">
        You purchased <strong>${artworkTitle}</strong> by ${artistName}.
      </p>
      <table style="width: 100%; font-size: 13px; margin: 16px 0; border-collapse: collapse;">
        <tr><td style="padding: 4px 0;">Winning bid</td><td style="text-align: right;">$${order.amount.toFixed(2)}</td></tr>
        <tr><td style="padding: 4px 0;">Shipping</td><td style="text-align: right;">$${order.shipping_cost.toFixed(2)}</td></tr>
        <tr style="font-weight: 600; border-top: 1px solid #ddd;">
          <td style="padding: 8px 0;">Total</td><td style="text-align: right;">$${total.toFixed(2)}</td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #666;">
        Receipt #${order.receipt_number || order.id}<br/>
        ${order.paid_at ? new Date(order.paid_at).toLocaleString() : ''}
      </p>
      <p style="font-size: 12px; color: #666; margin-top: 16px;">
        Your payment is held in escrow until you confirm delivery. Track this order any time
        in your Atelier account.
      </p>
    </div>
  `;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: order.buyer_email,
      subject: `Receipt: ${artworkTitle}`,
      html,
    }),
  });

  if (!resendResponse.ok) {
    const errText = await resendResponse.text();
    return new Response(JSON.stringify({ error: `Resend API error: ${errText}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
