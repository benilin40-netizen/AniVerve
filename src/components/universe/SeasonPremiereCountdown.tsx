import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, Bookmark, Check, Clock } from 'lucide-react';
import type { AiringScheduleItem, AnimeSummary, PremiereReminder } from '../../types/anime.ts';
import { universeService } from '../../services/universeService.ts';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat } from '../../utils/formatters.ts';
import { SafeImage } from '../common/SafeImage.tsx';

interface SeasonPremiereCountdownProps {
  airingSchedule: AiringScheduleItem[];
  upcomingAnime: AnimeSummary[];
  featuredPremiereIds?: number[];
}

function formatCountdownParts(targetUnixSec: number, nowSec: number) {
  const diff = Math.max(0, targetUnixSec - nowSec);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export function SeasonPremiereCountdown({
  airingSchedule,
  upcomingAnime,
  featuredPremiereIds = [],
}: SeasonPremiereCountdownProps) {
  const { getWatchlistEntry, upsertWatchlist } = useLibrary();
  const { showToast } = useToast();
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [reminders, setReminders] = useState<PremiereReminder[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    universeService
      .getReminders()
      .then(setReminders)
      .catch(() => {});
  }, []);

  const premieres = useMemo(() => {
    const combined: Array<{
      anime: AnimeSummary;
      airingAt: number;
      episode: number | null;
    }> = [];
    const seen = new Set<number>();

    // Prefer Episode 1 upcoming premieres or upcoming anime with nextAiringEpisode
    for (const sched of airingSchedule) {
      if (sched.airingAt > nowSec && !seen.has(sched.media.id)) {
        if (sched.episode === 1 || upcomingAnime.some((u) => u.id === sched.media.id)) {
          seen.add(sched.media.id);
          combined.push({ anime: sched.media, airingAt: sched.airingAt, episode: sched.episode });
        }
      }
    }

    for (const up of upcomingAnime) {
      if (!seen.has(up.id) && up.nextAiringEpisode && up.nextAiringEpisode.airingAt > nowSec) {
        seen.add(up.id);
        combined.push({
          anime: up,
          airingAt: up.nextAiringEpisode.airingAt,
          episode: up.nextAiringEpisode.episode,
        });
      }
    }

    for (const sched of airingSchedule) {
      if (combined.length >= 6) break;
      if (sched.airingAt > nowSec && !seen.has(sched.media.id)) {
        seen.add(sched.media.id);
        combined.push({ anime: sched.media, airingAt: sched.airingAt, episode: sched.episode });
      }
    }

    if (featuredPremiereIds.length > 0) {
      combined.sort((a, b) => {
        const aFeat = featuredPremiereIds.includes(a.anime.id) ? 0 : 1;
        const bFeat = featuredPremiereIds.includes(b.anime.id) ? 0 : 1;
        return aFeat - bFeat || a.airingAt - b.airingAt;
      });
    } else {
      combined.sort((a, b) => a.airingAt - b.airingAt);
    }

    return combined.slice(0, 4);
  }, [airingSchedule, upcomingAnime, featuredPremiereIds, nowSec]);

  if (premieres.length === 0) return null;

  const reminderSet = new Set(reminders.map((r) => r.anilistId));

  const toggleReminder = async (item: {
    anime: AnimeSummary;
    airingAt: number;
    episode: number | null;
  }) => {
    setSavingId(item.anime.id);
    const title = getPrimaryTitle(item.anime.title);
    try {
      if (reminderSet.has(item.anime.id)) {
        await universeService.removeReminder(item.anime.id);
        setReminders((prev) => prev.filter((r) => r.anilistId !== item.anime.id));
        showToast(`Removed premiere reminder for ${title}`, 'info');
      } else {
        const saved = await universeService.saveReminder({
          anilistId: item.anime.id,
          animeTitle: title,
          animeSlug: item.anime.slug,
          coverImage: item.anime.coverImage?.large || item.anime.coverImage?.medium,
          airingAt: item.airingAt,
          episode: item.episode,
        });
        setReminders((prev) => [saved, ...prev.filter((r) => r.anilistId !== item.anime.id)]);
        showToast(`Saved premiere reminder for ${title}`, 'success');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to update reminder.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section aria-labelledby="premiere-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
            <Clock className="h-3.5 w-3.5" />
            Verified Airing Timestamps
          </p>
          <h2
            id="premiere-heading"
            className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
          >
            Season Premiere Countdown
          </h2>
        </div>

        <Link
          to="/schedule"
          className="text-xs font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:underline"
        >
          Full Airing Schedule
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {premieres.map((entry) => {
          const title = getPrimaryTitle(entry.anime.title);
          const inWatchlist = getWatchlistEntry(entry.anime.id);
          const hasReminder = reminderSet.has(entry.anime.id);
          return (
            <div
              key={entry.anime.id}
              className="flex flex-col sm:flex-row gap-4 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-4"
            >
              <Link
                to={`/anime/${entry.anime.slug}`}
                className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-[#11111B]"
              >
                <SafeImage
                  src={entry.anime.coverImage?.large || entry.anime.coverImage?.medium}
                  alt={title}
                  className="h-full w-full object-cover"
                />
              </Link>

              <div className="min-w-0 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
                    {formatFormat(entry.anime.format)}
                    {entry.episode ? ` · Episode ${entry.episode}` : ' · Premiere'}
                  </p>
                  <Link
                    to={`/anime/${entry.anime.slug}`}
                    className="mt-0.5 block text-base font-bold text-zinc-900 dark:text-[#F5F3FF] truncate hover:text-[#9B87FF]"
                  >
                    {title}
                  </Link>
                  <p className="mt-1.5 font-mono text-sm font-semibold text-[#7C5CFF] dark:text-[#9B87FF] tabular-nums">
                    {formatCountdownParts(entry.airingAt, nowSec)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={savingId === entry.anime.id}
                    onClick={() => toggleReminder(entry)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      hasReminder
                        ? 'border-[#9B87FF] bg-[#7C5CFF] text-white'
                        : 'border-zinc-200 dark:border-white/[0.08] text-zinc-700 dark:text-[#A5A1B5] hover:border-[#9B87FF]'
                    }`}
                  >
                    {hasReminder ? (
                      <>
                        <BellOff className="h-3.5 w-3.5" />
                        Reminder Saved
                      </>
                    ) : (
                      <>
                        <Bell className="h-3.5 w-3.5" />
                        Remind Me
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      upsertWatchlist({
                        anilistId: entry.anime.id,
                        animeTitle: title,
                        animeSlug: entry.anime.slug,
                        coverImage: entry.anime.coverImage?.large || entry.anime.coverImage?.medium,
                        totalEpisodes: entry.anime.episodes,
                        status: inWatchlist ? inWatchlist.status : 'PLAN_TO_WATCH',
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-[#A5A1B5] hover:border-[#9B87FF]"
                  >
                    {inWatchlist ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#9B87FF]" />
                        Tracked
                      </>
                    ) : (
                      <>
                        <Bookmark className="h-3.5 w-3.5" />
                        Watchlist
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
