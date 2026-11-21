import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat, formatMalScore } from '../../utils/formatters.ts';
import { useInView, usePrefersReducedMotion } from '../../hooks/useInView.ts';
import { SectionHeader } from '../common/SectionHeader.tsx';
import { SafeImage } from '../common/SafeImage.tsx';

interface InfiniteAnimeCarouselProps {
  rowOneItems: AnimeSummary[];
  rowTwoItems: AnimeSummary[];
}

export function InfiniteAnimeCarousel({
  rowOneItems,
  rowTwoItems,
}: InfiniteAnimeCarouselProps) {
  const { ref, inView } = useInView<HTMLElement>();

  if (rowOneItems.length === 0 && rowTwoItems.length === 0) return null;

  return (
    <section
      ref={ref}
      aria-label="Infinite Anime Showcase"
      className={`av-reveal ${inView ? 'av-reveal-visible' : ''} space-y-5`}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          title="Endless Anime Stream"
          subtitle="Hover to pause or drag smoothly across curated series"
          to="/explore?sort=POPULARITY_DESC"
          linkLabel="Full Catalog"
        />
      </div>

      <div className="relative space-y-4">
        {/* Left & Right edge gradient fades matching theme background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-10 sm:w-20 lg:w-28 z-20 bg-gradient-to-r from-[#F6F5FA] dark:from-[#09090F] to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 sm:w-20 lg:w-28 z-20 bg-gradient-to-l from-[#F6F5FA] dark:from-[#09090F] to-transparent"
        />

        {rowOneItems.length > 0 && (
          <MarqueeStrip items={rowOneItems} direction="left" speedPxPerSec={32} />
        )}

        {rowTwoItems.length > 0 && (
          <MarqueeStrip items={rowTwoItems} direction="right" speedPxPerSec={28} />
        )}
      </div>
    </section>
  );
}

function MarqueeStrip({
  items,
  direction,
  speedPxPerSec,
}: {
  items: AnimeSummary[];
  direction: 'left' | 'right';
  speedPxPerSec: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const dragRef = useRef<{ active: boolean; startX: number; scrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });
  const [dragging, setDragging] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Visual duplication strictly at render layer for seamless wraparound
  const loopItems = items.length > 1 ? [...items, ...items] : items;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || items.length <= 1) return;

    // Position right-moving strip at half-width initially so rightward scroll never hits 0 abruptly
    if (direction === 'right') {
      const half = el.scrollWidth / 2;
      if (half > 0 && el.scrollLeft === 0) {
        el.scrollLeft = half;
      }
    }

    if (prefersReducedMotion) return;

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const node = containerRef.current;
      if (node && !pausedRef.current && !dragRef.current.active) {
        const isMobile = window.innerWidth < 768;
        const speed = isMobile ? speedPxPerSec * 0.55 : speedPxPerSec;
        const halfWidth = node.scrollWidth / 2;

        if (halfWidth > 0) {
          if (direction === 'left') {
            node.scrollLeft += speed * dt;
            if (node.scrollLeft >= halfWidth) {
              node.scrollLeft -= halfWidth;
            }
          } else {
            node.scrollLeft -= speed * dt;
            if (node.scrollLeft <= 0) {
              node.scrollLeft += halfWidth;
            }
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [direction, items.length, prefersReducedMotion, speedPxPerSec]);

  const handleScrollWrap = () => {
    const node = containerRef.current;
    if (!node || items.length <= 1) return;
    const halfWidth = node.scrollWidth / 2;
    if (halfWidth <= 0) return;
    if (node.scrollLeft >= halfWidth) {
      node.scrollLeft -= halfWidth;
    } else if (node.scrollLeft <= 1 && direction === 'right') {
      node.scrollLeft += halfWidth;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      pausedRef.current = true;
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    pausedRef.current = true;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || !containerRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    if (Math.abs(delta) > 5) {
      dragRef.current.moved = true;
      setDragging(true);
    }
    if (dragRef.current.moved) {
      containerRef.current.scrollLeft = dragRef.current.scrollLeft - delta;
      handleScrollWrap();
    }
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
    setTimeout(() => setDragging(false), 0);
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
        handlePointerUp();
      }}
      onFocusCapture={() => {
        pausedRef.current = true;
      }}
      onBlurCapture={() => {
        pausedRef.current = false;
      }}
      onTouchStart={() => {
        pausedRef.current = true;
      }}
      onTouchEnd={() => {
        setTimeout(() => {
          pausedRef.current = false;
        }, 1200);
      }}
      onScroll={handleScrollWrap}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`no-scrollbar flex items-stretch gap-3.5 sm:gap-4 overflow-x-auto px-4 sm:px-6 lg:px-8 py-1 ${
        dragging ? 'cursor-grabbing select-none' : 'cursor-grab'
      }`}
    >
      {loopItems.map((anime, idx) => {
        const title = getPrimaryTitle(anime.title);
        const isDuplicate = idx >= items.length;
        return (
          <Link
            key={`${anime.id}-${idx}`}
            to={`/anime/${anime.slug}`}
            aria-hidden={isDuplicate ? true : undefined}
            tabIndex={isDuplicate ? -1 : undefined}
            draggable={false}
            onClick={(e) => {
              if (dragRef.current.moved) {
                e.preventDefault();
                dragRef.current.moved = false;
              }
            }}
            className="group relative w-[148px] sm:w-[172px] aspect-[3/4] shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-[#171722] transition-all duration-200 hover:-translate-y-1 hover:border-[#9B87FF]/75 hover:shadow-[0_12px_28px_-10px_rgba(124,92,255,0.35)]"
          >
            <SafeImage
              src={anime.coverImage?.large || anime.coverImage?.extraLarge || anime.coverImage?.medium}
              alt={isDuplicate ? '' : title}
              fallbackLabel={title}
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090F] via-[#09090F]/25 to-transparent" />
            <div className="absolute inset-x-2.5 bottom-2.5 z-10 space-y-0.5">
              <p className="text-xs font-semibold text-[#F5F3FF] line-clamp-1 group-hover:text-[#9B87FF] transition-colors">
                {title}
              </p>
              <div className="flex items-center justify-between gap-1.5 text-[10px] text-[#A5A1B5] tabular-nums">
                <span className="truncate">{formatFormat(anime.format)}</span>
                {typeof anime.malScore === 'number' && (
                  <span className="inline-flex items-center gap-0.5 font-mono text-[#9B87FF] shrink-0">
                    <Star className="h-2.5 w-2.5 fill-current" />
                    {formatMalScore(anime.malScore)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
