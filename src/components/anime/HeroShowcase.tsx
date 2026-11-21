import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, ChevronLeft, ChevronRight, Info, Play, Youtube } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { FALLBACK_BANNER_IMAGE } from '../../config/constants.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { usePrefersReducedMotion } from '../../hooks/useInView.ts';
import { SafeImage } from '../common/SafeImage.tsx';
import { TrailerModal } from './TrailerModal.tsx';

export function HeroShowcase({ items }: { items: AnimeSummary[] }) {
  const [index, setIndex] = useState(0);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const { getWatchlistEntry, upsertWatchlist } = useLibrary();
  const prefersReducedMotion = usePrefersReducedMotion();

  const slides = items.slice(0, 6);

  useEffect(() => {
    if (slides.length <= 1 || trailerOpen || paused) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 8500);
    return () => clearInterval(timer);
  }, [slides.length, trailerOpen, paused]);

  useEffect(() => {
    if (prefersReducedMotion || typeof window === 'undefined') return;
    let rafId = 0;

    const handleScroll = () => {
      const target = backdropRef.current;
      if (!target) return;
      if (window.innerWidth < 768) {
        target.style.setProperty('--hero-py', '0px');
        return;
      }
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY * 0.12, 46);
        target.style.setProperty('--hero-py', `${y.toFixed(1)}px`);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [prefersReducedMotion]);

  if (slides.length === 0) return null;

  const current = slides[index] || slides[0];
  const title = getPrimaryTitle(current.title);
  const saved = getWatchlistEntry(current.id);
  const hasTrailer = Boolean(current.trailer?.id);

  const handlePointerMove = (e: React.MouseEvent<HTMLElement>) => {
    if (prefersReducedMotion || typeof window === 'undefined' || window.innerWidth < 1024) return;
    const rect = sectionRef.current?.getBoundingClientRect();
    const target = backdropRef.current;
    if (!rect || !target) return;
    const normX = (e.clientX - rect.left) / rect.width - 0.5;
    target.style.setProperty('--hero-px', `${(normX * -12).toFixed(1)}px`);
  };

  const handlePointerLeave = () => {
    setPaused(false);
    backdropRef.current?.style.setProperty('--hero-px', '0px');
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (touchStartXRef.current === null || slides.length <= 1) return;
    const endX = e.changedTouches[0]?.clientX;
    if (typeof endX !== 'number') return;
    const delta = endX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(delta) > 48) {
      setIndex((prev) =>
        delta < 0 ? (prev + 1) % slides.length : (prev - 1 + slides.length) % slides.length
      );
    }
  };

  return (
    <section
      ref={sectionRef}
      onMouseEnter={() => setPaused(true)}
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-label="Featured Anime Spotlight"
      className="relative w-full overflow-hidden bg-[#09090F] border-b border-white/[0.08]"
    >
      {/* Subtle atmospheric top-left ambient light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/4 h-[360px] w-[500px] rounded-full bg-[#7C5CFF]/18 blur-[125px] z-[1]"
      />

      <div className="relative min-h-[490px] sm:min-h-[550px] lg:min-h-[610px] w-full flex items-end">
        {/* Stacked crossfading banner frames driven by compositor opacity & CSS-var parallax */}
        <div
          ref={backdropRef}
          className="absolute inset-0 will-change-transform transition-transform duration-500 ease-out"
          style={
            prefersReducedMotion
              ? undefined
              : {
                  transform: 'translate3d(var(--hero-px, 0px), var(--hero-py, 0px), 0) scale(1.04)',
                }
          }
        >
          {slides.map((slide, sIdx) => {
            const isActive = sIdx === index;
            const slideTitle = getPrimaryTitle(slide.title);
            return (
              <div
                key={slide.id}
                aria-hidden={!isActive}
                className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                  isActive ? 'opacity-100 z-[1]' : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                <SafeImage
                  src={slide.bannerImage || slide.coverImage?.extraLarge || FALLBACK_BANNER_IMAGE}
                  fallbackSrc={FALLBACK_BANNER_IMAGE}
                  alt={isActive ? slideTitle : ''}
                  loading={sIdx === 0 ? 'eager' : 'lazy'}
                  className={`h-full w-full object-cover object-center opacity-85 ${
                    isActive && !prefersReducedMotion ? 'animate-hero-zoom' : ''
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Cinematic directional obsidian scrims */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#09090F] via-[#09090F]/78 to-transparent z-[2]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090F] via-[#09090F]/40 to-[#09090F]/60 z-[2]" />

        <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-10 sm:pb-14 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="max-w-2xl" key={`copy-${current.id}`}>
            <div className="av-hero-stagger-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#F5F3FF] text-balance mb-3 leading-[1.08]">
                {title}
              </h1>
            </div>

            {current.genres && current.genres.length > 0 && (
              <p className="av-hero-stagger-2 text-xs sm:text-sm font-medium text-[#A5A1B5] mb-6">
                {current.genres.slice(0, 4).join(' · ')}
              </p>
            )}

            <div className="av-hero-stagger-3">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to={`/watch/${current.slug}/1`}
                  className="av-btn-press inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-5 py-2.5 text-sm font-semibold text-white whitespace-nowrap shrink-0 shadow-lg shadow-[#7C5CFF]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Watch Now
                </Link>

                <Link
                  to={`/anime/${current.slug}`}
                  className="av-btn-press inline-flex items-center gap-2 rounded-lg border border-white/[0.14] bg-[#171722]/75 px-4 py-2.5 text-sm font-medium text-[#F5F3FF] backdrop-blur-md hover:bg-[#20202D] hover:border-[#9B87FF]/50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                >
                  <Info className="h-4 w-4" />
                  Explore Details
                </Link>

                {hasTrailer && (
                  <button
                    type="button"
                    onClick={() => setTrailerOpen(true)}
                    className="av-btn-press inline-flex items-center gap-2 rounded-lg border border-white/[0.14] bg-[#171722]/75 px-4 py-2.5 text-sm font-medium text-[#F5F3FF] backdrop-blur-md hover:bg-[#20202D] hover:border-[#9B87FF]/50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                  >
                    <Youtube className="h-4 w-4 text-[#9B87FF]" />
                    Trailer
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    upsertWatchlist({
                      anilistId: current.id,
                      animeTitle: title,
                      animeSlug: current.slug,
                      coverImage: current.coverImage?.large || current.coverImage?.extraLarge,
                      totalEpisodes: current.episodes,
                      status: saved ? saved.status : 'PLAN_TO_WATCH',
                    })
                  }
                  className="av-btn-press inline-flex items-center gap-2 rounded-lg border border-white/[0.14] bg-[#171722]/75 px-3.5 py-2.5 text-sm font-medium text-[#F5F3FF] backdrop-blur-md hover:bg-[#20202D] hover:border-[#9B87FF]/50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                  aria-label={saved ? 'In Watchlist' : 'Add to Watchlist'}
                >
                  {saved ? (
                    <Check className="h-4 w-4 text-[#9B87FF]" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{saved ? 'Saved' : 'Watchlist'}</span>
                </button>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <div className="flex items-center gap-3 self-start lg:self-end">
              <div className="flex items-center gap-1.5 mr-1">
                {slides.map((slide, sIdx) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setIndex(sIdx)}
                    aria-label={`View spotlight ${sIdx + 1}`}
                    aria-pressed={sIdx === index}
                    className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                      sIdx === index ? 'w-7 bg-[#9B87FF]' : 'w-2 bg-white/25 hover:bg-white/50'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIndex((prev) => (prev - 1 + slides.length) % slides.length)}
                aria-label="Previous featured anime"
                className="av-btn-press h-10 w-10 sm:h-9 sm:w-9 rounded-lg border border-white/[0.12] bg-[#11111B]/75 text-[#F5F3FF] hover:bg-[#20202D] hover:border-[#9B87FF]/50 flex items-center justify-center backdrop-blur-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIndex((prev) => (prev + 1) % slides.length)}
                aria-label="Next featured anime"
                className="av-btn-press h-10 w-10 sm:h-9 sm:w-9 rounded-lg border border-white/[0.12] bg-[#11111B]/75 text-[#F5F3FF] hover:bg-[#20202D] hover:border-[#9B87FF]/50 flex items-center justify-center backdrop-blur-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {trailerOpen && hasTrailer && (
        <TrailerModal
          trailerId={current.trailer?.id}
          site={current.trailer?.site}
          title={title}
          onClose={() => setTrailerOpen(false)}
        />
      )}
    </section>
  );
}
