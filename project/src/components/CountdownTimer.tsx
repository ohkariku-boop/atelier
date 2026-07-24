import { useEffect, useState } from 'react';

interface CountdownTimerProps {
  endTime: string;
  variant?: 'large' | 'compact' | 'minimal';
  onEnd?: () => void;
  className?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function CountdownTimer({ endTime, variant = 'compact', onEnd, className = '' }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => {
    return Math.max(0, new Date(endTime).getTime() - Date.now());
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const r = Math.max(0, new Date(endTime).getTime() - Date.now());
      setRemaining(r);
      if (r === 0 && onEnd) onEnd();
    }, 100);
    return () => clearInterval(interval);
  }, [endTime, onEnd]);

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const isUrgent = remaining < 30000;
  const isFlash = remaining < 120000;

  if (variant === 'large') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {hours > 0 && (
          <div className="flex flex-col items-center">
            <span className={`font-mono text-3xl font-bold tabular-nums ${isUrgent ? 'text-accent-500' : 'text-ink-900 dark:text-ink-50'}`}>
              {pad(hours)}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-ink-500 mt-1">Hours</span>
          </div>
        )}
        <span className={`font-mono text-3xl font-bold ${isUrgent ? 'text-accent-500' : 'text-ink-300 dark:text-ink-600'}`}>:</span>
        <div className="flex flex-col items-center">
          <span className={`font-mono text-3xl font-bold tabular-nums ${isUrgent ? 'text-accent-500' : 'text-ink-900 dark:text-ink-50'}`}>
            {pad(minutes)}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-ink-500 mt-1">Min</span>
        </div>
        <span className={`font-mono text-3xl font-bold ${isUrgent ? 'text-accent-500' : 'text-ink-300 dark:text-ink-600'}`}>:</span>
        <div className="flex flex-col items-center">
          <span className={`font-mono text-3xl font-bold tabular-nums ${isUrgent ? 'text-accent-500 animate-pulse' : isFlash ? 'text-gold-500' : 'text-ink-900 dark:text-ink-50'}`}>
            {pad(seconds)}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-ink-500 mt-1">Sec</span>
        </div>
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <span className={`font-mono text-sm font-semibold tabular-nums ${isUrgent ? 'text-accent-500' : 'text-ink-600 dark:text-ink-400'} ${className}`}>
        {hours > 0 ? `${hours}h ` : ''}{pad(minutes)}:{pad(seconds)}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${isUrgent ? 'bg-accent-50 dark:bg-accent-900/20' : 'bg-ink-100 dark:bg-ink-800'} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isUrgent ? 'bg-accent-500 animate-pulse' : 'bg-emerald-500 animate-pulse'}`} />
      <span className={`font-mono text-sm font-semibold tabular-nums ${isUrgent ? 'text-accent-600 dark:text-accent-400' : 'text-ink-700 dark:text-ink-300'}`}>
        {hours > 0 ? `${hours}h ` : ''}{pad(minutes)}:{pad(seconds)}
      </span>
    </div>
  );
}
