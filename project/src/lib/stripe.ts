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
  code?: string;
}> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
    body: {},
  });

  if (error) {
    return { error: error.message || 'Connect onboarding failed' };
  }
  if (data?.code === 'STRIPE_NOT_CONFIGURED') {
    return { notConfigured: true, error: data.error, code: data.code };
  }
  if (data?.code === 'KYC_REQUIRED') {
    return { error: data.error || 'Identity verification required', code: 'KYC_REQUIRED' };
  }
  if (data?.url) return { url: data.url as string };
  return { error: (data as any)?.error || 'No onboarding URL returned', code: (data as any)?.code };
}

export type ConnectStatus = {
  connected: boolean;
  onboarding_complete: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements_currently_due?: string[];
  error?: string;
};

/** Sync Connect account status from Stripe → profiles.stripe_onboarding_complete */
export async function refreshStripeConnectStatus(): Promise<ConnectStatus> {
  const { data, error } = await supabase.functions.invoke('stripe-connect-status', {
    body: {},
  });
  if (error) {
    return {
      connected: false,
      onboarding_complete: false,
      error: error.message,
    };
  }
  if (data?.error) {
    return {
      connected: false,
      onboarding_complete: false,
      error: data.error,
    };
  }
  return {
    connected: !!data?.connected,
    onboarding_complete: !!data?.onboarding_complete,
    charges_enabled: !!data?.charges_enabled,
    payouts_enabled: !!data?.payouts_enabled,
    details_submitted: !!data?.details_submitted,
    requirements_currently_due: data?.requirements_currently_due || [],
  };
}
