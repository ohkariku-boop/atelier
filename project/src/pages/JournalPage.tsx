import { useEffect, useState } from 'react';
import { setPageMeta } from '@/lib/pageMeta';
import { supabase } from '@/lib/supabase';

interface Props {
  navigate: (path: string) => void;
  slug?: string;
}

const FALLBACK = [
  {
    slug: 'how-studio-verification-works',
    title: 'How Studio Verification Works',
    excerpt: 'Every listing is reviewed for human authorship and physical existence.',
    body: 'Atelier only lists physical, human-made art. Studio verification combines artist identity, process evidence, and curator review.\n\nArtists submit work-in-progress photos or live process video. Our team (or the licensed operator on House Mode) confirms the work matches the medium and description before it goes live on the floor.\n\nVerified lots carry the Studio Verified badge — our analogue to a specialist guarantee.',
    published_at: '2026-08-01',
  },
  {
    slug: 'how-estimates-work',
    title: 'How Estimates Work on Atelier',
    excerpt: 'Estimates guide collectors without replacing competitive bidding.',
    body: 'Each lot carries an estimate range — a fair market band based on medium, scale, and comparable works.\n\nThe starting bid may sit near the low estimate. Buy Now, when offered, sits above the competitive range so collectors who want certainty can transact immediately.\n\nEstimates are guidance, not a guarantee of sale price.',
    published_at: '2026-08-10',
  },
  {
    slug: 'buying-on-atelier',
    title: "A Collector's Guide to Buying on Atelier",
    excerpt: 'Register, watch, bid or Buy Now, then settle and ship.',
    body: '1. Create an account.\n2. Browse the Gallery Floor or a named sale.\n3. Watch lots you care about.\n4. Place bids before the countdown ends — late bids may extend the clock.\n5. Or use Buy Now when available.\n6. Complete payment and track shipping from Orders.',
    published_at: '2026-08-15',
  },
];

export function JournalPage({ navigate, slug }: Props) {
  const [posts, setPosts] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPageMeta({
      title: slug ? 'Journal — Atelier' : 'Journal — Atelier',
      description: 'Collecting guides and studio stories from Atelier.',
    });
    (async () => {
      try {
        const { data } = await supabase
          .from('journal_posts')
          .select('*')
          .eq('is_published', true)
          .order('published_at', { ascending: false });
        if (data && data.length) setPosts(data as any);
      } catch { /* use fallback */ }
      setLoading(false);
    })();
  }, [slug]);

  const article = slug ? posts.find((p) => p.slug === slug) : null;

  if (article) {
    return (
      <article className="max-w-2xl mx-auto px-6 lg:px-10 py-14">
        <button onClick={() => navigate('journal')} className="text-xs uppercase tracking-widest text-ink-400 mb-8 hover:text-ink-700">
          ← Journal
        </button>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold mb-4">{article.title}</h1>
        <p className="text-sm text-ink-400 mb-8">{article.excerpt}</p>
        <div className="prose-atelier text-ink-600 dark:text-ink-300 text-sm leading-relaxed whitespace-pre-line">
          {article.body}
        </div>
      </article>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-14">
      <p className="text-[10px] uppercase tracking-[0.25em] text-ink-400 mb-3">Editorial</p>
      <h1 className="font-serif text-4xl font-semibold mb-10">Journal</h1>
      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : (
        <ul className="space-y-6">
          {posts.map((p) => (
            <li key={p.slug}>
              <button
                onClick={() => navigate(`journal/${p.slug}`)}
                className="text-left w-full border-b border-ink-200 dark:border-ink-800 pb-6 group"
              >
                <h2 className="font-serif text-2xl font-semibold group-hover:text-accent-600 transition-colors">{p.title}</h2>
                <p className="text-sm text-ink-500 mt-2">{p.excerpt}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
