import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface TrailerModalProps {
  trailerId?: string | null;
  site?: string | null;
  title: string;
  onClose: () => void;
}

export function TrailerModal({ trailerId, site, title, onClose }: TrailerModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!trailerId) return null;

  const normalizedSite = (site || 'youtube').toLowerCase();
  const embedUrl =
    normalizedSite === 'dailymotion'
      ? `https://www.dailymotion.com/embed/video/${encodeURIComponent(trailerId)}?autoplay=1`
      : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerId)}?autoplay=1&rel=0`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090F]/85 p-4 backdrop-blur-md animate-av-enter"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} Official Trailer`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl border border-white/[0.08] bg-[#11111B] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08]">
          <h3 className="text-sm font-semibold text-[#F5F3FF] truncate pr-4">
            {title} — Official Trailer
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#A5A1B5] hover:bg-[#20202D] hover:text-white transition-colors"
            aria-label="Close trailer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={embedUrl}
            title={`${title} trailer`}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
