// Supabase Edge Function: notify-seller-sale
//
// Sends the artist an email when a buyer completes payment on their piece.
// Mirrors send-receipt-email's setup and failure behavior exactly - see
// that function's header comment for Resend activation steps. This one
// reuses the same RESEND_API_KEY / FROM_ADDRESS secrets; no separate setup
// needed if the receipt email is already activated.

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
        error: 'RESEND_API_KEY is not configured - this function is deployed but not activated yet.',
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
    .select('*, artwork:artworks(title, user_id)')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const artistUserId = order.artwork?.user_id;
  if (!artistUserId) {
    return new Response(JSON.stringify({ error: 'No artist on file for this artwork' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: artistUser } = await supabase.auth.admin.getUserById(artistUserId);
  const artistEmail = artistUser?.user?.email;

  if (!artistEmail) {
    return new Response(JSON.stringify({ error: 'Artist has no email on file' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const artworkTitle = order.artwork?.title || 'your piece';

  const html = `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h1 style="font-size: 20px; font-weight: 600;">Your piece sold!</h1>
      <p style="font-size: 14px; line-height: 1.6;">
        <strong>${artworkTitle}</strong> sold for $${order.amount.toFixed(2)}. Payment has been
        completed and is now held in escrow.
      </p>
      <p style="font-size: 14px; line-height: 1.6;">
        Next step: ship the piece and add tracking in your Studio Desk. Funds release once the
        buyer confirms delivery (or after the claim window closes with no dispute).
      </p>
      <p style="font-size: 12px; color: #666; margin-top: 16px;">
        Order #${order.receipt_number || order.id}
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
      to: artistEmail,
      subject: `Sold: ${artworkTitle}`,
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
