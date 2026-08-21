import { Radio, ExternalLink } from 'lucide-react';

interface LiveStreamRoomProps {
  url: string;
  active?: boolean;
  title?: string;
}

/** Embed YouTube/Vimeo when possible; otherwise deep-link out. */
export function LiveStreamRoom({ url, active, title }: LiveStreamRoomProps) {
  const embed = toEmbedUrl(url);

  return (
    <div className="border border-ink-200 dark:border-ink-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-ink-50 dark:bg-ink-900 border-b border-ink-200 dark:border-ink-800">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
          <Radio className={`w-3.5 h-3.5 ${active ? 'text-red-500 animate-pulse' : 'text-ink-400'}`} />
          {active ? 'Live room' : 'Stream'}
          {title ? <span className="font-normal normal-case tracking-normal text-ink-500">· {title}</span> : null}
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="text-ink-500 hover:text-ink-900 dark:hover:text-ink-100">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      {embed ? (
        <div className="aspect-video bg-ink-950">
          <iframe
            src={embed}
            title="Live stream"
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="p-6 text-center">
          <a href={url} target="_blank" rel="noreferrer" className="btn-secondary text-sm inline-flex items-center gap-2">
            Open live stream <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      let id = u.searchParams.get('v');
      if (!id && u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=0`;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}
