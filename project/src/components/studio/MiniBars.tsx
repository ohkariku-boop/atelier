interface BarItem {
  label: string;
  value: number;
}

export function MiniBars({ items, maxBars = 8 }: { items: BarItem[]; maxBars?: number }) {
  const slice = items.slice(0, maxBars);
  const max = Math.max(1, ...slice.map((i) => i.value));

  if (slice.length === 0) {
    return <p className="text-xs text-ink-400 py-4">No data yet.</p>;
  }

  return (
    <div className="space-y-2">
      {slice.map((item) => (
        <div key={item.label} className="grid grid-cols-[100px_1fr_40px] gap-2 items-center">
          <span className="text-[11px] text-ink-500 truncate" title={item.label}>
            {item.label}
          </span>
          <div className="h-2 bg-ink-100 dark:bg-ink-800 overflow-hidden">
            <div
              className="h-full bg-accent-500/80 transition-all duration-500"
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] font-mono text-ink-500 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
