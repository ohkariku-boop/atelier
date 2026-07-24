export const SHIPPING_RATES: Record<string, { label: string; cost: number; description: string }> = {
  small_canvas: { label: 'Small Canvas', cost: 35, description: 'Up to 18 x 24 in' },
  medium_framed: { label: 'Medium Framed', cost: 85, description: 'Up to 48 x 60 in' },
  heavy_sculpture: { label: 'Heavy Sculpture', cost: 145, description: 'Over 10 lbs, crated' },
};

export const MEDIUMS = ['Oil', 'Acrylic', 'Ceramic', 'Charcoal', 'Wood', 'Mixed Media'] as const;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
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
