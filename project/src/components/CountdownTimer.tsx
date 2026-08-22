import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

interface CountdownTimerProps {
  endTime: string;
  variant?: 'large' | 'compact' | 'minimal';
  /** Flash sale styling — gold urgency, explicit “ends in” label */
  mode?: 'default' | 'flash';
  onEnd?: () => void;
  className?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function CountdownTimer({
  endTime,
  variant = 'compact',
  mode = 'default',
  onEnd,
  className = '',
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(endTime).getTime() - Date.now())
  );

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, new Date(endTime).getTime() - Date.now());
      setRemaining(r);
      if (r === 0 && onEnd) onEnd();
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [endTime, onEnd]);

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const isEnded = remaining <= 0;
  const isUrgent = remaining > 0 && remaining < 5 * 60 * 1000; // < 5 min
  const isSoon = remaining > 0 && remaining < 60 * 60 * 1000; // < 1 hr
  const isFlashMode = mode === 'flash';

  if (isEnded) {
    if (variant === 'minimal') {
      return <span className={`font-mono text-sm font-semibold text-ink-400 ${className}`}>Ended</span>;
    }
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink-100 dark:bg-ink-800 text-ink-500 ${className}`}
      >
        <span className="font-mono text-sm font-semibold">Ended</span>
      </div>
    );
  }

  const timeColor = isUrgent
    ? 'text-accent-500'
    : isFlashMode || isSoon
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-ink-900 dark:text-ink-50';

  if (variant === 'large') {
    return (
      <div className={`${className}`}>
        {isFlashMode && (
          <div className="flex items-center gap-1.5 mb-2 text-amber-600 dark:text-amber-400">
            <Zap className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">
              Flash ends in
            </span>
          </div>
        )}
        <div className="flex items-center gap-3">
          {days > 0 && (
            <>
              <div className="flex flex-col items-center">
                <span className={`font-mono text-3xl font-bold tabular-nums ${timeColor}`}>{pad(days)}</span>
                <span className="text-[10px] uppercase tracking-widest text-ink-500 mt-1">Days</span>
              </div>
              <span className="font-mono text-3xl font-bold text-ink-300 dark:text-ink-600">:</span>
            </>
          )}
          <div className="flex flex-col items-center">
            <span className={`font-mono text-3xl font-bold tabular-nums ${timeColor}`}>{pad(hours)}</span>
            <span className="text-[10px] uppercase tracking-widest text-ink-500 mt-1">Hours</span>
          </div>
          <span className="font-mono text-3xl font-bold text-ink-300 dark:text-ink-600">:</span>
          <div className="flex flex-col items-center">
            <span className={`font-mono text-3xl font-bold tabular-nums ${timeColor}`}>{pad(minutes)}</span>
            <span className="text-[10px] uppercase tracking-widest text-ink-500 mt-1">Min</span>
          </div>
          <span className="font-mono text-3xl font-bold text-ink-300 dark:text-ink-600">:</span>
          <div className="flex flex-col items-center">
            <span
              className={`font-mono text-3xl font-bold tabular-nums ${timeColor} ${isUrgent ? 'animate-pulse' : ''}`}
            >
              {pad(seconds)}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-ink-500 mt-1">Sec</span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'minimal') {
    const label =
      days > 0
        ? `${days}d ${pad(hours)}:${pad(minutes)}`
        : hours > 0
          ? `${hours}h ${pad(minutes)}:${pad(seconds)}`
          : `${pad(minutes)}:${pad(seconds)}`;
    return (
      <span
        className={`font-mono text-sm font-semibold tabular-nums ${
          isUrgent ? 'text-accent-500 animate-pulse' : isFlashMode ? 'text-amber-600 dark:text-amber-400' : 'text-ink-600 dark:text-ink-400'
        } ${className}`}
      >
        {isFlashMode ? `⚡ ${label}` : label}
      </span>
    );
  }

  // compact
  const label =
    days > 0
      ? `${days}d ${pad(hours)}h ${pad(minutes)}m`
      : hours > 0
        ? `${hours}h ${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${
        isUrgent
          ? 'bg-accent-50 dark:bg-accent-900/20'
          : isFlashMode
            ? 'bg-amber-50 dark:bg-amber-900/25 border border-amber-200/80 dark:border-amber-700/50'
            : 'bg-ink-100 dark:bg-ink-800'
      } ${className}`}
    >
      {isFlashMode ? (
        <Zap className={`w-3 h-3 ${isUrgent ? 'text-accent-500' : 'text-amber-500'}`} />
      ) : (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isUrgent ? 'bg-accent-500 animate-pulse' : 'bg-emerald-500 animate-pulse'
          }`}
        />
      )}
      <span
        className={`font-mono text-sm font-semibold tabular-nums ${
          isUrgent
            ? 'text-accent-600 dark:text-accent-400'
            : isFlashMode
              ? 'text-amber-800 dark:text-amber-300'
              : 'text-ink-700 dark:text-ink-300'
        } ${isUrgent ? 'animate-pulse' : ''}`}
      >
        {isFlashMode && remaining < 24 * 60 * 60 * 1000 ? '' : ''}
        {label}
      </span>
    </div>
  );
}
