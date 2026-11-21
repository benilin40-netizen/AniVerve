import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Play,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { WATCH_STATUS_LABELS } from '../../config/constants.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useNotifications } from '../../context/NotificationContext.tsx';
import { formatRelativeDate } from '../../utils/formatters.ts';
import { SafeImage } from '../common/SafeImage.tsx';

function formatAiredAgo(airedAtSec: number | null): string | null {
  if (!airedAtSec || !Number.isFinite(airedAtSec)) return null;
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - airedAtSec);
  if (diffSec < 60) return 'Aired just now';
  if (diffSec < 3600) return `Aired ${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `Aired ${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 30) return `Aired ${days}d ago`;
  return `Aired ${new Date(airedAtSec * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

export function NotificationCenter({ transparentTop = false }: { transparentTop?: boolean }) {
  const { isAuthenticated } = useAuth();
  const {
    notifications,
    unreadCount,
    monitoredCount,
    preferences,
    checkedAt,
    loading,
    refreshing,
    error,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    clearAllNotifications,
    updateNotificationPreferences,
  } = useNotifications();

  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<'unread' | 'all'>('all');
  const [showSettings, setShowSettings] = useState(false);

  // Close popover on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Close on Escape key or outside click
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const displayedNotifications = useMemo(() => {
    if (filterTab === 'unread') {
      return notifications.filter((n) => !n.isRead);
    }
    return notifications;
  }, [notifications, filterTab]);

  if (!isAuthenticated) return null;

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={
          unreadCount > 0
            ? `Episode notifications (${unreadCount} unread)`
            : 'Episode notifications'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`av-btn-press relative rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
          transparentTop
            ? 'text-[#F5F3FF] hover:bg-white/10'
            : 'text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#20202D]'
        } ${open ? 'bg-zinc-100 dark:bg-[#20202D] text-[#7C5CFF] dark:text-[#9B87FF]' : ''}`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#7C5CFF] text-white text-[10px] font-bold font-mono tabular-nums flex items-center justify-center ring-2 ring-white dark:ring-[#09090F]"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Watchlist episode notifications"
          className="av-modal-enter fixed inset-x-3 top-16 sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2.5 sm:w-[420px] max-h-[min(78vh,560px)] flex flex-col rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] shadow-2xl overflow-hidden z-50"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-white/[0.08] flex items-center justify-between gap-2 bg-zinc-50/80 dark:bg-[#11111B]/80">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-[#F5F3FF]">
                  Episode Alerts
                </h2>
                {unreadCount > 0 && (
                  <span className="font-mono text-[11px] font-semibold text-[#7C5CFF] dark:text-[#9B87FF] tabular-nums">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums truncate">
                Tracking {monitoredCount} watchlist {monitoredCount === 1 ? 'show' : 'shows'}
                {checkedAt ? ` · Checked ${formatRelativeDate(checkedAt)}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => void refreshNotifications(true)}
                disabled={refreshing || loading}
                title="Check for new episodes now"
                aria-label="Check for new episodes now"
                className="av-btn-press rounded-lg p-1.5 text-zinc-500 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF] hover:bg-zinc-200/70 dark:hover:bg-[#20202D] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-[#9B87FF]' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                aria-expanded={showSettings}
                aria-label="Notification watchlist filters"
                title="Watchlist alert filters"
                className={`av-btn-press rounded-lg p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  showSettings
                    ? 'bg-[#7C5CFF]/15 text-[#7C5CFF] dark:text-[#9B87FF]'
                    : 'text-zinc-500 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF] hover:bg-zinc-200/70 dark:hover:bg-[#20202D]'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="av-btn-press rounded-lg p-1.5 text-zinc-500 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF] hover:bg-zinc-200/70 dark:hover:bg-[#20202D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Inline Scope Preferences */}
          {showSettings && (
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] space-y-2 text-xs">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                Alert Scope
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-zinc-700 dark:text-[#F5F3FF]">
                    Include Plan to Watch shows
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.includePlanToWatch}
                    onChange={(e) =>
                      void updateNotificationPreferences({
                        includePlanToWatch: e.target.checked,
                      })
                    }
                    className="h-3.5 w-3.5 rounded accent-[#7C5CFF]"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-zinc-700 dark:text-[#F5F3FF]">
                    Include On Hold shows
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.includeOnHold}
                    onChange={(e) =>
                      void updateNotificationPreferences({
                        includeOnHold: e.target.checked,
                      })
                    }
                    className="h-3.5 w-3.5 rounded accent-[#7C5CFF]"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Filter Tabs & Bulk Actions */}
          <div className="px-4 py-2 border-b border-zinc-200 dark:border-white/[0.06] flex items-center justify-between gap-2 text-xs">
            <div className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-[#11111B] p-0.5">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors tabular-nums ${
                  filterTab === 'all'
                    ? 'bg-white dark:bg-[#7C5CFF] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF]'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('unread')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors tabular-nums ${
                  filterTab === 'unread'
                    ? 'bg-white dark:bg-[#7C5CFF] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF]'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            <div className="flex items-center gap-2.5 text-[11px]">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  className="inline-flex items-center gap-1 font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearAllNotifications()}
                  className="font-medium text-zinc-500 dark:text-[#A5A1B5] hover:text-rose-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notification Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-200/80 dark:divide-white/[0.06]">
            {loading && notifications.length === 0 ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="av-shimmer h-16 w-11 rounded-lg bg-zinc-200 dark:bg-[#20202D] shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="av-shimmer h-3.5 w-3/4 rounded bg-zinc-200 dark:bg-[#20202D]" />
                      <div className="av-shimmer h-3 w-1/2 rounded bg-zinc-200 dark:bg-[#20202D]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error && notifications.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-xs text-rose-500">{error}</p>
                <button
                  type="button"
                  onClick={() => void refreshNotifications(true)}
                  className="av-btn-press rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Retry
                </button>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="px-6 py-10 text-center space-y-2.5">
                <div className="mx-auto h-10 w-10 rounded-full bg-zinc-100 dark:bg-[#20202D] flex items-center justify-center text-zinc-400 dark:text-[#A5A1B5]">
                  <BellOff className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                  {monitoredCount === 0
                    ? 'No tracked shows in your watchlist'
                    : filterTab === 'unread' && notifications.length > 0
                      ? 'No unread alerts'
                      : "You're all caught up"}
                </p>
                <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] max-w-xs mx-auto leading-relaxed">
                  {monitoredCount === 0
                    ? 'Add airing series to your Watching or Plan to Watch list to receive episode alerts here.'
                    : filterTab === 'unread' && notifications.length > 0
                      ? 'Switch to All to review previously seen episode releases.'
                      : 'New episodes from shows in your watchlist will appear here automatically when they air.'}
                </p>
                <div className="pt-1">
                  <Link
                    to={monitoredCount === 0 ? '/explore' : '/schedule'}
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:border-[#9B87FF]"
                  >
                    {monitoredCount === 0 ? 'Browse Anime' : 'View Airing Schedule'}
                  </Link>
                </div>
              </div>
            ) : (
              displayedNotifications.map((item) => {
                const airedLabel = formatAiredAgo(item.airedAt);
                const statusLabel = WATCH_STATUS_LABELS[item.watchStatus] || item.watchStatus;

                return (
                  <div
                    key={item.id}
                    className={`group p-3.5 transition-colors ${
                      item.isRead
                        ? 'bg-transparent hover:bg-zinc-50 dark:hover:bg-[#11111B]/60'
                        : 'bg-[#7C5CFF]/[0.05] dark:bg-[#9B87FF]/[0.06] hover:bg-[#7C5CFF]/[0.09] dark:hover:bg-[#9B87FF]/[0.1]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Link
                        to={`/anime/${item.animeSlug}`}
                        onClick={() => {
                          if (!item.isRead) void markAsRead(item.id);
                          setOpen(false);
                        }}
                        className="relative shrink-0"
                      >
                        <SafeImage
                          src={item.coverImage}
                          alt={item.animeTitle}
                          className="h-16 w-11 rounded-lg object-cover bg-zinc-200 dark:bg-[#11111B]"
                        />
                        {!item.isRead && (
                          <span
                            aria-label="Unread"
                            className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-[#7C5CFF] ring-2 ring-white dark:ring-[#171722]"
                          />
                        )}
                      </Link>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/anime/${item.animeSlug}`}
                            onClick={() => {
                              if (!item.isRead) void markAsRead(item.id);
                              setOpen(false);
                            }}
                            className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] line-clamp-1 hover:text-[#7C5CFF] dark:hover:text-[#9B87FF]"
                          >
                            {item.animeTitle}
                          </Link>

                          <div className="flex items-center gap-0.5 shrink-0">
                            {!item.isRead && (
                              <button
                                type="button"
                                onClick={() => void markAsRead(item.id)}
                                title="Mark as read"
                                aria-label={`Mark ${item.animeTitle} episode ${item.latestAiredEpisode} as read`}
                                className="rounded p-1 text-zinc-400 hover:text-[#7C5CFF] dark:hover:text-[#9B87FF] transition-colors"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void dismissNotification(item.id)}
                              title="Dismiss alert"
                              aria-label={`Dismiss notification for ${item.animeTitle}`}
                              className="rounded p-1 text-zinc-400 hover:text-rose-500 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs font-medium text-zinc-700 dark:text-[#DDD8F3] tabular-nums">
                          {item.newEpisodesCount > 1
                            ? `Episode ${item.latestAiredEpisode} is out · ${item.newEpisodesCount} unwatched episodes`
                            : `Episode ${item.latestAiredEpisode} is now available`}
                        </p>

                        <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                          {statusLabel}
                          {airedLabel ? ` · ${airedLabel}` : ''}
                          {` · Progress ${item.episodesWatched}/${item.totalEpisodes || '?'}`}
                        </p>

                        <div className="pt-1 flex items-center gap-2">
                          <Link
                            to={`/watch/${item.animeSlug}/${item.nextUnwatchedEpisode}`}
                            onClick={() => {
                              if (!item.isRead) void markAsRead(item.id);
                              setOpen(false);
                            }}
                            className="av-btn-press inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-2.5 py-1 text-[11px] font-semibold text-white"
                          >
                            <Play className="h-2.5 w-2.5 fill-current" />
                            Watch Ep {item.nextUnwatchedEpisode}
                          </Link>
                          <Link
                            to={`/anime/${item.animeSlug}`}
                            onClick={() => {
                              if (!item.isRead) void markAsRead(item.id);
                              setOpen(false);
                            }}
                            className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF]"
                          >
                            Details
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-[#11111B]/80 flex items-center justify-between text-[11px]">
            <Link
              to="/watchlist"
              onClick={() => setOpen(false)}
              className="font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:underline"
            >
              Manage Watchlist
            </Link>
            <Link
              to="/schedule"
              onClick={() => setOpen(false)}
              className="font-medium text-zinc-500 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF]"
            >
              Airing Schedule
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
