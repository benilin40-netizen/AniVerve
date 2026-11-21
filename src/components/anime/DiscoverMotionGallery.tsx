import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat, formatMalScore } from '../../utils/formatters.ts';
import { useInView } from '../../hooks/useInView.ts';
import { SectionHeader } from '../common/SectionHeader.tsx';
import { SafeImage } from '../common/SafeImage.tsx';

interface DiscoverMotionGalleryProps {
  items: AnimeSummary[];
}

export function DiscoverMotionGallery({ items }: DiscoverMotionGalleryProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { ref: sectionRef, inView } = useInView<HTMLElement>();
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ active: boolean; startX: number; scrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });

  if (items.length === 0) return null;

  const scrollByStep = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(el.clientWidth * 0.72, 300);
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const el = scrollRef.current;
    if (!el) return;
    dragState.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active || !scrollRef.current) return;
    const delta = e.clientX - dragState.current.startX;
    if (Math.abs(delta) > 5) {
      dragState.current.moved = true;
      setIsDragging(true);
    }
    if (dragState.current.moved) {
      scrollRef.current.scrollLeft = dragState.current.scrollLeft - delta;
    }
  };

  const endDrag = () => {
    dragState.current.active = false;
    setTimeout(() => setIsDragging(false), 0);
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Discover Your Next Anime"
      className={`av-reveal ${inView ? 'av-reveal-visible' : ''} space-y-5`}
    >
      <SectionHeader
        title="Discover Your Next Anime"
        subtitle="Curated motion showcase of distinct series and films"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => scrollByStep(-1)}
              aria-label="Scroll motion gallery left"
              className="av-btn-press h-8 w-8 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]/60 hover:text-[#7C5CFF] dark:hover:text-[#9B87FF] flex items-center justify-center"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollByStep(1)}
              aria-label="Scroll motion gallery right"
              className="av-btn-press h-8 w-8 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]/60 hover:text-[#7C5CFF] dark:hover:text-[#9B87FF] flex items-center justify-center"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <Link
              to="/explore"
              className="ml-1 hidden sm:inline-flex items-center gap-1 text-xs font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:underline whitespace-nowrap shrink-0"
            >
              Explore All
            </Link>
          </div>
        }
      />

      <div className="relative">
        <div
          ref={scrollRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className={`av-motion-gallery-track no-scrollbar flex items-stretch gap-4 sm:gap-5 overflow-x-auto scroll-smooth py-2 px-0.5 ${
            isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
          }`}
        >
          {items.map((anime, idx) => {
            const title = getPrimaryTitle(anime.title);
            const artwork =
              anime.bannerImage || anime.coverImage?.extraLarge || anime.coverImage?.large;
            const genreLabel = anime.genres?.slice(0, 2).join(' · ') || formatFormat(anime.format);
            const floatClass = idx % 2 === 0 ? 'av-float-a' : 'av-float-b';

            return (
              <Link
                key={anime.id}
                to={`/anime/${anime.slug}`}
                onClick={(e) => {
                  if (dragState.current.moved) {
                    e.preventDefault();
                    dragState.current.moved = false;
                  }
                }}
                draggable={false}
                className={`group ${floatClass} relative w-[275px] sm:w-[320px] lg:w-[350px] aspect-[16/10] shrink-0 overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-[#171722] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-[#9B87FF]/80 hover:shadow-[0_18px_40px_-14px_rgba(124,92,255,0.42)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]`}
              >
                <SafeImage
                  src={artwork}
                  fallbackSrc={anime.coverImage?.extraLarge || anime.coverImage?.large}
                  alt={title}
                  fallbackLabel={title}
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.07]"
                />

                {/* Animated ambient sheen + obsidian bottom scrim */}
                <div
                  aria-hidden="true"
                  className="av-gradient-sheen pointer-events-none absolute inset-0 bg-gradient-to-tr from-[#7C5CFF]/25 via-transparent to-[#9B87FF]/15 mix-blend-screen"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090F] via-[#09090F]/45 to-[#09090F]/20 transition-opacity duration-300"
                />

                {/* Top Format Badge & MAL Score */}
                <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2">
                  <span className="rounded bg-[#09090F]/80 backdrop-blur-md border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#F5F3FF]">
                    {formatFormat(anime.format)}
                  </span>

                  {typeof anime.malScore === 'number' && (
                    <span className="inline-flex items-center gap-1 rounded bg-[#09090F]/80 backdrop-blur-md border border-[#9B87FF]/35 px-2 py-0.5 text-[11px] font-mono font-semibold text-[#9B87FF] tabular-nums">
                      <Star className="h-3 w-3 fill-current" />
                      {formatMalScore(anime.malScore)}
                    </span>
                  )}
                </div>

                {/* Animated Title, Metadata & View Details */}
                <div className="absolute inset-x-3.5 bottom-3.5 z-10 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#A5A1B5] tabular-nums">
                    {anime.seasonYear && (
                      <>
                        <span>{anime.seasonYear}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className="truncate">{genreLabel}</span>
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-[#F5F3FF] line-clamp-1 tracking-tight opacity-95 group-hover:opacity-100 group-hover:text-white transition-all duration-200">
                      {title}
                    </h3>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#9B87FF] opacity-85 translate-x-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 whitespace-nowrap shrink-0">
                      View Details
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
