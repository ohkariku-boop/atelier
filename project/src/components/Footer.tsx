import { ShieldCheck, Heart } from 'lucide-react';

interface FooterProps {
  navigate: (path: string) => void;
}

export function Footer({ navigate }: FooterProps) {
  return (
    <footer className="border-t border-ink-200 dark:border-ink-800 mt-20">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-ink-900 dark:bg-ink-50 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-ink-50 dark:text-ink-900" />
              </div>
              <span className="font-serif text-lg font-semibold">Atelier</span>
            </div>
            <p className="text-sm text-ink-500 max-w-md leading-relaxed">
              Digital floor for 100% human-made, studio-verified physical art.
              Built for collectors and licensed operators.
            </p>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-widest text-ink-400 mb-3 font-semibold">Marketplace</h4>
            <ul className="space-y-2 text-sm text-ink-600 dark:text-ink-400">
              <li onClick={() => navigate('')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Gallery Floor</li>
              <li onClick={() => navigate('sales')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Sales calendar</li>
              <li onClick={() => navigate('results')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Recent results</li>
              <li onClick={() => navigate('my-bids')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">My bids</li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-widest text-ink-400 mb-3 font-semibold">Buy &amp; Sell</h4>
            <ul className="space-y-2 text-sm text-ink-600 dark:text-ink-400">
              <li onClick={() => navigate('how-to-buy')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">How to buy</li>
              <li onClick={() => navigate('sell')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Sell / consign</li>
              <li onClick={() => navigate('journal')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Journal</li>
              <li onClick={() => navigate('studio')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Studio Desk</li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-widest text-ink-400 mb-3 font-semibold">Trust &amp; Safety</h4>
            <ul className="space-y-2 text-sm text-ink-600 dark:text-ink-400">
              <li onClick={() => navigate('trust/anti-ai')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Anti-AI Guarantee</li>
              <li onClick={() => navigate('trust/verification')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Studio Verification</li>
              <li onClick={() => navigate('trust/escrow')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Escrow Protection</li>
              <li onClick={() => navigate('trust/payouts')} className="hover:text-ink-900 dark:hover:text-ink-200 cursor-pointer transition-colors">Payouts</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-ink-200 dark:border-ink-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-ink-400">© 2026 Atelier. Technology vendor for licensed operators.</p>
          <p className="text-xs text-ink-400 flex items-center gap-1.5">
            Made with <Heart className="w-3 h-3 text-accent-500 fill-current" /> for human artists
          </p>
        </div>
      </div>
    </footer>
  );
}
