import { useState, useEffect, useCallback } from 'react';

export type Route =
  | { name: 'gallery' }
  | { name: 'auction'; auctionId: string }
  | { name: 'artist'; artistId: string }
  | { name: 'studio' }
  | { name: 'orders' }
  | { name: 'auth' }
  | { name: 'trust'; section?: string }
  | { name: 'admin' }
  | { name: 'messages'; conversationId?: string }
  | { name: 'collection'; slug: string }
  | { name: 'verify'; slug: string }
  | { name: 'vault' }
  | { name: 'house'; slug: string }
  | { name: 'kyc' }
  | { name: 'how-to-buy' }
  | { name: 'sell' }
  | { name: 'journal'; slug?: string }
  | { name: 'sales' }
  | { name: 'sale'; slug: string }
  | { name: 'my-bids' }
  | { name: 'results' };

function parseHash(): Route {
  const hash = window.location.hash.slice(1);
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'auction' && parts[1]) return { name: 'auction', auctionId: parts[1] };
  if (parts[0] === 'artist' && parts[1]) return { name: 'artist', artistId: parts[1] };
  if (parts[0] === 'studio') return { name: 'studio' };
  if (parts[0] === 'orders') return { name: 'orders' };
  if (parts[0] === 'auth') return { name: 'auth' };
  if (parts[0] === 'trust') return { name: 'trust', section: parts[1] };
  if (parts[0] === 'admin') return { name: 'admin' };
  if (parts[0] === 'messages') return { name: 'messages', conversationId: parts[1] };
  if (parts[0] === 'collection' && parts[1]) return { name: 'collection', slug: parts[1] };
  if (parts[0] === 'verify' && parts[1]) return { name: 'verify', slug: parts[1] };
  if (parts[0] === 'vault') return { name: 'vault' };
  if (parts[0] === 'house' && parts[1]) return { name: 'house', slug: parts[1] };
  if (parts[0] === 'kyc') return { name: 'kyc' };
  if (parts[0] === 'how-to-buy') return { name: 'how-to-buy' };
  if (parts[0] === 'sell') return { name: 'sell' };
  if (parts[0] === 'journal') return { name: 'journal', slug: parts[1] };
  if (parts[0] === 'sales') return { name: 'sales' };
  if (parts[0] === 'sale' && parts[1]) return { name: 'sale', slug: parts[1] };
  if (parts[0] === 'my-bids') return { name: 'my-bids' };
  if (parts[0] === 'results') return { name: 'results' };
  return { name: 'gallery' };
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const handler = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = useCallback((path: string) => {
    window.location.hash = path;
  }, []);

  return { route, navigate };
}
