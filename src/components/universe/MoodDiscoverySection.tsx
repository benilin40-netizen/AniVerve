import React, { useEffect, useState } from 'react';
import {
  Compass,
  Flame,
  HeartHandshake,
  Laugh,
  Loader2,
  Moon,
  Rocket,
  SearchCode,
  Sparkles,
} from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { anilistService } from '../../services/anilistService.ts';
import { AnimeCard } from '../anime/AnimeCard.tsx';

interface MoodPreset {
  key: string;
  label: string;
  subtitle: string;
  genre: string;
  sort: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MOOD_PRESETS: MoodPreset[] = [
  {
    key: 'adventure',
    label: 'Adventure',
    subtitle: 'Grand journeys & uncharted frontiers',
    genre: 'Adventure',
    sort: 'POPULARITY_DESC',
    icon: Compass,
  },
  {
    key: 'mystery',
    label: 'Mystery',
    subtitle: 'Clues, tension & psychological puzzles',
    genre: 'Mystery',
    sort: 'SCORE_DESC',
    icon: SearchCode,
  },
  {
    key: 'comedy',
    label: 'Comedy',
    subtitle: 'Sharp wit & joyful energy',
    genre: 'Comedy',
    sort: 'POPULARITY_DESC',
    icon: Laugh,
  },
  {
    key: 'fantasy',
    label: 'Fantasy',
    subtitle: 'Mythic magic & alternate realms',
    genre: 'Fantasy',
    sort: 'SCORE_DESC',
    icon: Sparkles,
  },
  {
    key: 'relaxation',
    label: 'Relaxation',
    subtitle: 'Warm, soothing slice-of-life pacing',
    genre: 'Slice of Life',
    sort: 'SCORE_DESC',
    icon: Moon,
  },
  {
    key: 'action',
    label: 'Action',
    subtitle: 'High-kinetic choreography & stakes',
    genre: 'Action',
    sort: 'TRENDING_DESC',
    icon: Flame,
  },
  {
    key: 'emotional',
    label: 'Emotional',
    subtitle: 'Deeply resonant character drama',
    genre: 'Drama',
    sort: 'SCORE_DESC',
    icon: HeartHandshake,
  },
  {
    key: 'scifi',
    label: 'Science Fiction',
    subtitle: 'Cybernetics, spacefarers & future worlds',
    genre: 'Sci-Fi',
    sort: 'SCORE_DESC',
    icon: Rocket,
  },
];

export function MoodDiscoverySection() {
  const [selectedMood, setSelectedMood] = useState<MoodPreset>(MOOD_PRESETS[0]);
  const [items, setItems] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    anilistService
      .explore(
        {
          genre: selectedMood.genre,
          sort: selectedMood.sort,
          perPage: 5,
          page: 1,
        },
        controller.signal
      )
      .then((res) => setItems(res.media || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedMood]);

  return (
    <section aria-labelledby="mood-heading" className="space-y-5">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
          Atmosphere Curations
        </p>
        <h2
          id="mood-heading"
          className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
        >
          Discover by Mood
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {MOOD_PRESETS.map((mood) => {
          const Icon = mood.icon;
          const active = mood.key === selectedMood.key;
          return (
            <button
              key={mood.key}
              type="button"
              onClick={() => setSelectedMood(mood)}
              className={`group flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all ${
                active
                  ? 'border-[#9B87FF] bg-[#7C5CFF]/15 text-zinc-900 dark:text-[#F5F3FF] shadow-md shadow-[#7C5CFF]/15'
                  : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-600 dark:text-[#A5A1B5] hover:border-[#9B87FF]/60'
              }`}
            >
              <Icon
                className={`h-4 w-4 ${active ? 'text-[#9B87FF]' : 'text-zinc-400 group-hover:text-[#9B87FF]'}`}
              />
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                  {mood.label}
                </p>
                <p className="text-[10px] leading-snug text-zinc-500 dark:text-[#A5A1B5] line-clamp-2 mt-0.5">
                  {mood.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-[#A5A1B5] gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#9B87FF]" />
          <span>Loading {selectedMood.label} picks...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {items.map((anime) => (
            <AnimeCard key={anime.id} anime={anime} />
          ))}
        </div>
      )}
    </section>
  );
}
