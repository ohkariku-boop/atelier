import { useRef, useState } from 'react';
import { ZoomIn, X } from 'lucide-react';

interface ImageZoomProps {
  src: string;
  alt: string;
  className?: string;
}

export function ImageZoom({ src, alt, className = '' }: ImageZoomProps) {
  const [zoomed, setZoomed] = useState(false);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPosition({ x, y });
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`relative overflow-hidden zoom-cursor group ${className}`}
        onMouseEnter={() => setZoomed(true)}
        onMouseLeave={() => setZoomed(false)}
        onMouseMove={handleMouseMove}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover transition-transform duration-300"
          style={zoomed ? { transform: 'scale(2)', transformOrigin: `${position.x}% ${position.y}%` } : undefined}
        />
        <div className={`absolute top-3 right-3 px-2.5 py-1.5 bg-ink-950/70 text-ink-50 text-xs font-medium backdrop-blur-sm transition-opacity duration-200 ${zoomed ? 'opacity-0' : 'opacity-100'}`}>
          <span className="flex items-center gap-1.5">
            <ZoomIn className="w-3 h-3" />
            Hover to zoom
          </span>
        </div>
      </div>
    </>
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
      className="fixed inset-0 z-[90] bg-ink-950/95 flex items-center justify-center p-8 animate-fade-in"
      onClick={onClose}
    >
      <button
        className="absolute top-6 right-6 p-2 text-ink-300 hover:text-ink-50 transition-colors"
        onClick={onClose}
      >
        <X className="w-7 h-7" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
