import React, { useState } from 'react';
import { CheckCircle2, Server, ShieldAlert } from 'lucide-react';
import type { AdminNotificationItem, SystemSettings } from '../../../types/anime.ts';

interface NotificationsTabProps {
  notifications: AdminNotificationItem[];
  onCreateNotification: (payload: {
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
  }) => Promise<void>;
  onAckNotification: (id: string) => Promise<void>;
}

export function NotificationsTab({
  notifications,
  onCreateNotification,
  onAckNotification,
}: NotificationsTabProps) {
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifSeverity, setNotifSeverity] = useState<'info' | 'warning' | 'critical'>('info');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreateNotification({
      title: notifTitle,
      message: notifMessage,
      severity: notifSeverity,
    });
    setNotifTitle('');
    setNotifMessage('');
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-3 text-xs"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
          Post Operational Alert / Note
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            value={notifTitle}
            onChange={(e) => setNotifTitle(e.target.value)}
            placeholder="Alert title"
            className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 sm:col-span-2"
          />
          <select
            value={notifSeverity}
            onChange={(e) => setNotifSeverity(e.target.value as 'info' | 'warning' | 'critical')}
            className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
          >
            <option value="info">Severity: Info</option>
            <option value="warning">Severity: Warning</option>
            <option value="critical">Severity: Critical</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            required
            value={notifMessage}
            onChange={(e) => setNotifMessage(e.target.value)}
            placeholder="Operational details or provider incident message..."
            className="flex-1 min-w-[240px] rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 font-semibold text-white"
          >
            Record Notification
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
          Alert Feed ({notifications.length})
        </h2>
        {notifications.length === 0 ? (
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
            All systems nominal — no active alerts.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-xs">
            {notifications.map((n) => (
              <div key={n.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[10px] uppercase font-bold ${
                        n.severity === 'critical'
                          ? 'text-rose-500'
                          : n.severity === 'warning'
                            ? 'text-amber-400'
                            : 'text-[#9B87FF]'
                      }`}
                    >
                      [{n.severity}]
                    </span>
                    <span className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                      {n.title}
                    </span>
                  </div>
                  <p className="text-zinc-500 dark:text-[#A5A1B5] mt-0.5">{n.message}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono text-zinc-500">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                  {!n.acknowledged && !n.id.startsWith('auto_') && (
                    <button
                      type="button"
                      onClick={() => void onAckNotification(n.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-2.5 py-1 hover:border-[#9B87FF]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AppearanceTabProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings | null>>;
  onSaveSettings: (e?: React.FormEvent) => Promise<void>;
}

export function AppearanceTab({ settings, setSettings, onSaveSettings }: AppearanceTabProps) {
  return (
    <form
      onSubmit={(e) => void onSaveSettings(e)}
      className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4 max-w-2xl"
    >
      <h1 className="text-lg font-bold text-zinc-900 dark:text-[#F5F3FF]">
        Platform Branding &amp; SEO Appearance
      </h1>
      <label className="block space-y-1 text-xs">
        <span className="font-medium text-zinc-500 dark:text-[#A5A1B5]">Site Name</span>
        <input
          type="text"
          value={settings.siteName}
          onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <label className="block space-y-1">
          <span className="font-medium text-zinc-500 dark:text-[#A5A1B5]">
            Primary Brand Accent Hex
          </span>
          <input
            type="text"
            value={settings.accentColor}
            onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 font-mono"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-medium text-zinc-500 dark:text-[#A5A1B5]">Logo Image URL</span>
          <input
            type="url"
            value={settings.logoUrl || ''}
            onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
            placeholder="https://..."
            className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
          />
        </label>
      </div>
      <label className="block space-y-1 text-xs">
        <span className="font-medium text-zinc-500 dark:text-[#A5A1B5]">SEO Page Title</span>
        <input
          type="text"
          value={settings.seoTitle}
          onChange={(e) => setSettings({ ...settings, seoTitle: e.target.value })}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1 text-xs">
        <span className="font-medium text-zinc-500 dark:text-[#A5A1B5]">SEO Description</span>
        <textarea
          rows={3}
          value={settings.seoDescription}
          onChange={(e) => setSettings({ ...settings, seoDescription: e.target.value })}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm"
        />
      </label>
      <button
        type="submit"
        className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-5 py-2.5 text-xs font-semibold text-white"
      >
        Save Appearance Settings
      </button>
    </form>
  );
}

interface SettingsTabProps {
  settings: SystemSettings;
  setSettings: React.Dispatch<React.SetStateAction<SystemSettings | null>>;
  onSaveSettings: (e?: React.FormEvent) => Promise<void>;
  onLogout: () => Promise<void>;
}

export function SettingsTab({
  settings,
  setSettings,
  onSaveSettings,
  onLogout,
}: SettingsTabProps) {
  return (
    <form
      onSubmit={(e) => void onSaveSettings(e)}
      className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-5 max-w-2xl"
    >
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-[#9B87FF]" />
        <h1 className="text-lg font-bold text-zinc-900 dark:text-[#F5F3FF]">
          Global System Settings
        </h1>
      </div>

      <div className="space-y-3 text-xs">
        <label className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-4 py-3.5">
          <div>
            <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Allow New Member Registrations
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
              Enable or pause public account creation at /register
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.allowRegistration}
            onChange={(e) => setSettings({ ...settings, allowRegistration: e.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-4 py-3.5">
          <div>
            <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">Maintenance Mode Flag</p>
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
              Indicate scheduled platform maintenance across status checks
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.maintenanceMode}
            onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-200 dark:border-white/[0.08]">
        <button
          type="submit"
          className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-5 py-2.5 text-xs font-semibold text-white"
        >
          Save System Configuration
        </button>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-4 py-2.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          End Admin Session
        </button>
      </div>
    </form>
  );
}
