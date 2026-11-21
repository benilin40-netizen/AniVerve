import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Users } from 'lucide-react';
import type { AnimeCharacterSpotlight } from '../../types/anime.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { SafeImage } from '../common/SafeImage.tsx';

interface CharacterSpotlightProps {
  characters: AnimeCharacterSpotlight[];
}

export function CharacterSpotlight({ characters }: CharacterSpotlightProps) {
  if (!characters || characters.length === 0) return null;

  return (
    <section aria-labelledby="char-spotlight-heading" className="space-y-4">
      <div>
        <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
          <Users className="h-3.5 w-3.5" />
          Iconic Figures
        </p>
        <h2
          id="char-spotlight-heading"
          className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
        >
          Character Spotlight
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {characters.slice(0, 8).map((char) => {
          const primaryAnime = char.anime[0];
          return (
            <div
              key={char.id}
              className="flex flex-col rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] overflow-hidden hover:border-[#9B87FF]/60 transition-colors"
            >
              <div className="flex gap-3.5 p-4 items-center">
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-[#11111B]">
                  <SafeImage
                    src={char.image}
                    alt={char.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-bold text-zinc-900 dark:text-[#F5F3FF] truncate">
                    {char.name}
                  </p>
                  {char.nativeName && (
                    <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] truncate">
                      {char.nativeName}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                    {char.role && <span className="text-[#9B87FF]">{char.role}</span>}
                    {typeof char.favourites === 'number' && (
                      <>
                        {char.role && <span aria-hidden="true">·</span>}
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3 w-3 text-rose-400 fill-current" />
                          {char.favourites.toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {primaryAnime && (
                <div className="mt-auto border-t border-zinc-200 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-[#11111B]/70 px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-500 dark:text-[#A5A1B5] truncate">
                    {getPrimaryTitle(primaryAnime.title)}
                  </span>
                  <Link
                    to={`/anime/${primaryAnime.slug}`}
                    className="shrink-0 font-semibold text-[#7C5CFF] dark:text-[#9B87FF] hover:underline"
                  >
                    Explore
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
