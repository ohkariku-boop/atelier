import { useState, useEffect, useCallback } from 'react';

export type Route =
  | { name: 'gallery' }
  | { name: 'auction'; auctionId: string }
  | { name: 'artist'; artistId: string }
  | { name: 'studio' }
  | { name: 'orders' }
  | { name: 'auth' }
  | { name: 'trust'; section?: string }
  | { name: 'admin' };

function parseHash(): Route {
  const hash = window.location.hash.slice(1);
  const parts = hash.split('/');
  if (parts[0] === 'auction' && parts[1]) {
    return { name: 'auction', auctionId: parts[1] };
  }
  if (parts[0] === 'artist' && parts[1]) {
    return { name: 'artist', artistId: parts[1] };
  }
  if (parts[0] === 'studio') return { name: 'studio' };
  if (parts[0] === 'orders') return { name: 'orders' };
  if (parts[0] === 'auth') return { name: 'auth' };
  if (parts[0] === 'trust') return { name: 'trust', section: parts[1] };
  if (parts[0] === 'admin') return { name: 'admin' };
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
