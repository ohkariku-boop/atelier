import { useState, useRef, useCallback } from 'react';
import { X, ZoomIn } from 'lucide-react';

interface ImageZoomProps {
  src: string;
  alt: string;
  className?: string;
  /** Enable hover magnifier on desktop */
  enableHoverZoom?: boolean;
  onOpenFullscreen?: () => void;
}

/**
 * Artwork image with optional hover-zoom (desktop) and click-to-expand.
 * Uses object-cover for the frame; hover lens samples a higher scale.
 */
export function ImageZoom({
  src,
  alt,
  className = '',
  enableHoverZoom = true,
  onOpenFullscreen,
}: ImageZoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const handleMove = useCallback(
    (e: React.MouseEvent) => {
      if (!enableHoverZoom || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setOrigin({ x, y });
    },
    [enableHoverZoom]
  );

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden group cursor-zoom-in ${className}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={handleMove}
      onClick={onOpenFullscreen}
      role={onOpenFullscreen ? 'button' : undefined}
      tabIndex={onOpenFullscreen ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpenFullscreen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenFullscreen();
        }
      }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover transition-transform duration-200 ease-out will-change-transform"
        style={
          enableHoverZoom && hovering
            ? {
                transform: 'scale(1.85)',
                transformOrigin: `${origin.x}% ${origin.y}%`,
              }
            : undefined
        }
      />
      <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-ink-950/60 text-ink-50 text-[10px] uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
        <ZoomIn className="w-3 h-3" />
        Click to expand
      </div>
    </div>
  );
}

interface FullscreenViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function FullscreenViewer({ src, alt, onClose }: FullscreenViewerProps) {
  return (
    <div
      className="fixed inset-0 z-[90] bg-ink-950/95 flex items-center justify-center p-4 md:p-8 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-ink-300 hover:text-ink-50 transition-colors"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="w-7 h-7" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
