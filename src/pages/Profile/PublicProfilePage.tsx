import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, Play, Share2, User } from 'lucide-react';
import type { WatchlistItem } from '../../types/anime.ts';
import { WATCH_STATUS_LABELS } from '../../config/constants.ts';
import { apiFetch } from '../../services/apiClient.ts';
import { useToast } from '../../context/ToastContext.tsx';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { SafeImage } from '../../components/common/SafeImage.tsx';

interface PublicProfileData {
  profile: {
    username: string;
    avatarUrl?: string | null;
    bio?: string | null;
    createdAt: string;
  };
  stats: {
    watchlistCount: number;
    watchingCount: number;
    completedCount: number;
    favoritesCount: number;
    episodesLogged: number;
  };
  watchlist: WatchlistItem[];
}

export function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { showToast } = useToast();
  const [data, setData] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useDocumentMeta({
    title: username ? `${username}'s Anime List` : 'Member Profile',
    description: username
      ? `Browse ${username}'s public AniVerve anime watchlist and stats.`
      : 'Browse public AniVerve member profile.',
  });

  useEffect(() => {
    if (!username) {
      setError('Invalid username.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiFetch<PublicProfileData>(
      `/api/anime/public-profile/${encodeURIComponent(username)}`
    )
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Profile is unavailable or private.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Profile link copied.', 'success');
    } catch {
      showToast('Unable to copy link.', 'info');
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#9B87FF] border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-lg mx-auto my-12 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-8 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-xl bg-[#7C5CFF]/15 text-[#9B87FF] flex items-center justify-center">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
          Profile Unavailable
        </h1>
        <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
          {error || 'This member profile is set to private or does not exist.'}
        </p>
        <Link
          to="/explore"
          className="inline-flex rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
        >
          Browse Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-av-enter">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl overflow-hidden bg-[#7C5CFF]/15 border border-[#9B87FF]/30 flex items-center justify-center shrink-0">
            {data.profile.avatarUrl ? (
              <SafeImage
                src={data.profile.avatarUrl}
                alt={data.profile.username}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-7 w-7 text-[#7C5CFF] dark:text-[#9B87FF]" />
            )}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
              {data.profile.username}
            </h1>
            {data.profile.bio && (
              <p className="text-xs text-zinc-600 dark:text-[#A5A1B5] mt-1 max-w-xl">
                {data.profile.bio}
              </p>
            )}
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] mt-1">
              Member since {new Date(data.profile.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCopyLink()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]"
        >
          <Share2 className="h-3.5 w-3.5" />
          Share Profile
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        {[
          { label: 'Saved', value: data.stats.watchlistCount },
          { label: 'Watching', value: data.stats.watchingCount },
          { label: 'Completed', value: data.stats.completedCount },
          { label: 'Favorites', value: data.stats.favoritesCount },
          { label: 'Episodes Logged', value: data.stats.episodesLogged },
        ].map((st) => (
          <div
            key={st.label}
            className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-4"
          >
            <p className="text-[11px] uppercase tracking-wider font-mono text-zinc-500 dark:text-[#A5A1B5]">
              {st.label}
            </p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-zinc-900 dark:text-[#F5F3FF]">
              {st.value}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-[#F5F3FF]">
          Public Watchlist ({data.watchlist.length})
        </h2>
        {data.watchlist.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
            No titles listed yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.watchlist.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3"
              >
                <Link to={`/anime/${item.animeSlug}`} className="shrink-0">
                  <SafeImage
                    src={item.coverImage}
                    alt={item.animeTitle}
                    className="h-20 w-14 rounded-lg object-cover"
                  />
                </Link>
                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    to={`/anime/${item.animeSlug}`}
                    className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] line-clamp-1 hover:text-[#9B87FF]"
                  >
                    {item.animeTitle}
                  </Link>
                  <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                    {WATCH_STATUS_LABELS[item.status] || item.status} · {item.episodesWatched}/
                    {item.totalEpisodes || '?'} eps
                  </p>
                </div>
                <Link
                  to={`/watch/${item.animeSlug}/${Math.max(1, item.episodesWatched || 1)}`}
                  aria-label={`Watch ${item.animeTitle}`}
                  className="p-2 text-[#9B87FF] hover:text-white hover:bg-[#7C5CFF] rounded-lg transition-colors"
                >
                  <Play className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
