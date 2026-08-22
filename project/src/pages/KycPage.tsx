import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { setPageMeta } from '@/lib/pageMeta';

interface KycPageProps {
  navigate: (path: string) => void;
}

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export function KycPage({ navigate }: KycPageProps) {
  const { session, profile } = useAuth() as any;
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setPageMeta({
      title: 'Identity verification — Atelier',
      description: 'Stripe Identity KYC for high-value bidding and seller payouts',
    });
  }, []);

  // Return from hosted flow or after modal
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('identity=return') && session) {
      void syncStatus();
    }
  }, [session]);

  const status = (profile as any)?.kyc_status || 'none';
  const lastError = (profile as any)?.stripe_identity_last_error;

  const syncStatus = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-identity-status', {
        body: {},
      });
      if (error) throw error;
      if (data?.kyc_status === 'verified') {
        showToast('Identity verified.', 'success');
      }
      window.location.reload();
    } catch (e: any) {
      console.warn(e);
    } finally {
      setSyncing(false);
    }
  };

  const startIdentity = async () => {
    if (!session) {
      navigate('auth');
      return;
    }
    if (!publishableKey) {
      showToast('VITE_STRIPE_PUBLISHABLE_KEY is not set in the build.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-identity-create', {
        body: {},
      });
      if (error) throw error;
      if (data?.already_verified) {
        showToast('Already verified.', 'success');
        window.location.reload();
        setBusy(false);
        return;
      }
      if (data?.code === 'STRIPE_NOT_CONFIGURED' || data?.error?.includes?.('STRIPE')) {
        showToast(data.error || 'Stripe not configured', 'error');
        setBusy(false);
        return;
      }
      if (!data?.client_secret) {
        // fallback hosted URL
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        throw new Error(data?.error || 'No client_secret from Identity');
      }

      const stripe = await loadStripe(publishableKey);
      if (!stripe) throw new Error('Stripe.js failed to load');

      const { error: vErr } = await (stripe as any).verifyIdentity(data.client_secret);
      if (vErr) {
        showToast(vErr.message || 'Verification cancelled', 'error');
      }
      await syncStatus();
    } catch (e: any) {
      showToast(e.message || 'Verification failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-6 py-20 text-center">
        <p className="font-serif text-2xl mb-3">Identity verification</p>
        <p className="text-sm text-ink-500 mb-6">Sign in to verify your identity.</p>
        <button type="button" className="btn-primary text-sm" onClick={() => navigate('auth')}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 bg-ink-900 dark:bg-ink-100 flex items-center justify-center">
          <Shield className="w-5 h-5 text-ink-50 dark:text-ink-900" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold">Identity & compliance</h1>
          <p className="text-xs text-ink-500">Stripe Identity · bids $10,000+ · seller payouts</p>
        </div>
      </div>

      <div className="card-surface p-5 mb-6">
        <p className="text-[10px] uppercase tracking-widest text-ink-400">Status</p>
        <div className="flex items-center gap-2 mt-1">
          {status === 'verified' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          <p className="text-lg font-medium capitalize">{status}</p>
        </div>
        {(profile as any)?.kyc_verified_at && (
          <p className="text-xs text-ink-500 mt-1">
            Verified {new Date((profile as any).kyc_verified_at).toLocaleString()}
          </p>
        )}
        {(profile as any)?.aml_risk_flag && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Restricted account
          </p>
        )}
        {lastError && status !== 'verified' && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">Last issue: {lastError}</p>
        )}
      </div>

      <p className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed mb-6">
        We use Stripe Identity for government ID and selfie matching. High-value bids and artist
        Connect payout onboarding require a verified status. Sensitive documents stay with Stripe;
        Atelier only stores verification status.
      </p>

      {status === 'verified' ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          You are verified. High-value bidding is unlocked.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy || (profile as any)?.aml_risk_flag}
            onClick={startIdentity}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Opening Stripe…
              </>
            ) : (
              'Verify with Stripe Identity'
            )}
          </button>
          <button
            type="button"
            disabled={syncing}
            onClick={syncStatus}
            className="btn-secondary text-sm"
          >
            {syncing ? 'Syncing…' : 'Refresh status'}
          </button>
        </div>
      )}
    </div>
  );
}
