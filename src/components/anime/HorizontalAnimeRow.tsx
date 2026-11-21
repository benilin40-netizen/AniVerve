import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { useInView } from '../../hooks/useInView.ts';
import { AnimeCard } from './AnimeCard.tsx';
import { SectionHeader } from '../common/SectionHeader.tsx';

interface HorizontalAnimeRowProps {
  id?: string;
  title: string;
  subtitle?: string;
  viewAllTo?: string;
  items: AnimeSummary[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}

export function HorizontalAnimeRow({
  id,
  title,
  subtitle,
  viewAllTo,
  items,
  loading = false,
  error = null,
  onRetry,
  compact = false,
}: HorizontalAnimeRowProps) {
  const { ref: sectionRef, inView } = useInView<HTMLElement>();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ active: boolean; startX: number; scrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });
  const [dragging, setDragging] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 12);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 12);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const el = scrollerRef.current;
    if (!el || typeof window === 'undefined') return;
    window.addEventListener('resize', updateScrollButtons, { passive: true });
    return () => window.removeEventListener('resize', updateScrollButtons);
  }, [items.length, loading, updateScrollButtons]);

  const scrollByStep = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = Math.max(280, Math.floor(el.clientWidth * 0.78));
    el.scrollBy({ left: direction * distance, behavior: 'smooth' });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || !scrollerRef.current) return;
    const delta = e.clientX - dragRef.current.startX;
    if (Math.abs(delta) > 6) {
      dragRef.current.moved = true;
      setDragging(true);
    }
    if (dragRef.current.moved) {
      scrollerRef.current.scrollLeft = dragRef.current.scrollLeft - delta;
    }
  };

  const handlePointerEnd = () => {
    dragRef.current.active = false;
    setTimeout(() => {
      setDragging(false);
      dragRef.current.moved = false;
    }, 0);
  };

  return (
    <section
      ref={sectionRef}
      id={id}
      aria-label={title}
      className={`scroll-mt-24 av-reveal ${inView ? 'av-reveal-visible' : ''} space-y-4`}
    >
      <SectionHeader
        title={title}
        subtitle={subtitle}
        to={viewAllTo}
        linkLabel="View All"
        action={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollByStep(-1)}
                disabled={!canScrollLeft}
                aria-label={`Scroll ${title} left`}
                className="av-btn-press h-8 w-8 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]/55 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollByStep(1)}
                disabled={!canScrollRight}
                aria-label={`Scroll ${title} right`}
                className="av-btn-press h-8 w-8 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]/55 disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {viewAllTo && (
              <Link
                to={viewAllTo}
                className="av-btn-press inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:border-[#9B87FF]/55 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                View All
              </Link>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="flex gap-3.5 sm:gap-4 overflow-hidden">
          {Array.from({ length: 7 }).map((_, idx) => (
            <div
              key={idx}
              className={`${
                compact
                  ? 'w-[146px] sm:w-[162px] md:w-[176px]'
                  : 'w-[158px] sm:w-[178px] md:w-[196px]'
              } shrink-0`}
            >
              <div className="aspect-[3/4] w-full rounded-xl bg-zinc-200 dark:bg-[#171722] av-shimmer" />
              <div className="mt-2.5 h-3.5 w-4/5 rounded bg-zinc-200 dark:bg-[#20202D] av-shimmer" />
              <div className="mt-1.5 h-3 w-3/5 rounded bg-zinc-200 dark:bg-[#171722] av-shimmer" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 px-5 py-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-rose-600 dark:text-rose-300">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="av-btn-press inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-5 py-6 text-xs text-zinc-500 dark:text-[#A5A1B5]">
          No catalog entries are currently available in this category.
        </div>
      ) : (
        <div className="relative">
          {canScrollLeft && (
            <div
              aria-hidden="true"
              className="pointer-events-none hidden sm:block absolute inset-y-0 left-0 w-10 z-10 bg-gradient-to-r from-[#F6F5FA] dark:from-[#09090F] to-transparent transition-opacity duration-200"
            />
          )}
          {canScrollRight && (
            <div
              aria-hidden="true"
              className="pointer-events-none hidden sm:block absolute inset-y-0 right-0 w-10 z-10 bg-gradient-to-l from-[#F6F5FA] dark:from-[#09090F] to-transparent transition-opacity duration-200"
            />
          )}

          <div
            ref={scrollerRef}
            onScroll={updateScrollButtons}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
            onClickCapture={(e) => {
              if (dragRef.current.moved) {
                e.preventDefault();
                e.stopPropagation();
                dragRef.current.moved = false;
              }
            }}
            tabIndex={0}
            aria-label={`${title} anime list`}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                scrollByStep(1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                scrollByStep(-1);
              }
            }}
            className={`no-scrollbar flex gap-3.5 sm:gap-4 overflow-x-auto pb-2 ${
              dragging ? 'cursor-grabbing select-none' : 'cursor-grab scroll-smooth'
            } focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9B87FF]`}
          >
            {items.map((anime, idx) => (
              <div
                key={anime.id}
                style={{ '--av-idx': idx } as React.CSSProperties}
                className={`av-stagger-child ${
                  compact
                    ? 'w-[146px] sm:w-[162px] md:w-[176px]'
                    : 'w-[158px] sm:w-[178px] md:w-[196px]'
                } shrink-0`}
              >
                <AnimeCard anime={anime} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
