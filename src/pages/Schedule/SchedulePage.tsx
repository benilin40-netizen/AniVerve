import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CalendarPlus, Globe, Play, RefreshCw } from 'lucide-react';
import type { AiringScheduleItem, DataProvenanceMeta } from '../../types/anime.ts';
import { airingScheduleService } from '../../services/airingScheduleService.ts';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import {
  formatLocalReleaseTime,
  getDateKeyInTimezone,
  getSavedScheduleTimezone,
  getWeekdayKeyInTimezone,
  saveScheduleTimezone,
  SCHEDULE_TIMEZONES,
} from '../../utils/countdown.ts';
import { formatStatus } from '../../utils/formatters.ts';
import { CountdownBadge } from '../../components/schedule/CountdownBadge.tsx';
import { SafeImage } from '../../components/common/SafeImage.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { DataStatusBanner } from '../../components/common/DataStatusBanner.tsx';

type ScheduleFilter =
  | 'today'
  | 'all'
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun'
  | 'recent';

const DAY_FILTERS: Array<{ id: ScheduleFilter; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'This Week' },
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
  { id: 'recent', label: 'Aired' },
];

function formatIcsUtc(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function SchedulePage() {
  useDocumentMeta({
    title: 'Live Airing Schedule & Countdowns',
    description:
      'Track exact release times calibrated to Africa/Kampala or your preferred timezone with live countdowns.',
    canonicalPath: '/schedule',
  });

  const [filter, setFilter] = useState<ScheduleFilter>('today');
  const [timezone, setTimezone] = useState<string>(() => getSavedScheduleTimezone());
  const [schedules, setSchedules] = useState<AiringScheduleItem[]>([]);
  const [scheduleMeta, setScheduleMeta] = useState<DataProvenanceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneOptions = useMemo(() => {
    const base = SCHEDULE_TIMEZONES.map((z) => ({ value: z.value as string, label: z.label as string }));
    if (browserTz && !base.some((z) => z.value === browserTz)) {
      base.push({ value: browserTz, label: `Local Browser (${browserTz})` });
    }
    return base;
  }, [browserTz]);

  const fetchSchedule = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const current = Math.floor(Date.now() / 1000);
    try {
      const res = await airingScheduleService.getSchedule(
        {
          start: current - 2 * 86400,
          end: current + 7 * 86400,
          page: 1,
          perPage: 50,
        },
        signal
      );
      if (!signal?.aborted) {
        setSchedules(
          (res.schedules || []).filter(
            (s) => typeof s.airingAt === 'number' && Number.isFinite(s.airingAt) && s.airingAt > 0
          )
        );
        setScheduleMeta(res._meta || null);
      }
    } catch (err: unknown) {
      if (!signal?.aborted && (err as { name?: string })?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Failed to load airing schedule.');
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchSchedule(controller.signal);
    const refreshTimer = setInterval(() => void fetchSchedule(), 5 * 60 * 1000);
    const tickTimer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      controller.abort();
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
    };
  }, []);

  const handleTimezoneChange = (nextTz: string) => {
    const saved = saveScheduleTimezone(nextTz);
    setTimezone(saved);
  };

  const todayKeyInTz = getDateKeyInTimezone(nowSec, timezone);

  const filtered = useMemo(() => {
    if (filter === 'today') {
      return schedules.filter((s) => getDateKeyInTimezone(s.airingAt, timezone) === todayKeyInTz);
    }
    if (filter === 'recent') {
      return schedules
        .filter((s) => s.airingAt <= nowSec)
        .sort((a, b) => b.airingAt - a.airingAt);
    }
    if (filter === 'all') {
      return schedules.filter((s) => s.airingAt >= nowSec - 86400);
    }
    return schedules.filter((s) => getWeekdayKeyInTimezone(s.airingAt, timezone) === filter);
  }, [schedules, filter, timezone, todayKeyInTz, nowSec]);

  const handleExportIcs = () => {
    const targetItems = filtered.length > 0 ? filtered : schedules.slice(0, 30);
    if (targetItems.length === 0) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://aniverve.app';
    const dtstamp = formatIcsUtc(Math.floor(Date.now() / 1000));
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AniVerve//Airing Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:AniVerve Airing Schedule (${timezone})`,
    ];

    for (const item of targetItems) {
      const title = getPrimaryTitle(item.media.title);
      const { dateLabel, timeLabel } = formatLocalReleaseTime(item.airingAt, timezone);
      lines.push(
        'BEGIN:VEVENT',
        `UID:aniverve-${item.media.id}-ep-${item.episode}@aniverve`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${formatIcsUtc(item.airingAt)}`,
        `DTEND:${formatIcsUtc(item.airingAt + 24 * 60)}`,
        `SUMMARY:${escapeIcsText(`${title} · Episode ${item.episode}`)}`,
        `DESCRIPTION:${escapeIcsText(`Watch Episode ${item.episode} on AniVerve (${dateLabel} ${timeLabel} ${timezone}).`)}`,
        `URL:${origin}/watch/${item.media.slug}/${item.episode}`,
        'END:VEVENT'
      );
    }

    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aniverve-schedule-${filter}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-av-enter">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-[#F5F3FF]">
            Airing Schedule
          </h1>
          <p className="text-sm text-zinc-500 dark:text-[#A5A1B5] mt-1">
            AniList broadcast times calibrated to{' '}
            <span className="font-mono text-[#7C5CFF] dark:text-[#9B87FF]">{timezone}</span>
            {scheduleMeta?.fetchedAt && (
              <span className="ml-2 text-xs font-mono opacity-80">
                · Synced {new Date(scheduleMeta.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2 text-xs">
            <Globe className="h-3.5 w-3.5 text-[#9B87FF] shrink-0" />
            <select
              value={timezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
              aria-label="Schedule timezone"
              className="bg-transparent text-zinc-900 dark:text-[#F5F3FF] focus:outline-none"
            >
              {timezoneOptions.map((tz) => (
                <option key={tz.value} value={tz.value} className="dark:bg-[#171722]">
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportIcs}
            disabled={schedules.length === 0}
            className="av-btn-press inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF] disabled:opacity-40 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <CalendarPlus className="h-3.5 w-3.5 text-[#9B87FF]" />
            Export .ics
          </button>

          <button
            type="button"
            onClick={() => void fetchSchedule()}
            className="av-btn-press inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <DataStatusBanner meta={scheduleMeta} onRefresh={() => void fetchSchedule()} />

      {/* Day of the week filter tabs */}
      <div
        role="group"
        aria-label="Filter schedule by day"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-xl bg-zinc-200/70 dark:bg-[#11111B] p-1 border border-zinc-200 dark:border-white/[0.08] max-w-full sm:w-fit"
      >
        {DAY_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`av-btn-press rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
              filter === item.id
                ? 'bg-white dark:bg-[#7C5CFF] text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-600 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading && schedules.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-zinc-200 dark:bg-[#171722] animate-pulse"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
          <p className="text-sm text-rose-500 mb-3">{error}</p>
          <button
            type="button"
            onClick={() => void fetchSchedule()}
            className="rounded-lg bg-[#7C5CFF] px-4 py-2 text-xs font-medium text-white"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title="No episodes scheduled for this day"
          description="Select another day of the week or switch to This Week to browse upcoming broadcasts."
        />
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const title = getPrimaryTitle(item.media.title);
            const { dateLabel, timeLabel } = formatLocalReleaseTime(item.airingAt, timezone);
            const isReleased = item.airingAt <= nowSec;

            return (
              <div
                key={`${item.media.id}-${item.episode}`}
                className="flex items-center gap-4 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3.5 hover:border-[#9B87FF]/60 transition-all duration-200 hover:-translate-y-0.5"
              >
                <Link to={`/anime/${item.media.slug}`} className="shrink-0">
                  <SafeImage
                    src={item.media.coverImage?.large || item.media.coverImage?.medium}
                    alt={title}
                    className="h-20 w-14 rounded-lg object-cover"
                  />
                </Link>

                <div className="min-w-0 flex-1 space-y-1">
                  <Link
                    to={`/anime/${item.media.slug}`}
                    className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] line-clamp-1 hover:text-[#9B87FF] transition-colors"
                  >
                    {title}
                  </Link>
                  <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                    Episode {item.episode} · {formatStatus(item.media.status)}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-[#F5F3FF]/80 tabular-nums">
                    {dateLabel} · {timeLabel}
                  </p>
                </div>

                <div className="text-right shrink-0 space-y-2">
                  <div>
                    <CountdownBadge airingAt={item.airingAt} />
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      to={`/anime/${item.media.slug}`}
                      className="av-btn-press inline-block rounded-md border border-zinc-200 dark:border-white/[0.08] px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                    >
                      Details
                    </Link>
                    {isReleased && (
                      <Link
                        to={`/watch/${item.media.slug}/${item.episode}`}
                        className="av-btn-press inline-flex items-center gap-1 rounded-md bg-[#7C5CFF] hover:bg-[#9B87FF] px-2.5 py-1 text-[11px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                      >
                        <Play className="h-2.5 w-2.5 fill-current" />
                        Watch
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
