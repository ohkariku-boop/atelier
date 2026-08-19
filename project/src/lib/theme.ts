export const SHIPPING_RATES: Record<string, { label: string; cost: number; description: string }> = {
  small_canvas: { label: 'Small Canvas (domestic)', cost: 35, description: 'Up to 18 x 24 in, domestic' },
  medium_framed: { label: 'Medium Framed (domestic)', cost: 85, description: 'Up to 48 x 60 in, domestic' },
  heavy_sculpture: { label: 'Heavy Sculpture (domestic)', cost: 145, description: 'Over 10 lbs, crated, domestic' },
  intl_small: { label: 'Intl. Small', cost: 75, description: 'Small works, international economy' },
  intl_medium: { label: 'Intl. Medium', cost: 160, description: 'Framed / medium, international' },
  intl_heavy: { label: 'Intl. Heavy / Crated', cost: 320, description: 'Sculpture or large crate, international' },
};

export const MEDIUMS = ['Oil', 'Acrylic', 'Ceramic', 'Charcoal', 'Wood', 'Mixed Media'] as const;

export type DisplayCurrency = 'USD' | 'EUR' | 'GBP' | 'SGD' | 'JPY';

const RATES: Record<DisplayCurrency, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  SGD: 1.35,
  JPY: 149,
};

let displayCurrency: DisplayCurrency = 'USD';

try {
  const saved = localStorage.getItem('atelier_currency') as DisplayCurrency | null;
  if (saved && RATES[saved]) displayCurrency = saved;
} catch {
  /* SSR / private mode */
}

/** Used by CurrencyContext so formatCurrency picks up the selection app-wide. */
export function setDisplayCurrency(c: DisplayCurrency) {
  displayCurrency = c;
  try {
    localStorage.setItem('atelier_currency', c);
  } catch {
    /* ignore */
  }
}

export function getDisplayCurrency(): DisplayCurrency {
  return displayCurrency;
}

export function formatCurrency(amount: number): string {
  const converted = amount * RATES[displayCurrency];
  const digits = displayCurrency === 'JPY' ? 0 : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: displayCurrency,
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
    }).format(converted);
  } catch {
    return `$${amount.toFixed(0)}`;
  }
}

export function formatCurrencyPrecise(amount: number): string {
  const converted = amount * RATES[displayCurrency];
  const digits = displayCurrency === 'JPY' ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: displayCurrency,
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(converted);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
