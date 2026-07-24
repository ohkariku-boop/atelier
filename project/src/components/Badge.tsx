import { ShieldCheck, Zap, Radio } from 'lucide-react';
import type { Artwork, Auction } from '@/types';

interface BadgeProps {
  variant: 'live' | 'flash' | 'verified' | 'upcoming' | 'ended';
  artwork?: Artwork;
  auction?: Auction;
  size?: 'sm' | 'md';
}

export function Badge({ variant, size = 'sm' }: BadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-1' : 'text-xs px-2.5 py-1.5';

  const config = {
    live: {
      icon: Radio,
      label: 'Live Auction',
      classes: 'bg-accent-600 text-white',
      pulse: true,
    },
    flash: {
      icon: Zap,
      label: '24-Hour Flash',
      classes: 'bg-gold-500 text-ink-950',
      pulse: false,
    },
    verified: {
      icon: ShieldCheck,
      label: 'Studio Verified',
      classes: 'bg-emerald-600 text-white',
      pulse: false,
    },
    upcoming: {
      icon: Radio,
      label: 'Upcoming',
      classes: 'bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-300',
      pulse: false,
    },
    ended: {
      icon: Radio,
      label: 'Ended',
      classes: 'bg-ink-300 text-ink-600 dark:bg-ink-800 dark:text-ink-500',
      pulse: false,
    },
  };

  const { icon: Icon, label, classes, pulse } = config[variant];

  return (
    <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider ${sizeClasses} ${classes}`}>
      <Icon className={`${size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}
