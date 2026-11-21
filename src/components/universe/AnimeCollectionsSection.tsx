import React, { useState } from 'react';
import { FolderHeart } from 'lucide-react';
import type { CuratedCollection } from '../../types/anime.ts';
import { AnimeCard } from '../anime/AnimeCard.tsx';

interface AnimeCollectionsSectionProps {
  collections: CuratedCollection[];
  featuredCollectionIds?: string[];
}

export function AnimeCollectionsSection({
  collections,
  featuredCollectionIds = [],
}: AnimeCollectionsSectionProps) {
  const ordered = React.useMemo(() => {
    if (!featuredCollectionIds.length) return collections;
    return [...collections].sort((a, b) => {
      const ia = featuredCollectionIds.indexOf(a.id);
      const ib = featuredCollectionIds.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.sortOrder - b.sortOrder;
    });
  }, [collections, featuredCollectionIds]);

  const [selectedId, setSelectedId] = useState<string>(ordered[0]?.id || '');
  const activeCollection =
    ordered.find((c) => c.id === selectedId) || ordered[0] || null;

  if (!activeCollection) return null;

  return (
    <section
      id={`collection-${activeCollection.slug}`}
      aria-labelledby="collections-heading"
      className="space-y-5"
    >
      <div>
        <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
          <FolderHeart className="h-3.5 w-3.5" />
          Curated Shelves
        </p>
        <h2
          id="collections-heading"
          className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
        >
          Official Anime Collections
        </h2>
      </div>

      {/* Collection Selector Buttons */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {ordered.map((col) => {
          const active = col.id === activeCollection.id;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => setSelectedId(col.id)}
              className={`rounded-lg border px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'border-[#9B87FF] bg-[#7C5CFF] text-white'
                  : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-600 dark:text-[#A5A1B5] hover:border-[#9B87FF]'
              }`}
            >
              {col.title}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 dark:border-white/[0.08] pb-3.5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#9B87FF]">
              {activeCollection.themeTag}
            </p>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-[#F5F3FF]">
              {activeCollection.title}
            </h3>
            <p className="text-xs text-zinc-600 dark:text-[#A5A1B5] mt-0.5">
              {activeCollection.subtitle || activeCollection.description}
            </p>
          </div>
          <span className="font-mono text-xs text-zinc-400 tabular-nums">
            {(activeCollection.items || []).length} curated titles
          </span>
        </div>

        {activeCollection.items && activeCollection.items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {activeCollection.items.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} />
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-zinc-500 dark:text-[#A5A1B5]">
            Collection titles are currently syncing from AniList.
          </p>
        )}
      </div>
    </section>
  );
}
