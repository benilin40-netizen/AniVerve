import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Database,
  Film,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Palette,
  PlayCircle,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  AdminNotificationItem,
  AdminSessionInfo,
  CuratedCollection,
  DatabaseBackupInfo,
  HomepageUniverseConfig,
  StreamingProvider,
  SystemSettings,
  UnifiedPlaybackTelemetry,
  UserProfile,
} from '../../types/anime.ts';
import { apiFetch } from '../../services/apiClient.ts';
import { adminAuthService } from '../../services/adminAuthService.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { AdminSignInPanel } from '../../components/admin/AdminSignInPanel.tsx';
import type {
  ActiveAdminSessionRecord,
  AdminOverviewPayload,
  AdminSectionId,
  AnalyticsPayload,
  CatalogOverrideRecord,
} from '../../components/admin/tabs/adminTypes.ts';

const OverviewTab = lazy(() =>
  import('../../components/admin/tabs/OverviewTab.tsx').then((m) => ({ default: m.OverviewTab }))
);
const UsersTab = lazy(() =>
  import('../../components/admin/tabs/UsersAndCatalogTabs.tsx').then((m) => ({
    default: m.UsersTab,
  }))
);
const CatalogTab = lazy(() =>
  import('../../components/admin/tabs/UsersAndCatalogTabs.tsx').then((m) => ({
    default: m.CatalogTab,
  }))
);
const ContentEditorTab = lazy(() =>
  import('../../components/admin/tabs/ContentEditorTab.tsx').then((m) => ({
    default: m.ContentEditorTab,
  }))
);
const ProviderManager = lazy(() =>
  import('../../components/admin/ProviderManager.tsx').then((m) => ({
    default: m.ProviderManager,
  }))
);
const MonitoringTab = lazy(() =>
  import('../../components/admin/tabs/MonitoringAndDatabaseTabs.tsx').then((m) => ({
    default: m.MonitoringTab,
  }))
);
const DatabaseTab = lazy(() =>
  import('../../components/admin/tabs/MonitoringAndDatabaseTabs.tsx').then((m) => ({
    default: m.DatabaseTab,
  }))
);
const SecurityTab = lazy(() =>
  import('../../components/admin/tabs/SecurityAndAnalyticsTabs.tsx').then((m) => ({
    default: m.SecurityTab,
  }))
);
const AnalyticsTab = lazy(() =>
  import('../../components/admin/tabs/SecurityAndAnalyticsTabs.tsx').then((m) => ({
    default: m.AnalyticsTab,
  }))
);
const NotificationsTab = lazy(() =>
  import('../../components/admin/tabs/NotificationsAndSettingsTabs.tsx').then((m) => ({
    default: m.NotificationsTab,
  }))
);
const AppearanceTab = lazy(() =>
  import('../../components/admin/tabs/NotificationsAndSettingsTabs.tsx').then((m) => ({
    default: m.AppearanceTab,
  }))
);
const SettingsTab = lazy(() =>
  import('../../components/admin/tabs/NotificationsAndSettingsTabs.tsx').then((m) => ({
    default: m.SettingsTab,
  }))
);

const NAV_ITEMS: Array<{
  id: AdminSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: '1. Overview', icon: LayoutDashboard },
  { id: 'users', label: '2. User Management', icon: Users },
  { id: 'catalog', label: '3. Anime Catalog', icon: Film },
  { id: 'content', label: '4. Content & Visual Editor', icon: Layers },
  { id: 'providers', label: '5. Provider Control', icon: PlayCircle },
  { id: 'monitoring', label: '6. API Monitoring', icon: Activity },
  { id: 'database', label: '7. Database Center', icon: Database },
  { id: 'security', label: '8. Security Center', icon: ShieldCheck },
  { id: 'analytics', label: '9. Analytics', icon: BarChart3 },
  { id: 'notifications', label: '10. Notifications', icon: Bell },
  { id: 'appearance', label: '11. Appearance', icon: Palette },
  { id: 'settings', label: '12. System Settings', icon: Settings },
];

export function AdminPage() {
  useDocumentMeta({
    title: 'Admin Control Center · AniVerve',
    noindex: true,
  });
  const { logoutAdmin } = useAuth();
  const { showToast } = useToast();

  const [sessionLoading, setSessionLoading] = useState(true);
  const [adminSession, setAdminSession] = useState<AdminSessionInfo | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSectionId>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [overrides, setOverrides] = useState<CatalogOverrideRecord[]>([]);
  const [providers, setProviders] = useState<StreamingProvider[]>([]);
  const [playbackTelemetry, setPlaybackTelemetry] = useState<UnifiedPlaybackTelemetry | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  const [universeConfig, setUniverseConfig] = useState<HomepageUniverseConfig | null>(null);
  const [collections, setCollections] = useState<CuratedCollection[]>([]);
  const [adminSessions, setAdminSessions] = useState<ActiveAdminSessionRecord[]>([]);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);

  const [creatingBackup, setCreatingBackup] = useState(false);
  const [spotlightOverrideInput, setSpotlightOverrideInput] = useState('');
  const [trailerOverrideInput, setTrailerOverrideInput] = useState('');

  const checkSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const s = await adminAuthService.getSession();
      setAdminSession(s);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const loadAll = useCallback(async () => {
    try {
      const [
        ov,
        usr,
        cat,
        playbackRes,
        setRes,
        uniRes,
        colRes,
        sessRes,
        notifRes,
        anaRes,
      ] = await Promise.all([
        apiFetch<AdminOverviewPayload>('/api/admin/overview'),
        apiFetch<{ users: UserProfile[] }>('/api/admin/users'),
        apiFetch<{ overrides: CatalogOverrideRecord[] }>('/api/admin/catalog'),
        apiFetch<{ providers: StreamingProvider[]; telemetry: UnifiedPlaybackTelemetry }>(
          '/api/admin/playback-system'
        ),
        apiFetch<{ settings: SystemSettings }>('/api/admin/settings'),
        apiFetch<{ config: HomepageUniverseConfig }>('/api/admin/universe-config'),
        apiFetch<{ collections: CuratedCollection[] }>('/api/admin/collections'),
        apiFetch<{ sessions: ActiveAdminSessionRecord[] }>('/api/admin/sessions'),
        apiFetch<{ notifications: AdminNotificationItem[] }>('/api/admin/notifications'),
        apiFetch<AnalyticsPayload>('/api/admin/analytics'),
      ]);
      setOverview(ov);
      setUsers(usr.users);
      setOverrides(cat.overrides);
      setProviders(playbackRes.providers);
      setPlaybackTelemetry(playbackRes.telemetry);
      setSettings(setRes.settings);
      setUniverseConfig(uniRes.config);
      setSpotlightOverrideInput(
        uniRes.config.animeOfTheDayOverrideId ? String(uniRes.config.animeOfTheDayOverrideId) : ''
      );
      setTrailerOverrideInput(
        uniRes.config.featuredTrailerAnimeId ? String(uniRes.config.featuredTrailerAnimeId) : ''
      );
      setCollections(colRes.collections);
      setAdminSessions(sessRes.sessions);
      setNotifications(notifRes.notifications);
      setAnalytics(anaRes);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load admin console.';
      if (message.toLowerCase().includes('session required') || message.toLowerCase().includes('401')) {
        setAdminSession({
          authenticated: false,
          mustChangePassword: false,
          authMode: 'backend-password',
        });
        return;
      }
      showToast(message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (adminSession?.authenticated) {
      void loadAll();
    }
  }, [adminSession?.authenticated, loadAll]);

  const handleLogout = async () => {
    await logoutAdmin();
    setAdminSession({ authenticated: false, mustChangePassword: false, authMode: 'backend-password' });
    setOverview(null);
    showToast('Signed out of Administrator Console.', 'info');
  };

  const handleAdminPasswordChange = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => {
    if (newPassword !== confirmPassword) {
      showToast('New administrator password confirmation does not match.', 'error');
      return;
    }
    try {
      const res = await adminAuthService.changePassword(currentPassword, newPassword);
      setAdminSession((prev) =>
        prev ? { ...prev, mustChangePassword: res.mustChangePassword, expiresAt: res.expiresAt } : prev
      );
      showToast(
        `Administrator password updated (${res.revokedSessions} previous session(s) invalidated).`,
        'success'
      );
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Password update failed.', 'error');
    }
  };

  const updateUser = async (id: string, body: { role?: string; status?: string }) => {
    try {
      const res = await apiFetch<{ user: UserProfile }>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setUsers((prev) => prev.map((u) => (u.id === id ? res.user : u)));
      showToast('User updated.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update user.', 'error');
    }
  };

  const deleteUser = async (u: UserProfile) => {
    try {
      await apiFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((item) => item.id !== u.id));
      showToast(`Deleted user account ${u.email}.`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to delete user.', 'error');
    }
  };

  const handleAddCatalogOverride = async (anilistId: number) => {
    try {
      await apiFetch('/api/admin/catalog', {
        method: 'POST',
        body: JSON.stringify({ anilistId, featured: true }),
      });
      showToast('Anime added to featured catalog.', 'success');
      void loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to fetch AniList ID.', 'error');
    }
  };

  const toggleCatalogFlag = async (
    anilistId: number,
    patch: { featured?: boolean; hidden?: boolean }
  ) => {
    await apiFetch('/api/admin/catalog', {
      method: 'POST',
      body: JSON.stringify({ anilistId, ...patch }),
    });
    void loadAll();
  };

  const refreshCatalogMetadata = async (anilistId: number) => {
    try {
      await apiFetch(`/api/admin/catalog/${anilistId}/refresh`, { method: 'POST' });
      showToast(`Refreshed AniList cache for ID ${anilistId}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Refresh failed.', 'error');
    }
  };

  const saveSettings = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!settings) return;
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      showToast('Platform settings saved.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save settings.', 'error');
    }
  };

  const patchUniverseConfig = async (
    payload: Partial<HomepageUniverseConfig> & { saveDraft?: boolean; publishDraft?: boolean },
    toastMsg: string
  ) => {
    try {
      const res = await apiFetch<{ config: HomepageUniverseConfig }>('/api/admin/universe-config', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setUniverseConfig(res.config);
      showToast(toastMsg, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update homepage layout.', 'error');
    }
  };

  const resetUniverseConfig = async () => {
    try {
      const res = await apiFetch<{ config: HomepageUniverseConfig }>(
        '/api/admin/universe-config/reset',
        { method: 'POST' }
      );
      setUniverseConfig(res.config);
      setSpotlightOverrideInput('');
      setTrailerOverrideInput('');
      showToast('Homepage Visual Editor reset to factory defaults.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reset failed.', 'error');
    }
  };

  const handleCreateCollection = async (payload: {
    title: string;
    subtitle: string;
    themeTag: string;
    anilistIds: number[];
  }) => {
    try {
      const res = await apiFetch<{ collection: CuratedCollection }>('/api/admin/collections', {
        method: 'POST',
        body: JSON.stringify({ ...payload, published: true }),
      });
      setCollections((prev) => [...prev, res.collection]);
      showToast(`Created curated collection "${res.collection.title}".`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to create collection.', 'error');
    }
  };

  const handleToggleCollectionPublished = async (col: CuratedCollection) => {
    try {
      const res = await apiFetch<{ collection: CuratedCollection }>(
        `/api/admin/collections/${col.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ published: !col.published }),
        }
      );
      setCollections((prev) => prev.map((c) => (c.id === col.id ? res.collection : c)));
      showToast(`${col.title} ${res.collection.published ? 'published' : 'hidden'}.`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const handleDeleteCollection = async (col: CuratedCollection) => {
    try {
      await apiFetch(`/api/admin/collections/${col.id}`, { method: 'DELETE' });
      setCollections((prev) => prev.filter((c) => c.id !== col.id));
      showToast(`Deleted collection "${col.title}".`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await apiFetch<{ backup: DatabaseBackupInfo; backups: DatabaseBackupInfo[] }>(
        '/api/admin/backup',
        { method: 'POST' }
      );
      setOverview((prev) => (prev ? { ...prev, backups: res.backups } : prev));
      showToast(`Backup snapshot created: ${res.backup.filename}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup failed.', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleExportJson = async () => {
    try {
      const snapshot = await apiFetch<Record<string, unknown>>('/api/admin/database/export');
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aniverve-db-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast('Database snapshot exported.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Export failed.', 'error');
    }
  };

  const handleRevokeAdminSession = async (id: string) => {
    try {
      await apiFetch(`/api/admin/sessions/${id}`, { method: 'DELETE' });
      showToast(
        id === 'others' ? 'Revoked all other admin sessions.' : 'Admin session revoked.',
        'success'
      );
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to revoke session.', 'error');
    }
  };

  const handleAckNotification = async (id: string) => {
    try {
      await apiFetch(`/api/admin/notifications/${id}/ack`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, acknowledged: true } : n)));
    } catch {
      // Auto alerts cannot be acked if transient
    }
  };

  const handleCreateNotification = async (payload: {
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
  }) => {
    try {
      const res = await apiFetch<{ notification: AdminNotificationItem }>(
        '/api/admin/notifications',
        {
          method: 'POST',
          body: JSON.stringify({ ...payload, category: 'system' }),
        }
      );
      setNotifications((prev) => [res.notification, ...prev]);
      showToast('Notification logged.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create alert.', 'error');
    }
  };

  if (sessionLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16">
        <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-[#171722] animate-pulse" />
      </div>
    );
  }

  if (!adminSession?.authenticated) {
    return <AdminSignInPanel onSuccess={() => void checkSession()} />;
  }

  if (!overview) {
    return <div className="h-72 rounded-2xl bg-zinc-200 dark:bg-[#171722] animate-pulse" />;
  }

  const apiMetrics = overview.cacheStats?.metrics || [];
  const unackedNotifs = notifications.filter((n) => !n.acknowledged).length;

  return (
    <div className="animate-av-enter">
      {adminSession.mustChangePassword && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-3.5 text-xs text-amber-300">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>Security Action Recommended:</strong> You signed in with the auto-generated initial
              administrator password. Set a permanent administrator password in the Security Center.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveSection('security')}
            className="rounded-lg bg-amber-500 hover:bg-amber-400 px-3.5 py-1.5 font-semibold text-zinc-950 transition-colors"
          >
            Update Password Now
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex lg:hidden items-center justify-between rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#9B87FF]" />
            <span className="text-sm font-bold text-zinc-900 dark:text-[#F5F3FF]">
              AniVerve Admin Center
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-medium"
          >
            <Menu className="h-4 w-4" />
            Menu
          </button>
        </div>

        <aside className={`lg:w-64 shrink-0 ${sidebarOpen ? 'block' : 'hidden'} lg:block space-y-3`}>
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3.5 space-y-1">
            <div className="px-2.5 py-2 border-b border-zinc-200 dark:border-white/[0.08] mb-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#9B87FF]">
                AniVerve Control
              </p>
              <p className="text-sm font-bold text-zinc-900 dark:text-[#F5F3FF]">Admin Center</p>
            </div>

            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors text-left ${
                    active
                      ? 'bg-[#7C5CFF] text-white'
                      : 'text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#20202D] hover:text-zinc-900 dark:hover:text-[#F5F3FF]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5 truncate">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'notifications' && unackedNotifs > 0 && (
                    <span className="font-mono text-[10px] font-bold text-amber-400">
                      {unackedNotifs}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="pt-3 mt-2 border-t border-zinc-200 dark:border-white/[0.08] space-y-1.5">
              <button
                type="button"
                onClick={() => void loadAll()}
                className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#20202D]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Telemetry
              </button>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-500 hover:bg-rose-500/10"
              >
                <LogOut className="h-3.5 w-3.5" />
                Lock Console
              </button>
            </div>
          </div>
        </aside>

        <section aria-label="Admin console panel" className="flex-1 min-w-0 space-y-6">
          <Suspense
            fallback={
              <div className="h-64 rounded-2xl bg-zinc-200 dark:bg-[#171722] animate-pulse" />
            }
          >
            {activeSection === 'overview' && (
              <OverviewTab
                overview={overview}
                apiMetrics={apiMetrics}
                users={users}
                playbackTelemetry={playbackTelemetry}
                creatingBackup={creatingBackup}
                onRefreshSchedule={async () => {
                  await apiFetch('/api/admin/schedule/refresh', { method: 'POST' });
                  showToast('Airing schedule refreshed.', 'success');
                  void loadAll();
                }}
                onClearCache={async () => {
                  await apiFetch('/api/admin/cache/clear', { method: 'POST' });
                  showToast('Server cache cleared.', 'success');
                  void loadAll();
                }}
                onCreateBackup={handleCreateBackup}
              />
            )}

            {activeSection === 'users' && (
              <UsersTab users={users} onUpdateUser={updateUser} onDeleteUser={deleteUser} />
            )}

            {activeSection === 'catalog' && (
              <CatalogTab
                overrides={overrides}
                onAddOverride={handleAddCatalogOverride}
                onToggleFlag={toggleCatalogFlag}
                onRefreshMetadata={refreshCatalogMetadata}
              />
            )}

            {activeSection === 'content' && universeConfig && (
              <ContentEditorTab
                universeConfig={universeConfig}
                setUniverseConfig={setUniverseConfig}
                spotlightOverrideInput={spotlightOverrideInput}
                setSpotlightOverrideInput={setSpotlightOverrideInput}
                trailerOverrideInput={trailerOverrideInput}
                setTrailerOverrideInput={setTrailerOverrideInput}
                collections={collections}
                onPatchUniverseConfig={patchUniverseConfig}
                onResetUniverseConfig={resetUniverseConfig}
                onCreateCollection={handleCreateCollection}
                onToggleCollectionPublished={handleToggleCollectionPublished}
                onDeleteCollection={handleDeleteCollection}
              />
            )}

            {activeSection === 'providers' && (
              <ProviderManager
                providers={providers}
                telemetry={playbackTelemetry}
                onReload={loadAll}
              />
            )}

            {activeSection === 'monitoring' && (
              <MonitoringTab
                overview={overview}
                apiMetrics={apiMetrics}
                onRefreshSchedule={async () => {
                  await apiFetch('/api/admin/schedule/refresh', { method: 'POST' });
                  showToast('Schedule sync triggered.', 'success');
                  void loadAll();
                }}
                onClearCache={async () => {
                  await apiFetch('/api/admin/cache/clear', { method: 'POST' });
                  showToast('System cache cleared.', 'success');
                  void loadAll();
                }}
              />
            )}

            {activeSection === 'database' && (
              <DatabaseTab
                overview={overview}
                creatingBackup={creatingBackup}
                onExportJson={handleExportJson}
                onCreateBackup={handleCreateBackup}
              />
            )}

            {activeSection === 'security' && (
              <SecurityTab
                overview={overview}
                adminSessions={adminSessions}
                onChangePassword={handleAdminPasswordChange}
                onRevokeSession={handleRevokeAdminSession}
              />
            )}

            {activeSection === 'analytics' && analytics && (
              <AnalyticsTab analytics={analytics} />
            )}

            {activeSection === 'notifications' && (
              <NotificationsTab
                notifications={notifications}
                onCreateNotification={handleCreateNotification}
                onAckNotification={handleAckNotification}
              />
            )}

            {activeSection === 'appearance' && settings && (
              <AppearanceTab
                settings={settings}
                setSettings={setSettings}
                onSaveSettings={saveSettings}
              />
            )}

            {activeSection === 'settings' && settings && (
              <SettingsTab
                settings={settings}
                setSettings={setSettings}
                onSaveSettings={saveSettings}
                onLogout={handleLogout}
              />
            )}
          </Suspense>
        </section>
      </div>
    </div>
  );
}
