import { X } from 'lucide-react';

interface ImageZoomProps {
  src: string;
  alt: string;
  className?: string;
}

export function ImageZoom({ src, alt, className = '' }: ImageZoomProps) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img src={src} alt={alt} className="w-full h-full object-cover" />
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
