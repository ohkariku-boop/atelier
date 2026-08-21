import { useState } from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { setPageMeta } from '@/lib/pageMeta';
import { useEffect } from 'react';

interface KycPageProps {
  navigate: (path: string) => void;
}

export function KycPage({ navigate }: KycPageProps) {
  const { session, profile } = useAuth();
  const { showToast } = useToast();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPageMeta({ title: 'Identity verification — Atelier', description: 'KYC / AML for high-value bidding' });
  }, []);

  const status = (profile as any)?.kyc_status || 'none';

  const submit = async () => {
    if (!session) {
      navigate('auth');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('submit_kyc_for_review', { p_notes: notes.trim() || null });
    setBusy(false);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast('KYC submitted for review.', 'success');
    window.location.reload();
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 bg-ink-900 dark:bg-ink-100 flex items-center justify-center">
          <Shield className="w-5 h-5 text-ink-50 dark:text-ink-900" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold">Identity & compliance</h1>
          <p className="text-xs text-ink-500">KYC / AML for bids of $10,000+</p>
        </div>
      </div>

      <div className="card-surface p-5 mb-6">
        <p className="text-[10px] uppercase tracking-widest text-ink-400">Status</p>
        <p className="text-lg font-medium capitalize mt-1">{status}</p>
        {(profile as any)?.kyc_level && (
          <p className="text-xs text-ink-500 mt-1">Level: {(profile as any).kyc_level}</p>
        )}
        {(profile as any)?.aml_risk_flag && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Restricted account
          </p>
        )}
      </div>

      <p className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed mb-6">
        High-value participation requires identity verification. Submit a request and our compliance
        team will review. In production this pairs with a licensed KYC provider (document + liveness);
        this flow records your request and admin decision.
      </p>

      {status !== 'verified' && status !== 'pending' && (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional notes (legal name, jurisdiction…)"
            className="w-full text-sm p-3 border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-950 mb-3"
          />
          <button type="button" disabled={busy} onClick={submit} className="btn-primary text-sm">
            {busy ? 'Submitting…' : 'Submit for verification'}
          </button>
        </>
      )}
      {status === 'pending' && (
        <p className="text-sm text-amber-700 dark:text-amber-400">Your verification is under review.</p>
      )}
    </div>
  );
}
