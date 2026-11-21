import React from 'react';
import { Download } from 'lucide-react';
import type { DatabaseBackupInfo, ErrorLogEntry } from '../../../types/anime.ts';
import type { AdminOverviewPayload, ApiMetricEntry } from './adminTypes.ts';

interface MonitoringTabProps {
  overview: AdminOverviewPayload;
  apiMetrics: ApiMetricEntry[];
  onRefreshSchedule: () => Promise<void>;
  onClearCache: () => Promise<void>;
}

export function MonitoringTab({
  overview,
  apiMetrics,
  onRefreshSchedule,
  onClearCache,
}: MonitoringTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Background Sync Jobs
            </h2>
            <button
              type="button"
              onClick={() => void onRefreshSchedule()}
              className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 text-xs font-medium hover:border-[#9B87FF]"
            >
              Run Schedule Sync
            </button>
          </div>
          <div className="space-y-3">
            {overview.jobs?.map((j) => (
              <div
                key={j.name}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-100 dark:border-white/[0.08] text-xs"
              >
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">{j.name}</p>
                  <p className="text-zinc-500 dark:text-[#A5A1B5]">
                    Last run: {j.lastRunAt ? new Date(j.lastRunAt).toLocaleTimeString() : 'Never'}
                  </p>
                </div>
                <span
                  className={`font-semibold ${
                    j.status === 'ok' ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {j.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Cache &amp; Upstream Diagnostics
            </h2>
            <button
              type="button"
              onClick={() => void onClearCache()}
              className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 text-xs font-medium hover:border-[#9B87FF]"
            >
              Clear Cache
            </button>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between p-3 rounded-xl border border-zinc-100 dark:border-white/[0.08]">
              <span className="text-zinc-500 dark:text-[#A5A1B5]">Active Cache Entries</span>
              <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-[#F5F3FF]">
                {overview.cacheStats?.activeEntries || 0}
              </span>
            </div>
            {apiMetrics.map((m) => (
              <div
                key={m.source}
                className="flex justify-between p-3 rounded-xl border border-zinc-100 dark:border-white/[0.08]"
              >
                <span className="font-medium text-zinc-900 dark:text-[#F5F3FF]">{m.source}</span>
                <span className="font-mono tabular-nums text-zinc-500 dark:text-[#A5A1B5]">
                  {m.successCount} ok / {m.errorCount} err · {m.lastLatencyMs}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
          Persisted Error Logs ({(overview.errorLogs as ErrorLogEntry[] | undefined)?.length || 0})
        </h2>
        {(overview.errorLogs as ErrorLogEntry[] | undefined)?.length ? (
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-xs">
            {(overview.errorLogs as ErrorLogEntry[]).slice(0, 15).map((err) => (
              <div key={err.id} className="py-2.5 flex flex-wrap justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-rose-500">{err.source}</span>
                  {err.route && <span className="ml-2 font-mono text-zinc-500">{err.route}</span>}
                  <span className="ml-2 text-zinc-600 dark:text-[#A5A1B5]">{err.message}</span>
                </div>
                <span className="font-mono tabular-nums text-zinc-500">
                  {new Date(err.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">No backend errors recorded.</p>
        )}
      </div>
    </div>
  );
}

interface DatabaseTabProps {
  overview: AdminOverviewPayload;
  creatingBackup: boolean;
  onExportJson: () => Promise<void>;
  onCreateBackup: () => Promise<void>;
}

export function DatabaseTab({
  overview,
  creatingBackup,
  onExportJson,
  onCreateBackup,
}: DatabaseTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
              Database &amp; Snapshot Center
            </h1>
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Inspect active storage driver health, create disk snapshots, and export JSON dumps.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => void onExportJson()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3.5 py-2 font-medium hover:border-[#9B87FF]"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON Snapshot
            </button>
            <button
              type="button"
              disabled={creatingBackup}
              onClick={() => void onCreateBackup()}
              className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {creatingBackup ? 'Snapshotting...' : 'Create Backup Now'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] p-4">
            <p className="text-zinc-500 dark:text-[#A5A1B5]">Storage Backend Mode</p>
            <p className="mt-1 font-mono text-sm font-bold text-emerald-500">
              {overview.dbHealth?.mode || 'local-json'}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] p-4">
            <p className="text-zinc-500 dark:text-[#A5A1B5]">External Database Env</p>
            <p className="mt-1 font-mono text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              {overview.dbHealth?.firestoreConfigured ? 'Firestore Active' : 'Managed Env'}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] p-4">
            <p className="text-zinc-500 dark:text-[#A5A1B5]">Saved Disk Snapshots</p>
            <p className="mt-1 font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-[#F5F3FF]">
              {(overview.backups as DatabaseBackupInfo[] | undefined)?.length ?? 0}
            </p>
          </div>
        </div>
      </div>

      {(overview.backups as DatabaseBackupInfo[] | undefined)?.length ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
            Snapshot History
          </h2>
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-xs">
            {(overview.backups as DatabaseBackupInfo[]).map((bk) => (
              <div key={bk.filename} className="py-2.5 flex flex-wrap justify-between gap-2">
                <span className="font-mono text-zinc-900 dark:text-[#F5F3FF]">{bk.filename}</span>
                <span className="font-mono tabular-nums text-zinc-500">
                  {(bk.sizeBytes / 1024).toFixed(1)} KB · {new Date(bk.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
