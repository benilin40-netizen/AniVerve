import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Bookmark, Heart, History, Play, Plus, Trash2 } from 'lucide-react';
import type { WatchStatus } from '../../types/anime.ts';
import { WATCH_STATUS_LABELS } from '../../config/constants.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { SafeImage } from '../../components/common/SafeImage.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';

type TabKey = 'ALL' | WatchStatus | 'FAVORITES' | 'HISTORY';

export function WatchlistPage() {
  useDocumentMeta({
    title: 'My Watchlist & Library',
    description: 'Manage your anime watchlist, favorites, Continue Watching queue, and viewing history.',
  });

  const { isAuthenticated, loading: authLoading } = useAuth();
  const {
    watchlist,
    favorites,
    watchHistory,
    upsertWatchlist,
    removeWatchlist,
    toggleFavorite,
  } = useLibrary();
  const { notifications, markAsRead } = useNotifications();

  const [tab, setTab] = useState<TabKey>('ALL');

  const alertByAnimeId = useMemo(() => {
    const map = new Map<number, (typeof notifications)[number]>();
    for (const n of notifications) {
      map.set(n.anilistId, n);
    }
    return map;
  }, [notifications]);

  if (!authLoading && !isAuthenticated) {
    return (
      <EmptyState
        icon={Bookmark}
        title="Sign in to access your Watchlist"
        description="Save anime you are watching, track completed episodes, and resume playback across sessions."
        actionLabel="Sign In"
        actionTo="/login"
      />
    );
  }

  const continueWatching = watchHistory.filter(
    (entry, idx, arr) => arr.findIndex((x) => x.anilistId === entry.anilistId) === idx
  );

  const filteredWatchlist =
    tab === 'ALL' ? watchlist : watchlist.filter((w) => w.status === tab);

  return (
    <div className="space-y-8 animate-av-enter">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-[#F5F3FF]">
          Personal Library
        </h1>
        <p className="text-sm text-zinc-500 dark:text-[#A5A1B5] mt-1 tabular-nums">
          {watchlist.length} saved · {favorites.length} favorites · {watchHistory.length} episodes logged
        </p>
      </div>

      {/* New Episodes From Watchlist Strip */}
      {notifications.length > 0 && (tab === 'ALL' || tab === 'WATCHING' || tab === 'PLAN_TO_WATCH') && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
              <Bell className="h-3.5 w-3.5" />
              New Episodes From Your Watchlist
            </h2>
            <span className="text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
              {notifications.length} {notifications.length === 1 ? 'show updated' : 'shows updated'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {notifications.slice(0, 4).map((alert) => (
              <Link
                key={alert.id}
                to={`/watch/${alert.animeSlug}/${alert.nextUnwatchedEpisode}`}
                onClick={() => {
                  if (!alert.isRead) void markAsRead(alert.id);
                }}
                className="av-btn-press group flex items-center gap-3 rounded-xl border border-[#9B87FF]/35 bg-[#7C5CFF]/[0.06] dark:bg-[#9B87FF]/[0.08] p-3 hover:border-[#9B87FF] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <SafeImage
                  src={alert.coverImage}
                  alt={alert.animeTitle}
                  className="h-14 w-10 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate group-hover:text-[#9B87FF]">
                    {alert.animeTitle}
                  </p>
                  <p className="text-[11px] font-medium text-[#7C5CFF] dark:text-[#9B87FF] tabular-nums mt-0.5">
                    Episode {alert.latestAiredEpisode} aired · Watch Ep {alert.nextUnwatchedEpisode}
                  </p>
                </div>
                <Play className="h-4 w-4 text-[#9B87FF] shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Continue Watching Strip */}
      {continueWatching.length > 0 && tab === 'ALL' && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
            Continue Watching
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {continueWatching.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                to={`/watch/${item.animeSlug}/${item.episodeNumber}`}
                className="av-btn-press group flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3 hover:border-[#9B87FF]/60 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <SafeImage
                  src={item.coverImage}
                  alt={item.animeTitle}
                  className="h-14 w-10 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate group-hover:text-[#9B87FF]">
                    {item.animeTitle}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums mt-0.5">
                    Episode {item.episodeNumber} · {item.language.toUpperCase()}
                  </p>
                </div>
                <Play className="h-4 w-4 text-[#9B87FF] shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Tabs */}
      <div
        role="group"
        aria-label="Filter personal library"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-xl bg-zinc-200/70 dark:bg-[#11111B] p-1 border border-zinc-200 dark:border-white/[0.08] max-w-full sm:w-fit"
      >
        {(
          [
            { id: 'ALL', label: 'All Saved' },
            { id: 'WATCHING', label: 'Watching' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'PLAN_TO_WATCH', label: 'Plan to Watch' },
            { id: 'ON_HOLD', label: 'On Hold' },
            { id: 'DROPPED', label: 'Dropped' },
            { id: 'FAVORITES', label: 'Favorites' },
            { id: 'HISTORY', label: 'Watch History' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`av-btn-press rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
              tab === item.id
                ? 'bg-white dark:bg-[#7C5CFF] text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-600 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'FAVORITES' ? (
        favorites.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No favorites yet"
            description="Mark anime as favorites from any detail page to keep them in this list."
            actionLabel="Browse Anime"
            actionTo="/explore"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {favorites.map((fav) => (
              <div
                key={fav.id}
                className="flex items-center gap-3.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3"
              >
                <Link to={`/anime/${fav.animeSlug}`} className="shrink-0">
                  <SafeImage
                    src={fav.coverImage}
                    alt={fav.animeTitle}
                    className="h-20 w-14 rounded-lg object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/anime/${fav.animeSlug}`}
                    className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] line-clamp-2 hover:text-[#9B87FF]"
                  >
                    {fav.animeTitle}
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    toggleFavorite({
                      anilistId: fav.anilistId,
                      animeTitle: fav.animeTitle,
                      animeSlug: fav.animeSlug,
                      coverImage: fav.coverImage,
                    })
                  }
                  aria-label="Remove favorite"
                  className="p-2 text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : tab === 'HISTORY' ? (
        watchHistory.length === 0 ? (
          <EmptyState
            icon={History}
            title="No watch history recorded"
            description="Episodes you stream through the player will appear here automatically."
            actionLabel="Browse Trending"
            actionTo="/popular"
          />
        ) : (
          <div className="space-y-2.5">
            {watchHistory.map((h) => (
              <Link
                key={h.id}
                to={`/watch/${h.animeSlug}/${h.episodeNumber}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3 hover:border-[#9B87FF]/50 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <SafeImage
                    src={h.coverImage}
                    alt={h.animeTitle}
                    className="h-14 w-10 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate">
                      {h.animeTitle}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                      Episode {h.episodeNumber} · {h.language.toUpperCase()} · {h.providerKey}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-zinc-500 dark:text-[#A5A1B5] hidden sm:inline tabular-nums">
                    {new Date(h.watchedAt).toLocaleDateString()}
                  </span>
                  <Play className="h-4 w-4 text-[#9B87FF]" />
                </div>
              </Link>
            ))}
          </div>
        )
      ) : filteredWatchlist.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No anime in this list yet"
          description="Explore the catalog and bookmark series to track episodes and statuses."
          actionLabel="Browse Catalog"
          actionTo="/explore"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWatchlist.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3.5"
            >
              <Link to={`/anime/${item.animeSlug}`} className="shrink-0">
                <SafeImage
                  src={item.coverImage}
                  alt={item.animeTitle}
                  className="h-24 w-16 rounded-lg object-cover"
                />
              </Link>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    to={`/anime/${item.animeSlug}`}
                    className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] line-clamp-1 hover:text-[#9B87FF]"
                  >
                    {item.animeTitle}
                  </Link>
                  {alertByAnimeId.has(item.anilistId) && (
                    <span className="shrink-0 text-[11px] font-semibold text-[#7C5CFF] dark:text-[#9B87FF] tabular-nums">
                      Ep {alertByAnimeId.get(item.anilistId)!.latestAiredEpisode} out
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={item.status}
                    onChange={(e) =>
                      upsertWatchlist({
                        anilistId: item.anilistId,
                        animeTitle: item.animeTitle,
                        animeSlug: item.animeSlug,
                        coverImage: item.coverImage,
                        totalEpisodes: item.totalEpisodes,
                        status: e.target.value as WatchStatus,
                        episodesWatched: item.episodesWatched,
                      })
                    }
                    aria-label={`Change status for ${item.animeTitle}`}
                    className="rounded-md border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-2 py-1 text-xs text-zinc-800 dark:text-[#F5F3FF] focus:outline-none"
                  >
                    {Object.entries(WATCH_STATUS_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <div className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-600 dark:text-[#A5A1B5]">
                    <span>
                      {item.episodesWatched}/{item.totalEpisodes || '?'} eps
                    </span>
                      <button
                        type="button"
                        onClick={() =>
                          upsertWatchlist({
                            anilistId: item.anilistId,
                            animeTitle: item.animeTitle,
                            animeSlug: item.animeSlug,
                            coverImage: item.coverImage,
                            totalEpisodes: item.totalEpisodes,
                            status:
                              item.totalEpisodes && item.episodesWatched + 1 >= item.totalEpisodes
                                ? 'COMPLETED'
                                : item.status,
                            episodesWatched: item.episodesWatched + 1,
                          })
                        }
                        aria-label="Increment watched episodes"
                        className="av-btn-press rounded bg-zinc-100 dark:bg-[#20202D] p-1.5 hover:bg-[#7C5CFF] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Link
                    to={`/watch/${item.animeSlug}/${
                      alertByAnimeId.get(item.anilistId)?.nextUnwatchedEpisode ||
                      Math.max(1, item.episodesWatched || 1)
                    }`}
                    className="av-btn-press inline-flex items-center gap-1 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3 py-1.5 text-xs font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    {alertByAnimeId.has(item.anilistId)
                      ? `Watch Ep ${alertByAnimeId.get(item.anilistId)!.nextUnwatchedEpisode}`
                      : 'Watch'}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeWatchlist(item.anilistId)}
                    aria-label="Remove from watchlist"
                    className="av-btn-press rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:text-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                  >
                    Remove
                  </button>
                </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
