import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap.ts';

interface TrailerModalProps {
  trailerId?: string | null;
  site?: string | null;
  title: string;
  onClose: () => void;
}

export function TrailerModal({ trailerId, site, title, onClose }: TrailerModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef, Boolean(trailerId), onClose);

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
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-4xl rounded-2xl border border-white/[0.08] bg-[#11111B] overflow-hidden shadow-2xl focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08]">
          <h3 className="text-sm font-semibold text-[#F5F3FF] truncate pr-4">
            {title} — Official Trailer
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg p-1.5 text-[#A5A1B5] hover:bg-[#20202D] hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-[#9B87FF]"
            aria-label="Close trailer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={embedUrl}
            title={`${title} trailer`}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
