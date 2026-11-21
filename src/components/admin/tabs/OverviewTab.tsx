import React from 'react';
import type { UnifiedPlaybackTelemetry, UserProfile } from '../../../types/anime.ts';
import type { AdminOverviewPayload, ApiMetricEntry } from './adminTypes.ts';

interface OverviewTabProps {
  overview: AdminOverviewPayload;
  apiMetrics: ApiMetricEntry[];
  users: UserProfile[];
  playbackTelemetry: UnifiedPlaybackTelemetry | null;
  creatingBackup: boolean;
  onRefreshSchedule: () => Promise<void>;
  onClearCache: () => Promise<void>;
  onCreateBackup: () => Promise<void>;
}

export function OverviewTab({
  overview,
  apiMetrics,
  users,
  playbackTelemetry,
  creatingBackup,
  onRefreshSchedule,
  onClearCache,
  onCreateBackup,
}: OverviewTabProps) {
  const activeUsersCount = users.filter((u) => u.status === 'ACTIVE').length;
  const adminUsersCount = users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length;
  const verifiedUsersCount = users.filter((u) => u.emailVerified).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-[#F5F3FF]">Platform Overview</h1>
        <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] mt-0.5">
          Real-time operational health across catalog APIs, database persistence, and streaming playback.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5">
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">Total Users</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-zinc-900 dark:text-[#F5F3FF]">
            {overview.stats.totalUsers}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5">
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">Watchlist Entries</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-zinc-900 dark:text-[#F5F3FF]">
            {overview.stats.totalWatchlistEntries}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5">
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">Watch History Events</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-zinc-900 dark:text-[#F5F3FF]">
            {overview.stats.totalWatchHistory}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5">
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">Active Stream Servers</p>
          <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-500">
            {overview.stats.activeProviders} / {overview.stats.totalProviders}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">Quick Actions</h2>
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
            Trigger immediate schedule refresh, cache purge, or database snapshot.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => void onRefreshSchedule()}
            className="rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-2 font-medium hover:border-[#9B87FF]"
          >
            Refresh Airing Schedule
          </button>
          <button
            type="button"
            onClick={() => void onClearCache()}
            className="rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-2 font-medium hover:border-[#9B87FF]"
          >
            Clear API Cache
          </button>
          <button
            type="button"
            disabled={creatingBackup}
            onClick={() => void onCreateBackup()}
            className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3.5 py-2 font-semibold text-white"
          >
            {creatingBackup ? 'Snapshotting...' : 'Create Backup'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
            Upstream API Reliability
          </h2>
          {apiMetrics.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Telemetry records populate as AniList &amp; Jikan API calls run.
            </p>
          ) : (
            <div className="space-y-3.5 text-xs">
              {apiMetrics.map((m) => {
                const rate = m.totalCalls > 0 ? Math.round((m.successCount / m.totalCalls) * 100) : 100;
                return (
                  <div key={m.source} className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-zinc-900 dark:text-[#F5F3FF]">{m.source}</span>
                      <span className="font-mono tabular-nums text-zinc-500 dark:text-[#A5A1B5]">
                        {rate}% · {m.totalCalls} calls · {m.lastLatencyMs}ms
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-200 dark:bg-[#20202D] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#7C5CFF]"
                        style={{ width: `${Math.max(4, rate)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
            User &amp; Playback Metrics (Failovers: {playbackTelemetry?.failoverCount ?? 0})
          </h2>
          <div className="space-y-3.5 text-xs">
            {[
              {
                label: 'Active Accounts',
                count: activeUsersCount,
                total: Math.max(1, users.length),
                color: 'bg-emerald-500',
              },
              {
                label: 'Verified Emails',
                count: verifiedUsersCount,
                total: Math.max(1, users.length),
                color: 'bg-[#9B87FF]',
              },
              {
                label: 'Admin Operators',
                count: adminUsersCount,
                total: Math.max(1, users.length),
                color: 'bg-amber-500',
              },
            ].map((bar) => {
              const pct = Math.round((bar.count / bar.total) * 100);
              return (
                <div key={bar.label} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-zinc-900 dark:text-[#F5F3FF]">{bar.label}</span>
                    <span className="font-mono tabular-nums text-zinc-500 dark:text-[#A5A1B5]">
                      {bar.count} / {users.length} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-200 dark:bg-[#20202D] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${bar.color}`}
                      style={{ width: `${Math.max(users.length ? 3 : 0, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
          Recent Admin Activity Audit Log
        </h2>
        <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-xs">
          {overview.recentActivities?.slice(0, 12).map((act) => (
            <div key={act.id} className="py-2.5 flex flex-wrap justify-between gap-2">
              <div>
                <span className="font-semibold text-[#9B87FF]">{act.action}</span>
                <span className="ml-2 text-zinc-600 dark:text-[#A5A1B5]">target: {act.target}</span>
              </div>
              <span className="font-mono tabular-nums text-zinc-500">
                {new Date(act.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
