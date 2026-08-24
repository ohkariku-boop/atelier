import { useEffect } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { Gavel, Eye, CreditCard, Truck, ShieldCheck, Clock } from 'lucide-react';

interface Props {
  navigate: (path: string) => void;
}

export function HowToBuy({ navigate }: Props) {
  useEffect(() => {
    setPageMeta({
      title: 'How to Buy — Atelier',
      description: 'Register, bid or Buy Now, settle and receive studio-verified human-made art.',
    });
  }, []);

  const steps = [
    {
      icon: Eye,
      title: 'Browse the floor',
      body: 'Enter through the Foyer or go straight to the Gallery Floor. Filter by medium, Buy Now, ending soon, or search by artist and title.',
    },
    {
      icon: Clock,
      title: 'Watch & research',
      body: 'Open a lot for estimates, condition notes, and studio verification. Add lots to your watchlist and follow artists you collect.',
    },
    {
      icon: Gavel,
      title: 'Bid or Buy Now',
      body: 'Place competitive bids before the countdown ends. Late bids may extend the clock (soft close). Where offered, Buy Now locks the price immediately.',
    },
    {
      icon: CreditCard,
      title: 'Settle',
      body: 'Winning and Buy Now lots move to Orders. Complete payment within the stated window. Platform fees are disclosed before you confirm.',
    },
    {
      icon: Truck,
      title: 'Ship & receive',
      body: 'Artists and operators arrange packing. Track shipment from Orders. Raise a claim promptly if condition does not match the listing.',
    },
    {
      icon: ShieldCheck,
      title: 'Trust layer',
      body: 'Studio-verified means human-made physical work reviewed before going live. Atelier is technology for licensed operators — the operator remains responsible for local auction rules.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
      <p className="text-[10px] uppercase tracking-[0.25em] text-ink-400 mb-3">Collectors</p>
      <h1 className="font-serif text-4xl font-semibold mb-4">How to buy</h1>
      <p className="text-ink-500 leading-relaxed mb-12 max-w-xl">
        Buying on Atelier is designed to feel as clear as a traditional catalogue sale — with the speed of a modern digital floor.
      </p>

      <ol className="space-y-8 mb-16">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-5">
            <div className="flex-shrink-0 w-10 h-10 bg-ink-900 dark:bg-ink-50 text-ink-50 dark:text-ink-900 flex items-center justify-center font-mono text-sm">
              {i + 1}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="w-4 h-4 text-accent-600" />
                <h2 className="font-serif text-xl font-semibold">{s.title}</h2>
              </div>
              <p className="text-sm text-ink-500 leading-relaxed">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="border border-ink-200 dark:border-ink-800 p-6 mb-10">
        <h2 className="font-serif text-xl font-semibold mb-3">Fees</h2>
        <p className="text-sm text-ink-500 leading-relaxed mb-3">
          Final amounts are always shown before you confirm a bid or Buy Now. Depending on the operator (House Mode), a buyer&apos;s premium or platform fee may apply.
        </p>
        <ul className="text-sm text-ink-600 dark:text-ink-400 space-y-1 list-disc pl-5">
          <li>Demo / early access: fee schedule shown at checkout</li>
          <li>Shipping is quoted by tier on each lot</li>
          <li>Payment rails (card / Connect) complete the order after you win</li>
        </ul>
      </section>

      <section className="border border-ink-200 dark:border-ink-800 p-6 mb-10">
        <h2 className="font-serif text-xl font-semibold mb-3">Conditions of sale</h2>
        <p className="text-sm text-ink-500 leading-relaxed mb-4">
          By bidding or using Buy Now you agree that lots are physical, human-made works as described; that bids are binding subject to reserve; and that the licensed operator — not Atelier as software vendor — conducts the sale under applicable local law.
        </p>
        <button
          onClick={() => navigate('trust/escrow')}
          className="text-sm font-medium text-accent-600 hover:underline"
        >
          Read trust &amp; protection →
        </button>
      </section>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => navigate('')} className="btn-primary px-6 py-3 text-xs uppercase tracking-widest">
          Browse gallery floor
        </button>
        <button onClick={() => navigate('sell')} className="px-6 py-3 text-xs uppercase tracking-widest border border-ink-300 dark:border-ink-700">
          Sell or consign
        </button>
      </div>
    </div>
  );
}
