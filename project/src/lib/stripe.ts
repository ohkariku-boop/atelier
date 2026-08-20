import { supabase } from '@/lib/supabase';

/**
 * Start Stripe Checkout for a pending_payment order.
 * Returns checkout URL or a structured error if Stripe is not configured.
 */
export async function startStripeCheckout(
  orderId: string
): Promise<{ url?: string; error?: string; notConfigured?: boolean }> {
  const { data, error } = await supabase.functions.invoke('stripe-create-checkout', {
    body: { order_id: orderId },
  });

  if (error) {
    const msg = error.message || 'Checkout failed';
    if (msg.includes('STRIPE_NOT_CONFIGURED') || msg.includes('501')) {
      return {
        notConfigured: true,
        error: 'Stripe is not configured yet. Add STRIPE_SECRET_KEY on Supabase.',
      };
    }
    return { error: msg };
  }

  if (data?.code === 'STRIPE_NOT_CONFIGURED' || data?.error?.includes?.('STRIPE_SECRET_KEY')) {
    return {
      notConfigured: true,
      error: data.error || 'Stripe is not configured yet.',
    };
  }

  if (data?.url) return { url: data.url as string };
  return { error: (data as any)?.error || 'No checkout URL returned' };
}

/** Artist Connect onboarding — opens Stripe-hosted Express onboarding. */
export async function startStripeConnectOnboarding(): Promise<{
  url?: string;
  error?: string;
  notConfigured?: boolean;
}> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
    body: {},
  });

  if (error) {
    return { error: error.message || 'Connect onboarding failed' };
  }
  if (data?.code === 'STRIPE_NOT_CONFIGURED') {
    return { notConfigured: true, error: data.error };
  }
  if (data?.url) return { url: data.url as string };
  return { error: (data as any)?.error || 'No onboarding URL returned' };
}
