import React, { useState } from 'react';
import { KeyRound, Laptop } from 'lucide-react';
import type { SecurityLogEntry } from '../../../types/anime.ts';
import type {
  ActiveAdminSessionRecord,
  AdminOverviewPayload,
  AnalyticsPayload,
} from './adminTypes.ts';

interface SecurityTabProps {
  overview: AdminOverviewPayload;
  adminSessions: ActiveAdminSessionRecord[];
  onChangePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  onRevokeSession: (id: string) => Promise<void>;
}

export function SecurityTab({
  overview,
  adminSessions,
  onChangePassword,
  onRevokeSession,
}: SecurityTabProps) {
  const [curAdminPwd, setCurAdminPwd] = useState('');
  const [newAdminPwd, setNewAdminPwd] = useState('');
  const [confirmAdminPwd, setConfirmAdminPwd] = useState('');
  const [updatingAdminPwd, setUpdatingAdminPwd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingAdminPwd(true);
    try {
      await onChangePassword(curAdminPwd, newAdminPwd, confirmAdminPwd);
      setCurAdminPwd('');
      setNewAdminPwd('');
      setConfirmAdminPwd('');
    } finally {
      setUpdatingAdminPwd(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-400" />
          <h1 className="text-lg font-bold text-zinc-900 dark:text-[#F5F3FF]">
            Change Administrator Password
          </h1>
        </div>
        <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
          Password must be at least 10 characters and include uppercase, lowercase, and numeric characters.
          Changing your password automatically invalidates all other active admin sessions.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <label className="space-y-1.5">
            <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">Current Admin Password</span>
            <input
              type="password"
              required
              value={curAdminPwd}
              onChange={(e) => setCurAdminPwd(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
            />
          </label>
          <label className="space-y-1.5">
            <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">New Password (min 10 chars)</span>
            <input
              type="password"
              required
              minLength={10}
              value={newAdminPwd}
              onChange={(e) => setNewAdminPwd(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
            />
          </label>
          <label className="space-y-1.5">
            <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">Confirm New Password</span>
            <input
              type="password"
              required
              minLength={10}
              value={confirmAdminPwd}
              onChange={(e) => setConfirmAdminPwd(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={updatingAdminPwd}
          className="rounded-lg bg-amber-500 hover:bg-amber-600 px-5 py-2 text-xs font-semibold text-zinc-950 disabled:opacity-50"
        >
          {updatingAdminPwd ? 'Updating...' : 'Update Administrator Password'}
        </button>
      </form>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-[#9B87FF]" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Active Admin Sessions ({adminSessions.length})
            </h2>
          </div>
          {adminSessions.length > 1 && (
            <button
              type="button"
              onClick={() => void onRevokeSession('others')}
              className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10"
            >
              Revoke All Other Sessions
            </button>
          )}
        </div>

        <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-xs">
          {adminSessions.map((s) => (
            <div key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-zinc-900 dark:text-[#F5F3FF] truncate max-w-xl">
                  {s.current ? 'Current Admin Session · ' : ''}
                  {s.userAgent || 'Browser Session'}
                </p>
                <p className="font-mono tabular-nums text-zinc-500 dark:text-[#A5A1B5]">
                  {s.ipAddress ? `IP ${s.ipAddress} · ` : ''}
                  Issued {new Date(s.createdAt).toLocaleString()} · Expires{' '}
                  {new Date(s.expiresAt).toLocaleString()}
                </p>
              </div>
              {!s.current && (
                <button
                  type="button"
                  onClick={() => void onRevokeSession(s.id)}
                  className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-rose-500 hover:bg-rose-500/10"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
          Security Audit Log ({(overview.securityLogs as SecurityLogEntry[] | undefined)?.length || 0})
        </h2>
        {(overview.securityLogs as SecurityLogEntry[] | undefined)?.length ? (
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-xs">
            {(overview.securityLogs as SecurityLogEntry[]).slice(0, 20).map((ev) => (
              <div key={ev.id} className="py-2.5 flex flex-wrap justify-between gap-2">
                <div>
                  <span
                    className={`font-semibold ${ev.success ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {ev.event}
                  </span>
                  {ev.details && (
                    <span className="ml-2 text-zinc-600 dark:text-[#A5A1B5]">{ev.details}</span>
                  )}
                </div>
                <span className="font-mono tabular-nums text-zinc-500">
                  {ev.ipAddress ? `${ev.ipAddress} · ` : ''}
                  {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">No security events logged yet.</p>
        )}
      </div>
    </div>
  );
}

export function AnalyticsTab({ analytics }: { analytics: AnalyticsPayload }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Members', value: analytics.totals.users },
          { label: 'Watchlist Records', value: analytics.totals.watchlists },
          { label: 'Favorites Saved', value: analytics.totals.favorites },
          { label: 'Episode Plays', value: analytics.totals.historyEvents },
          { label: 'Member Ratings', value: analytics.totals.ratings },
          { label: 'Premiere Reminders', value: analytics.totals.reminders },
          { label: 'User Collections', value: analytics.totals.userCollections },
          { label: 'Face-Off Votes', value: analytics.totals.faceOffVotes },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5"
          >
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">{m.label}</p>
            <p className="text-2xl font-bold font-mono tabular-nums mt-1 text-zinc-900 dark:text-[#F5F3FF]">
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
            Watchlist Status Distribution
          </h2>
          <div className="space-y-3 text-xs">
            {Object.entries(analytics.statusBreakdown).map(([status, count]) => {
              const pct =
                analytics.totals.watchlists > 0
                  ? Math.round((count / analytics.totals.watchlists) * 100)
                  : 0;
              return (
                <div key={status} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-medium text-zinc-900 dark:text-[#F5F3FF]">
                      {status.replace(/_/g, ' ')}
                    </span>
                    <span className="font-mono tabular-nums text-zinc-500">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-200 dark:bg-[#20202D] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#7C5CFF]"
                      style={{ width: `${Math.max(count ? 4 : 0, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
            Most Tracked Anime in Member Watchlists
          </h2>
          {analytics.topTrackedAnime.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Waiting for member watchlist additions.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-xs">
              {analytics.topTrackedAnime.map((item, idx) => (
                <div key={item.anilistId} className="py-2.5 flex justify-between gap-3">
                  <span className="font-medium text-zinc-900 dark:text-[#F5F3FF] truncate">
                    <span className="font-mono text-[#9B87FF] mr-2">#{idx + 1}</span>
                    {item.title}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-500 shrink-0">
                    {item.count} tracked
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
