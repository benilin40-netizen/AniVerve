import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  WatchlistEpisodeNotification,
  WatchlistNotificationPreferences,
} from '../types/anime.ts';
import { notificationService } from '../services/notificationService.ts';
import { useAuth } from './AuthContext.tsx';
import { useLibrary } from './LibraryContext.tsx';
import { useToast } from './ToastContext.tsx';

interface NotificationContextValue {
  notifications: WatchlistEpisodeNotification[];
  unreadCount: number;
  monitoredCount: number;
  preferences: WatchlistNotificationPreferences;
  checkedAt: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refreshNotifications: (forceRefresh?: boolean) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  updateNotificationPreferences: (
    patch: Partial<WatchlistNotificationPreferences>
  ) => Promise<void>;
}

const DEFAULT_PREFS: WatchlistNotificationPreferences = {
  includePlanToWatch: true,
  includeOnHold: false,
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { watchlist, watchHistory } = useLibrary();
  const { showToast } = useToast();

  const [notifications, setNotifications] = useState<WatchlistEpisodeNotification[]>([]);
  const [monitoredCount, setMonitoredCount] = useState(0);
  const [preferences, setPreferences] = useState<WatchlistNotificationPreferences>(DEFAULT_PREFS);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const fetchNotifications = useCallback(
    async (forceRefresh = false) => {
      if (!isAuthenticated) {
        setNotifications([]);
        setMonitoredCount(0);
        setCheckedAt(null);
        setError(null);
        hasLoadedOnceRef.current = false;
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!hasLoadedOnceRef.current) {
        setLoading(true);
      } else if (forceRefresh) {
        setRefreshing(true);
      }

      try {
        const res = await notificationService.list({
          refresh: forceRefresh,
          signal: controller.signal,
        });
        setNotifications(res.notifications || []);
        setMonitoredCount(res.monitoredCount || 0);
        setPreferences(res.preferences || DEFAULT_PREFS);
        setCheckedAt(res.checkedAt || new Date().toISOString());
        setError(null);
        hasLoadedOnceRef.current = true;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unable to check episode updates.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated]
  );

  // Sync signature of watchlist + watch history so episode/status changes re-evaluate alerts cleanly
  const librarySyncSignature = useMemo(() => {
    const wlSig = watchlist
      .map((w) => `${w.anilistId}:${w.status}:${w.episodesWatched}`)
      .sort()
      .join('|');
    const histSig = watchHistory
      .slice(0, 20)
      .map((h) => `${h.anilistId}:${h.episodeNumber}`)
      .join('|');
    return `${wlSig}#${histSig}`;
  }, [watchlist, watchHistory]);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setMonitoredCount(0);
      setCheckedAt(null);
      setError(null);
      hasLoadedOnceRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchNotifications(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated, librarySyncSignature, fetchNotifications]);

  // Foreground periodic poll every 5 minutes (pauses automatically when tab is hidden)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchNotifications(false);
      }
    }, 5 * 60 * 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && hasLoadedOnceRef.current) {
        const lastMs = checkedAt ? Date.parse(checkedAt) : 0;
        if (Date.now() - lastMs > 3 * 60 * 1000) {
          void fetchNotifications(false);
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      abortRef.current?.abort();
    };
  }, [isAuthenticated, checkedAt, fetchNotifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!isAuthenticated) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      try {
        const res = await notificationService.markRead({ id });
        setNotifications(res.notifications || []);
        setCheckedAt(res.checkedAt || new Date().toISOString());
      } catch {
        // Keep optimistic read UI; next sync reconciles
      }
    },
    [isAuthenticated]
  );

  const markAllAsRead = useCallback(async () => {
    if (!isAuthenticated || notifications.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      const res = await notificationService.markRead({ all: true });
      setNotifications(res.notifications || []);
      setCheckedAt(res.checkedAt || new Date().toISOString());
      showToast('All episode alerts marked as read.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to mark alerts read.', 'error');
    }
  }, [isAuthenticated, notifications.length, showToast]);

  const dismissNotification = useCallback(
    async (id: string) => {
      if (!isAuthenticated) return;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      try {
        const res = await notificationService.dismiss({ id });
        setNotifications(res.notifications || []);
        setCheckedAt(res.checkedAt || new Date().toISOString());
      } catch {
        void fetchNotifications(false);
      }
    },
    [isAuthenticated, fetchNotifications]
  );

  const clearAllNotifications = useCallback(async () => {
    if (!isAuthenticated || notifications.length === 0) return;
    setNotifications([]);
    try {
      const res = await notificationService.dismiss({ all: true });
      setNotifications(res.notifications || []);
      setCheckedAt(res.checkedAt || new Date().toISOString());
      showToast('Episode alerts cleared.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to clear alerts.', 'error');
      void fetchNotifications(false);
    }
  }, [isAuthenticated, notifications.length, showToast, fetchNotifications]);

  const updateNotificationPreferences = useCallback(
    async (patch: Partial<WatchlistNotificationPreferences>) => {
      if (!isAuthenticated) return;
      setPreferences((prev) => ({ ...prev, ...patch }));
      try {
        const res = await notificationService.updatePreferences(patch);
        setNotifications(res.notifications || []);
        setMonitoredCount(res.monitoredCount || 0);
        setPreferences(res.preferences || DEFAULT_PREFS);
        setCheckedAt(res.checkedAt || new Date().toISOString());
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Failed to update alert preferences.',
          'error'
        );
      }
    },
    [isAuthenticated, showToast]
  );

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0),
    [notifications]
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        monitoredCount,
        preferences,
        checkedAt,
        loading,
        refreshing,
        error,
        refreshNotifications: fetchNotifications,
        markAsRead,
        markAllAsRead,
        dismissNotification,
        clearAllNotifications,
        updateNotificationPreferences,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
