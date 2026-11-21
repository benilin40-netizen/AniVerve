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

const GUEST_STORAGE_KEY = 'aniverve-guest-library';

interface GuestLibraryStore {
  watchlist: WatchlistItem[];
  favorites: FavoriteItem[];
  watchHistory: WatchHistoryItem[];
  ratings: UserRatingItem[];
}

function readGuestStore(): GuestLibraryStore {
  if (typeof window === 'undefined') {
    return { watchlist: [], favorites: [], watchHistory: [], ratings: [] };
  }
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return { watchlist: [], favorites: [], watchHistory: [], ratings: [] };
    const parsed = JSON.parse(raw) as Partial<GuestLibraryStore>;
    return {
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      watchHistory: Array.isArray(parsed.watchHistory) ? parsed.watchHistory : [],
      ratings: Array.isArray(parsed.ratings) ? parsed.ratings : [],
    };
  } catch {
    return { watchlist: [], favorites: [], watchHistory: [], ratings: [] };
  }
}

function writeGuestStore(store: GuestLibraryStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota issues
  }
}

interface LibraryContextValue {
  watchlist: WatchlistItem[];
  favorites: FavoriteItem[];
  watchHistory: WatchHistoryItem[];
  ratings: UserRatingItem[];
  loading: boolean;
  isGuestMode: boolean;
  guestCount: number;
  refreshLibrary: () => Promise<void>;
  syncGuestToAccount: () => Promise<number>;
  clearGuestLibrary: () => void;
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

  const isGuestMode = !isAuthenticated;
  const guestCount = watchlist.length + favorites.length + watchHistory.length;

  const refreshLibrary = useCallback(async () => {
    if (!isAuthenticated) {
      const local = readGuestStore();
      setWatchlist(local.watchlist);
      setFavorites(local.favorites);
      setWatchHistory(local.watchHistory);
      setRatings(local.ratings);
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

  const clearGuestLibrary = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    if (!isAuthenticated) {
      setWatchlist([]);
      setFavorites([]);
      setWatchHistory([]);
      setRatings([]);
    }
  }, [isAuthenticated]);

  const syncGuestToAccount = useCallback(async (): Promise<number> => {
    if (!isAuthenticated) return 0;
    const guest = readGuestStore();
    const total =
      guest.watchlist.length + guest.favorites.length + guest.watchHistory.length + guest.ratings.length;
    if (total === 0) return 0;

    let synced = 0;
    for (const item of guest.watchlist) {
      try {
        await apiFetch('/api/user/watchlist', {
          method: 'POST',
          body: JSON.stringify({
            anilistId: item.anilistId,
            animeTitle: item.animeTitle,
            animeSlug: item.animeSlug,
            coverImage: item.coverImage,
            totalEpisodes: item.totalEpisodes,
            status: item.status,
            episodesWatched: item.episodesWatched,
            notes: item.notes || undefined,
          }),
        });
        synced += 1;
      } catch {
        // Continue best-effort sync
      }
    }
    for (const fav of guest.favorites) {
      try {
        await apiFetch('/api/user/favorites', {
          method: 'POST',
          body: JSON.stringify({
            anilistId: fav.anilistId,
            animeTitle: fav.animeTitle,
            animeSlug: fav.animeSlug,
            coverImage: fav.coverImage,
          }),
        });
        synced += 1;
      } catch {
        // Ignore
      }
    }
    for (const hist of guest.watchHistory.slice(0, 20)) {
      try {
        await apiFetch('/api/user/history', {
          method: 'POST',
          body: JSON.stringify({
            anilistId: hist.anilistId,
            animeTitle: hist.animeTitle,
            animeSlug: hist.animeSlug,
            coverImage: hist.coverImage,
            episodeNumber: hist.episodeNumber,
            providerKey: hist.providerKey,
            language: hist.language,
            progressSec: hist.progressSec,
            durationSec: hist.durationSec,
            completed: hist.completed,
          }),
        });
        synced += 1;
      } catch {
        // Ignore
      }
    }
    clearGuestLibrary();
    await refreshLibrary();
    return synced;
  }, [isAuthenticated, clearGuestLibrary, refreshLibrary]);

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
        const now = new Date().toISOString();
        const current = readGuestStore();
        const existing = current.watchlist.find((i) => i.anilistId === payload.anilistId);
        const item: WatchlistItem = {
          id: existing?.id || `guest-wl-${payload.anilistId}`,
          userId: 'guest',
          anilistId: payload.anilistId,
          animeTitle: payload.animeTitle,
          animeSlug: payload.animeSlug,
          coverImage: payload.coverImage ?? existing?.coverImage ?? null,
          totalEpisodes: payload.totalEpisodes ?? existing?.totalEpisodes ?? null,
          status: payload.status,
          episodesWatched: payload.episodesWatched ?? existing?.episodesWatched ?? 0,
          notes: payload.notes ?? existing?.notes ?? null,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        const nextWatchlist = [
          item,
          ...current.watchlist.filter((i) => i.anilistId !== payload.anilistId),
        ];
        writeGuestStore({ ...current, watchlist: nextWatchlist });
        setWatchlist(nextWatchlist);
        showToast(`Saved "${payload.animeTitle}" on this device.`, 'success');
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
      if (!isAuthenticated) {
        const current = readGuestStore();
        const nextWatchlist = current.watchlist.filter((i) => i.anilistId !== anilistId);
        writeGuestStore({ ...current, watchlist: nextWatchlist });
        setWatchlist(nextWatchlist);
        showToast('Removed from device watchlist.', 'info');
        return;
      }
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
        const current = readGuestStore();
        const exists = current.favorites.some((f) => f.anilistId === payload.anilistId);
        if (exists) {
          const nextFavs = current.favorites.filter((f) => f.anilistId !== payload.anilistId);
          writeGuestStore({ ...current, favorites: nextFavs });
          setFavorites(nextFavs);
          showToast('Removed from device favorites.', 'info');
          return false;
        }
        const newItem: FavoriteItem = {
          id: `guest-fav-${payload.anilistId}`,
          userId: 'guest',
          anilistId: payload.anilistId,
          animeTitle: payload.animeTitle,
          animeSlug: payload.animeSlug,
          coverImage: payload.coverImage ?? null,
          createdAt: new Date().toISOString(),
        };
        const nextFavs = [newItem, ...current.favorites];
        writeGuestStore({ ...current, favorites: nextFavs });
        setFavorites(nextFavs);
        showToast(`Added "${payload.animeTitle}" to favorites on this device.`, 'success');
        return true;
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
      if (!isAuthenticated) {
        const current = readGuestStore();
        const entry: WatchHistoryItem = {
          id: `guest-hist-${payload.anilistId}-${payload.episodeNumber}`,
          userId: 'guest',
          anilistId: payload.anilistId,
          animeTitle: payload.animeTitle,
          animeSlug: payload.animeSlug,
          coverImage: payload.coverImage ?? null,
          episodeNumber: payload.episodeNumber,
          providerKey: payload.providerKey,
          language: payload.language,
          progressSec: payload.progressSec ?? 0,
          durationSec: payload.durationSec ?? 0,
          completed: Boolean(payload.completed),
          watchedAt: new Date().toISOString(),
        };
        const nextHist = [
          entry,
          ...current.watchHistory.filter(
            (h) => !(h.anilistId === payload.anilistId && h.episodeNumber === payload.episodeNumber)
          ),
        ].slice(0, 60);
        writeGuestStore({ ...current, watchHistory: nextHist });
        setWatchHistory(nextHist);
        return;
      }
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
        const current = readGuestStore();
        const entry: UserRatingItem = {
          id: `guest-rate-${anilistId}`,
          userId: 'guest',
          anilistId,
          score,
          review: review ?? null,
          updatedAt: new Date().toISOString(),
        };
        const nextRatings = [
          entry,
          ...current.ratings.filter((r) => r.anilistId !== anilistId),
        ];
        writeGuestStore({ ...current, ratings: nextRatings });
        setRatings(nextRatings);
        showToast('Rating saved on this device.', 'success');
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
        isGuestMode,
        guestCount,
        refreshLibrary,
        syncGuestToAccount,
        clearGuestLibrary,
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
