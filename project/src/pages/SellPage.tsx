import { useEffect } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { useAuth } from '@/context/AuthContext';

interface Props {
  navigate: (path: string) => void;
}

export function SellPage({ navigate }: Props) {
  const { session, profile } = useAuth();

  useEffect(() => {
    setPageMeta({
      title: 'Sell & Consign — Atelier',
      description: 'List studio-verified human-made art or onboard your house catalogue on Atelier.',
    });
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
      <p className="text-[10px] uppercase tracking-[0.25em] text-ink-400 mb-3">Artists &amp; operators</p>
      <h1 className="font-serif text-4xl font-semibold mb-4">Sell with Atelier</h1>
      <p className="text-ink-500 leading-relaxed mb-10 max-w-xl">
        Atelier is the digital floor for physical, human-made art. Artists list through Studio Desk.
        Licensed auction operators can run House Mode with their own brand on the same stack.
      </p>

      <div className="grid sm:grid-cols-2 gap-6 mb-12">
        <div className="border border-ink-200 dark:border-ink-800 p-6">
          <h2 className="font-serif text-xl font-semibold mb-2">Artists</h2>
          <ul className="text-sm text-ink-500 space-y-2 list-disc pl-4 mb-6">
            <li>Create an artist profile</li>
            <li>Upload works with medium, dimensions, estimates</li>
            <li>Request studio verification</li>
            <li>Start a timed auction or offer Buy Now</li>
          </ul>
          <button
            onClick={() => navigate(session ? (profile?.role === 'artist' ? 'studio' : 'auth') : 'auth')}
            className="btn-primary px-5 py-2.5 text-xs uppercase tracking-widest w-full"
          >
            {profile?.role === 'artist' ? 'Open Studio Desk' : 'Start as artist'}
          </button>
        </div>
        <div className="border border-ink-200 dark:border-ink-800 p-6">
          <h2 className="font-serif text-xl font-semibold mb-2">Auction operators</h2>
          <ul className="text-sm text-ink-500 space-y-2 list-disc pl-4 mb-6">
            <li>White-label House Mode</li>
            <li>You hold the auctioneer licence</li>
            <li>Atelier provides catalogue, bidding, Buy Now</li>
            <li>Settlement rails integrate next</li>
          </ul>
          <button
            onClick={() => navigate('how-to-buy')}
            className="px-5 py-2.5 text-xs uppercase tracking-widest border border-ink-300 dark:border-ink-700 w-full"
          >
            Platform overview
          </button>
        </div>
      </div>

      <section className="border border-ink-200 dark:border-ink-800 p-6">
        <h2 className="font-serif text-xl font-semibold mb-3">What we accept</h2>
        <p className="text-sm text-ink-500 leading-relaxed">
          Physical works made by human hands — painting, drawing, ceramic, sculpture, textile, and related media.
          No AI-generated or digital-only assets. Every live lot is expected to pass studio verification.
        </p>
      </section>
    </div>
  );
}
