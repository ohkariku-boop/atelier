import { useEffect } from 'react';
import { ShieldCheck, Clock, CheckCircle2, CreditCard } from 'lucide-react';

interface TrustSafetyProps {
  navigate: (path: string) => void;
  section?: string;
}

export function TrustSafety({ section }: TrustSafetyProps) {
  useEffect(() => {
    if (section) {
      const el = document.getElementById(section);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [section]);

  return (
    <div className="max-w-[900px] mx-auto px-6 lg:px-10 py-16">
      <h1 className="font-serif text-3xl md:text-4xl font-semibold mb-4">Trust &amp; Safety</h1>
      <p className="text-ink-500 leading-relaxed mb-16 max-w-2xl">
        Atelier exists because AI-generated images made it hard to know what's real. Here's exactly
        what we check, what we guarantee, and what happens if something goes wrong.
      </p>

      <section id="anti-ai" className="mb-16 scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ink-900 dark:bg-ink-50 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-ink-50 dark:text-ink-900" />
          </div>
          <h2 className="font-serif text-xl font-semibold">Our Verification Policy</h2>
        </div>
        <div className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed space-y-3 pl-13">
          <p>
            Every listing on Atelier is <strong className="text-ink-900 dark:text-ink-100">human-made
            under our verification policy</strong>. That means each studio has gone through our
            verification process and every piece is checked against the policy below before it goes
            live — not that we can guarantee, with total certainty, that no tool was ever touched.
            No marketplace can honestly promise that. What we can promise is a consistent, enforced
            standard and a real process when something is disputed.
          </p>
        </div>
      </section>

      <section id="verification" className="mb-16 scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ink-900 dark:bg-ink-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-ink-50 dark:text-ink-900" />
          </div>
          <h2 className="font-serif text-xl font-semibold">Studio Verification</h2>
        </div>
        <div className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed space-y-3 pl-13">
          <p>
            Before a studio can list, we review process evidence — work-in-progress photos, sketches,
            or short process video — dated and tied to the specific piece. This is the same evidence
            standard used if a listing is ever disputed after sale (see below).
          </p>
        </div>
      </section>

      <section id="escrow" className="mb-16 scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ink-900 dark:bg-ink-50 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-ink-50 dark:text-ink-900" />
          </div>
          <h2 className="font-serif text-xl font-semibold">Escrow Protection &amp; Disputes</h2>
        </div>
        <div className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed space-y-4 pl-13">
          <p>
            Funds are held in escrow after a sale closes and are not released to the artist immediately.
            This window exists specifically so a buyer has a real chance to raise a concern before money
            changes hands.
          </p>

          <div className="bg-ink-50 dark:bg-ink-900 border border-ink-200 dark:border-ink-800 p-5 space-y-3">
            <p className="font-semibold text-ink-900 dark:text-ink-100">How a dispute works:</p>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                <strong className="text-ink-900 dark:text-ink-100">Claim window:</strong> the buyer has
                72 hours after the sale closes to raise a claim, before escrow releases.
              </li>
              <li>
                <strong className="text-ink-900 dark:text-ink-100">Specific grounds required:</strong> a
                claim must point to something concrete about the listing — it can't be a general
                suspicion.
              </li>
              <li>
                <strong className="text-ink-900 dark:text-ink-100">Artist response:</strong> the artist
                has a fixed window to respond with predefined evidence — dated sketches, source/layer
                files, or timestamped work-in-progress photos or video.
              </li>
              <li>
                <strong className="text-ink-900 dark:text-ink-100">Review against policy:</strong> Atelier
                reviews the evidence against this published policy — not against a standard of absolute
                certainty — and makes a one-time decision. Each order can be disputed once.
              </li>
            </ol>
          </div>

          <p>
            This process is deliberately narrow for now. As Atelier grows we'll publish more detail here,
            but we'd rather ship a process that's actually enforceable today than promise something
            broader we can't yet back up.
          </p>
        </div>
      </section>

      <section id="payouts" className="mb-8 scroll-mt-24">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-ink-900 dark:bg-ink-50 flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-ink-50 dark:text-ink-900" />
          </div>
          <h2 className="font-serif text-xl font-semibold">Stripe Connect Payouts</h2>
        </div>
        <div className="text-sm text-ink-600 dark:text-ink-400 leading-relaxed space-y-3 pl-13">
          <p>
            Artist payouts run through Stripe Connect. Funds move directly from escrow to the artist's
            connected Stripe account once the claim window closes with no open dispute — Atelier never
            holds artist funds beyond that window.
          </p>
        </div>
      </section>
    </div>
  );
}
