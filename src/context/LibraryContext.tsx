import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type {
  FavoriteItem,
  UserRatingItem,
  WatchHistoryItem,
  WatchlistItem,
  WatchStatus,
} from '../types/anime.ts';
import { apiFetch } from '../services/apiClient.ts';
import { useAuth } from './AuthContext.tsx';
import { useToast } from './ToastContext.tsx';

interface LibraryContextValue {
  watchlist: WatchlistItem[];
  favorites: FavoriteItem[];
  watchHistory: WatchHistoryItem[];
  ratings: UserRatingItem[];
  loading: boolean;
  refreshLibrary: () => Promise<void>;
  upsertWatchlist: (payload: {
    anilistId: number;
    animeTitle: string;
    animeSlug: string;
    coverImage?: string | null;
    totalEpisodes?: number | null;
    status: WatchStatus;
    episodesWatched?: number;
    notes?: string;
  }) => Promise<void>;
  removeWatchlist: (anilistId: number) => Promise<void>;
  toggleFavorite: (payload: {
    anilistId: number;
    animeTitle: string;
    animeSlug: string;
    coverImage?: string | null;
  }) => Promise<boolean>;
  recordHistory: (payload: {
    anilistId: number;
    animeTitle: string;
    animeSlug: string;
    coverImage?: string | null;
    episodeNumber: number;
    providerKey: string;
    language: 'sub' | 'dub';
    progressSec?: number;
    durationSec?: number;
    completed?: boolean;
  }) => Promise<void>;
  saveRating: (anilistId: number, score: number, review?: string) => Promise<void>;
  getWatchlistEntry: (anilistId: number) => WatchlistItem | undefined;
  isFavorited: (anilistId: number) => boolean;
}

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([]);
  const [ratings, setRatings] = useState<UserRatingItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshLibrary = useCallback(async () => {
    if (!isAuthenticated) {
      setWatchlist([]);
      setFavorites([]);
      setWatchHistory([]);
      setRatings([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{
        watchlist: WatchlistItem[];
        favorites: FavoriteItem[];
        watchHistory: WatchHistoryItem[];
        ratings: UserRatingItem[];
      }>('/api/user/library');
      setWatchlist(data.watchlist || []);
      setFavorites(data.favorites || []);
      setWatchHistory(data.watchHistory || []);
      setRatings(data.ratings || []);
    } catch {
      // Keep existing state if transient error
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const upsertWatchlist = useCallback(
    async (payload: {
      anilistId: number;
      animeTitle: string;
      animeSlug: string;
      coverImage?: string | null;
      totalEpisodes?: number | null;
      status: WatchStatus;
      episodesWatched?: number;
      notes?: string;
    }) => {
      if (!isAuthenticated) {
        showToast('Sign in to save anime to your watchlist.', 'info');
        return;
      }
      const res = await apiFetch<{ item: WatchlistItem }>('/api/user/watchlist', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setWatchlist((prev) => {
        const filtered = prev.filter((i) => i.anilistId !== payload.anilistId);
        return [res.item, ...filtered];
      });
      showToast(`Saved "${payload.animeTitle}" to your list.`, 'success');
    },
    [isAuthenticated, showToast]
  );

  const removeWatchlist = useCallback(
    async (anilistId: number) => {
      if (!isAuthenticated) return;
      await apiFetch(`/api/user/watchlist/${anilistId}`, { method: 'DELETE' });
      setWatchlist((prev) => prev.filter((i) => i.anilistId !== anilistId));
      showToast('Removed from watchlist.', 'info');
    },
    [isAuthenticated, showToast]
  );

  const toggleFavorite = useCallback(
    async (payload: {
      anilistId: number;
      animeTitle: string;
      animeSlug: string;
      coverImage?: string | null;
    }) => {
      if (!isAuthenticated) {
        showToast('Sign in to manage favorites.', 'info');
        return false;
      }
      const res = await apiFetch<{ favorited: boolean; item?: FavoriteItem }>(
        '/api/user/favorites',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      if (res.favorited && res.item) {
        setFavorites((prev) => [res.item!, ...prev.filter((f) => f.anilistId !== payload.anilistId)]);
        showToast(`Added "${payload.animeTitle}" to favorites.`, 'success');
      } else {
        setFavorites((prev) => prev.filter((f) => f.anilistId !== payload.anilistId));
        showToast('Removed from favorites.', 'info');
      }
      return res.favorited;
    },
    [isAuthenticated, showToast]
  );

  const recordHistory = useCallback(
    async (payload: {
      anilistId: number;
      animeTitle: string;
      animeSlug: string;
      coverImage?: string | null;
      episodeNumber: number;
      providerKey: string;
      language: 'sub' | 'dub';
      progressSec?: number;
      durationSec?: number;
      completed?: boolean;
    }) => {
      if (!isAuthenticated) return;
      try {
        const res = await apiFetch<{ item: WatchHistoryItem }>('/api/user/history', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setWatchHistory((prev) => [
          res.item,
          ...prev.filter(
            (h) => !(h.anilistId === payload.anilistId && h.episodeNumber === payload.episodeNumber)
          ),
        ]);
      } catch {
        // Non-blocking history save
      }
    },
    [isAuthenticated]
  );

  const saveRating = useCallback(
    async (anilistId: number, score: number, review?: string) => {
      if (!isAuthenticated) {
        showToast('Sign in to rate anime.', 'info');
        return;
      }
      const res = await apiFetch<{ item: UserRatingItem }>('/api/user/rating', {
        method: 'POST',
        body: JSON.stringify({ anilistId, score, review }),
      });
      setRatings((prev) => [res.item, ...prev.filter((r) => r.anilistId !== anilistId)]);
      showToast('Rating saved.', 'success');
    },
    [isAuthenticated, showToast]
  );

  const getWatchlistEntry = useCallback(
    (anilistId: number) => watchlist.find((w) => w.anilistId === anilistId),
    [watchlist]
  );

  const isFavorited = useCallback(
    (anilistId: number) => favorites.some((f) => f.anilistId === anilistId),
    [favorites]
  );

  return (
    <LibraryContext.Provider
      value={{
        watchlist,
        favorites,
        watchHistory,
        ratings,
        loading,
        refreshLibrary,
        upsertWatchlist,
        removeWatchlist,
        toggleFavorite,
        recordHistory,
        saveRating,
        getWatchlistEntry,
        isFavorited,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside LibraryProvider');
  return ctx;
}
