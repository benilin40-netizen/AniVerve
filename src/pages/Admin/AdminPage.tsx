import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  CheckCircle2,
  Database,
  Download,
  Eye,
  Film,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Palette,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminNotificationItem,
  AdminSessionInfo,
  CuratedCollection,
  DatabaseBackupInfo,
  ErrorLogEntry,
  HomepageSectionKey,
  HomepageUniverseConfig,
  SecurityLogEntry,
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
import { ProviderManager } from '../../components/admin/ProviderManager.tsx';
import { AdminSignInPanel } from '../../components/admin/AdminSignInPanel.tsx';

type AdminSectionId =
  | 'overview'
  | 'users'
  | 'catalog'
  | 'content'
  | 'providers'
  | 'monitoring'
  | 'database'
  | 'security'
  | 'analytics'
  | 'notifications'
  | 'appearance'
  | 'settings';

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

const SECTION_LABELS: Record<HomepageSectionKey, string> = {
  spotlight: "Today's Anime Spotlight",
  surpriseMe: 'Surprise Me Discovery',
  trendingRankings: 'Trending Right Now (#1–#10)',
  discoveryRadar: 'AniVerve Discovery Radar',
  moodDiscovery: 'Mood-Based Discovery',
  premiereCountdown: 'Season Premiere Countdown',
  collections: 'Official Anime Collections',
  seasonal: 'Popular This Season Grid',
  airing: 'Currently Airing Grid',
  popular: 'All-Time Popular Grid',
  recentlyUpdated: 'Recently Updated Grid',
  faceOff: 'Anime Face-Off Voting',
  characterSpotlight: 'Character Spotlight',
  trailerSpotlight: 'Official Trailer Spotlight',
  upcoming: 'Upcoming Anime Grid',
  movies: 'Latest Anime Movies Grid',
};

interface ActiveAdminSessionRecord {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  current: boolean;
}

interface AnalyticsPayload {
  totals: {
    users: number;
    watchlists: number;
    favorites: number;
    historyEvents: number;
    ratings: number;
    reminders: number;
    userCollections: number;
    faceOffVotes: number;
  };
  statusBreakdown: Record<string, number>;
  topTrackedAnime: Array<{ anilistId: number; title: string; count: number }>;
}

export function AdminPage() {
  useDocumentMeta({ title: 'Admin Control Center · AniVerve' });
  const { logoutAdmin } = useAuth();
  const { showToast } = useToast();

  const [sessionLoading, setSessionLoading] = useState(true);
  const [adminSession, setAdminSession] = useState<AdminSessionInfo | null>(null);
  const [activeSection, setActiveSection] = useState<AdminSectionId>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Core operational datasets
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [overrides, setOverrides] = useState<any[]>([]);
  const [catalogIdInput, setCatalogIdInput] = useState('');
  const [providers, setProviders] = useState<StreamingProvider[]>([]);
  const [playbackTelemetry, setPlaybackTelemetry] = useState<UnifiedPlaybackTelemetry | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  // Extended datasets
  const [universeConfig, setUniverseConfig] = useState<HomepageUniverseConfig | null>(null);
  const [collections, setCollections] = useState<CuratedCollection[]>([]);
  const [adminSessions, setAdminSessions] = useState<ActiveAdminSessionRecord[]>([]);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);

  // Interactive form states
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Visual Editor draft inputs
  const [spotlightOverrideInput, setSpotlightOverrideInput] = useState('');
  const [trailerOverrideInput, setTrailerOverrideInput] = useState('');
  const [newColTitle, setNewColTitle] = useState('');
  const [newColSubtitle, setNewColSubtitle] = useState('');
  const [newColThemeTag, setNewColThemeTag] = useState('Curated');
  const [newColIds, setNewColIds] = useState('');

  // Security password change state
  const [curAdminPwd, setCurAdminPwd] = useState('');
  const [newAdminPwd, setNewAdminPwd] = useState('');
  const [confirmAdminPwd, setConfirmAdminPwd] = useState('');
  const [updatingAdminPwd, setUpdatingAdminPwd] = useState(false);

  // Notification composer state
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifSeverity, setNotifSeverity] = useState<'info' | 'warning' | 'critical'>('info');

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
        apiFetch('/api/admin/overview'),
        apiFetch<{ users: UserProfile[] }>('/api/admin/users'),
        apiFetch<{ overrides: any[] }>('/api/admin/catalog'),
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
        setAdminSession({ authenticated: false, mustChangePassword: false, authMode: 'backend-password' });
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

  const handleAdminPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPwd !== confirmAdminPwd) {
      showToast('New administrator password confirmation does not match.', 'error');
      return;
    }
    setUpdatingAdminPwd(true);
    try {
      const res = await adminAuthService.changePassword(curAdminPwd, newAdminPwd);
      setCurAdminPwd('');
      setNewAdminPwd('');
      setConfirmAdminPwd('');
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
    } finally {
      setUpdatingAdminPwd(false);
    }
  };

  const updateUser = async (id: string, body: any) => {
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

  const handleAddCatalogOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/catalog', {
        method: 'POST',
        body: JSON.stringify({ anilistId: Number(catalogIdInput), featured: true }),
      });
      setCatalogIdInput('');
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

  const moveSection = (index: number, delta: -1 | 1) => {
    if (!universeConfig) return;
    const target = index + delta;
    if (target < 0 || target >= universeConfig.sectionOrder.length) return;
    const nextOrder = [...universeConfig.sectionOrder];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(target, 0, moved);
    setUniverseConfig({ ...universeConfig, sectionOrder: nextOrder });
  };

  const toggleSectionVisibility = (key: HomepageSectionKey) => {
    if (!universeConfig) return;
    const hidden = new Set(universeConfig.hiddenSections);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    setUniverseConfig({ ...universeConfig, hiddenSections: Array.from(hidden) });
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = newColIds
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    try {
      const res = await apiFetch<{ collection: CuratedCollection }>('/api/admin/collections', {
        method: 'POST',
        body: JSON.stringify({
          title: newColTitle,
          subtitle: newColSubtitle,
          themeTag: newColThemeTag,
          anilistIds: ids,
          published: true,
        }),
      });
      setCollections((prev) => [...prev, res.collection]);
      setNewColTitle('');
      setNewColSubtitle('');
      setNewColIds('');
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
      setOverview((prev: any) => (prev ? { ...prev, backups: res.backups } : prev));
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
      showToast(id === 'others' ? 'Revoked all other admin sessions.' : 'Admin session revoked.', 'success');
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

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ notification: AdminNotificationItem }>('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          title: notifTitle,
          message: notifMessage,
          severity: notifSeverity,
          category: 'system',
        }),
      });
      setNotifications((prev) => [res.notification, ...prev]);
      setNotifTitle('');
      setNotifMessage('');
      showToast('Notification logged.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create alert.', 'error');
    }
  };

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          !userSearch.trim() ||
          u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.username.toLowerCase().includes(userSearch.toLowerCase())
      ),
    [users, userSearch]
  );

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

  const apiMetrics: Array<{
    source: string;
    totalCalls: number;
    successCount: number;
    errorCount: number;
    lastLatencyMs: number;
    lastStatus: string;
  }> = overview.cacheStats?.metrics || [];

  const activeUsersCount = users.filter((u) => u.status === 'ACTIVE').length;
  const adminUsersCount = users.filter((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN').length;
  const verifiedUsersCount = users.filter((u) => u.emailVerified).length;
  const unackedNotifs = notifications.filter((n) => !n.acknowledged).length;

  return (
    <div className="animate-av-enter">
      {/* Must Change Initial Auto-Generated Password Warning Banner */}
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
        {/* Mobile Sidebar Toggle Header */}
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

        {/* Left SaaS Admin Sidebar */}
        <aside
          className={`lg:w-64 shrink-0 ${sidebarOpen ? 'block' : 'hidden'} lg:block space-y-3`}
        >
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3.5 space-y-1">
            <div className="px-2.5 py-2 border-b border-zinc-200 dark:border-white/[0.08] mb-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#9B87FF]">
                AniVerve 2.0 Control
              </p>
              <p className="text-sm font-bold text-zinc-900 dark:text-[#F5F3FF]">
                Admin Center
              </p>
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

        {/* Right Main Operational Area */}
        <main className="flex-1 min-w-0 space-y-6">
          {/* 1. OVERVIEW */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
                  Platform Overview
                </h1>
                <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] mt-0.5">
                  Real-time operational health across catalog APIs, database persistence, and Yenime / AniEmbed playback.
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

              {/* Quick Operational Actions */}
              <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                    Quick Actions
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                    Trigger immediate schedule refresh, cache purge, or database snapshot.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/admin/schedule/refresh', { method: 'POST' });
                      showToast('Airing schedule refreshed.', 'success');
                      void loadAll();
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-2 font-medium hover:border-[#9B87FF]"
                  >
                    Refresh Airing Schedule
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/admin/cache/clear', { method: 'POST' });
                      showToast('Server cache cleared.', 'success');
                      void loadAll();
                    }}
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-2 font-medium hover:border-[#9B87FF]"
                  >
                    Clear API Cache
                  </button>
                  <button
                    type="button"
                    disabled={creatingBackup}
                    onClick={() => void handleCreateBackup()}
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
                        const rate =
                          m.totalCalls > 0 ? Math.round((m.successCount / m.totalCalls) * 100) : 100;
                        return (
                          <div key={m.source} className="space-y-1">
                            <div className="flex justify-between">
                              <span className="font-medium text-zinc-900 dark:text-[#F5F3FF]">
                                {m.source}
                              </span>
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
                            <span className="font-medium text-zinc-900 dark:text-[#F5F3FF]">
                              {bar.label}
                            </span>
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
                  {overview.recentActivities?.slice(0, 12).map((act: any) => (
                    <div key={act.id} className="py-2.5 flex flex-wrap justify-between gap-2">
                      <div>
                        <span className="font-semibold text-[#9B87FF]">{act.action}</span>
                        <span className="ml-2 text-zinc-600 dark:text-[#A5A1B5]">
                          target: {act.target}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums text-zinc-500">
                        {new Date(act.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. USER MANAGEMENT */}
          {activeSection === 'users' && (
            <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
                    User Management ({users.length})
                  </h1>
                  <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                    Inspect member accounts, adjust operational status, or remove obsolete records.
                  </p>
                </div>
                <input
                  type="search"
                  placeholder="Search email or username..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs w-64 focus:border-[#9B87FF] focus:outline-none"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-white/[0.08] text-zinc-500 dark:text-[#A5A1B5]">
                      <th className="pb-3 font-medium">Member</th>
                      <th className="pb-3 font-medium">Role</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Joined</th>
                      <th className="pb-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td className="py-3">
                          <p className="font-medium text-zinc-900 dark:text-[#F5F3FF]">{u.username}</p>
                          <p className="text-zinc-500 dark:text-[#A5A1B5]">{u.email}</p>
                        </td>
                        <td className="py-3">
                          <select
                            value={u.role}
                            onChange={(e) => void updateUser(u.id, { role: e.target.value })}
                            className="rounded border border-zinc-200 dark:border-white/[0.1] bg-transparent dark:bg-[#11111B] px-2 py-1 text-xs"
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                          </select>
                        </td>
                        <td className="py-3">
                          <span
                            className={`font-semibold ${
                              u.status === 'ACTIVE' ? 'text-emerald-500' : 'text-rose-500'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="py-3 font-mono tabular-nums text-zinc-500 dark:text-[#A5A1B5]">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() =>
                              void updateUser(u.id, {
                                status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                              })
                            }
                            className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-2.5 py-1 hover:bg-zinc-100 dark:hover:bg-[#20202D]"
                          >
                            {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteUser(u)}
                            className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-rose-500 hover:bg-rose-500/10"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. ANIME CATALOG */}
          {activeSection === 'catalog' && (
            <div className="space-y-6">
              <form
                onSubmit={handleAddCatalogOverride}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5"
              >
                <div className="flex-1 min-w-[240px]">
                  <h1 className="text-lg font-bold text-zinc-900 dark:text-[#F5F3FF]">
                    Feature or Hide AniList Titles
                  </h1>
                  <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                    Pin any AniList ID to the hero showcase or hide an entry from the catalog.
                  </p>
                </div>
                <input
                  type="number"
                  placeholder="AniList ID (e.g. 154587)"
                  value={catalogIdInput}
                  onChange={(e) => setCatalogIdInput(e.target.value)}
                  required
                  className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm w-48 focus:border-[#9B87FF] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
                >
                  Add Catalog Override
                </button>
              </form>

              <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                  Active Catalog Overrides ({overrides.length})
                </h2>
                {overrides.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                    No catalog overrides defined yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {overrides.map((ov) => (
                      <div
                        key={ov.id}
                        className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] text-xs"
                      >
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                            AniList #{ov.anilistId}{' '}
                            {ov.anime?.title?.romaji ? `— ${ov.anime.title.romaji}` : ''}
                          </p>
                          <p className="text-zinc-500 dark:text-[#A5A1B5]">
                            Featured: {ov.featured ? 'Yes' : 'No'} · Hidden:{' '}
                            {ov.hidden ? 'Yes' : 'No'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void refreshCatalogMetadata(ov.anilistId)}
                            className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 hover:border-[#9B87FF]"
                          >
                            Refresh Meta
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleCatalogFlag(ov.anilistId, { featured: !ov.featured })}
                            className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 hover:border-[#9B87FF]"
                          >
                            {ov.featured ? 'Unfeature' : 'Feature'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleCatalogFlag(ov.anilistId, { hidden: !ov.hidden })}
                            className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-rose-500 hover:bg-rose-500/10"
                          >
                            {ov.hidden ? 'Restore Visible' : 'Hide Title'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. CONTENT MANAGEMENT & HOMEPAGE VISUAL EDITOR */}
          {activeSection === 'content' && universeConfig && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 dark:border-white/[0.08] pb-4">
                  <div>
                    <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#9B87FF]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Homepage Visual Editor
                    </p>
                    <h1 className="text-xl font-bold text-zinc-900 dark:text-[#F5F3FF] mt-0.5">
                      Layout, Spotlights &amp; Visual Choreography
                    </h1>
                    <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] mt-0.5">
                      Incremental configuration updates merge cleanly without overwriting existing keys.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setPreviewOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-2 font-medium hover:border-[#9B87FF]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {previewOpen ? 'Close Preview' : 'Live Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void patchUniverseConfig(
                          {
                            saveDraft: true,
                            heroMode: universeConfig.heroMode,
                            announcementBanner: universeConfig.announcementBanner,
                            animeOfTheDayOverrideId: spotlightOverrideInput
                              ? Number(spotlightOverrideInput)
                              : null,
                            featuredTrailerAnimeId: trailerOverrideInput
                              ? Number(trailerOverrideInput)
                              : null,
                            sectionOrder: universeConfig.sectionOrder,
                            hiddenSections: universeConfig.hiddenSections,
                            particleDensity: universeConfig.particleDensity,
                            cardDensity: universeConfig.cardDensity,
                          },
                          'Draft configuration saved.'
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-2 font-medium hover:border-[#9B87FF]"
                    >
                      Save Draft
                    </button>
                    {universeConfig.draft && (
                      <button
                        type="button"
                        onClick={() =>
                          void patchUniverseConfig({ publishDraft: true }, 'Saved draft published live.')
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 font-semibold text-white"
                      >
                        Publish Saved Draft
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void patchUniverseConfig(
                          {
                            heroMode: universeConfig.heroMode,
                            announcementBanner: universeConfig.announcementBanner,
                            animeOfTheDayOverrideId: spotlightOverrideInput
                              ? Number(spotlightOverrideInput)
                              : null,
                            featuredTrailerAnimeId: trailerOverrideInput
                              ? Number(trailerOverrideInput)
                              : null,
                            sectionOrder: universeConfig.sectionOrder,
                            hiddenSections: universeConfig.hiddenSections,
                            particleDensity: universeConfig.particleDensity,
                            cardDensity: universeConfig.cardDensity,
                          },
                          'Homepage changes published live.'
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3.5 py-2 font-semibold text-white"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Publish Live
                    </button>
                    <button
                      type="button"
                      onClick={() => void resetUniverseConfig()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-3 py-2 text-rose-500 hover:bg-rose-500/10"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset
                    </button>
                  </div>
                </div>

                {previewOpen && (
                  <div className="rounded-xl border border-[#9B87FF]/40 bg-[#09090F] p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[#9B87FF] uppercase tracking-wider">
                        Effective Homepage Preview · Hero: {universeConfig.heroMode}
                      </span>
                      <a
                        href="/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline"
                      >
                        Open Live Homepage ↗
                      </a>
                    </div>
                    <p className="text-[#A5A1B5]">
                      Visible Sections in Order:{' '}
                      {universeConfig.sectionOrder
                        .filter((k) => !universeConfig.hiddenSections.includes(k))
                        .map((k) => SECTION_LABELS[k])
                        .join(' → ')}
                    </p>
                  </div>
                )}

                {/* Visual Controls Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <label className="space-y-1.5">
                    <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">Hero Layout Mode</span>
                    <select
                      value={universeConfig.heroMode}
                      onChange={(e) =>
                        setUniverseConfig({
                          ...universeConfig,
                          heroMode: e.target.value as HomepageUniverseConfig['heroMode'],
                        })
                      }
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
                    >
                      <option value="spotlight-slider">Cinematic Spotlight Slider</option>
                      <option value="announcement">Slider + Announcement Banner</option>
                      <option value="minimal">Compact Minimal Header</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">
                      Particle System Density
                    </span>
                    <select
                      value={universeConfig.particleDensity}
                      onChange={(e) =>
                        setUniverseConfig({
                          ...universeConfig,
                          particleDensity: e.target.value as HomepageUniverseConfig['particleDensity'],
                        })
                      }
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
                    >
                      <option value="minimal">Minimal</option>
                      <option value="balanced">Balanced (Recommended)</option>
                      <option value="cinematic">Cinematic</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">
                      Default Card Density
                    </span>
                    <select
                      value={universeConfig.cardDensity}
                      onChange={(e) =>
                        setUniverseConfig({
                          ...universeConfig,
                          cardDensity: e.target.value as HomepageUniverseConfig['cardDensity'],
                        })
                      }
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="compact">Compact</option>
                    </select>
                  </label>
                </div>

                {/* Anime of the Day & Trailer Override */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <label className="space-y-1.5">
                    <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">
                      Today's Anime Spotlight Override (AniList ID — leave blank for automatic daily pick)
                    </span>
                    <input
                      type="number"
                      value={spotlightOverrideInput}
                      onChange={(e) => setSpotlightOverrideInput(e.target.value)}
                      placeholder="Auto daily rotation"
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 font-mono"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">
                      Featured Trailer Spotlight Override (AniList ID)
                    </span>
                    <input
                      type="number"
                      value={trailerOverrideInput}
                      onChange={(e) => setTrailerOverrideInput(e.target.value)}
                      placeholder="Auto first available trailer"
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 font-mono"
                    />
                  </label>
                </div>

                {/* Announcement Banner Editor */}
                <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                      Homepage Announcement Banner
                    </span>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={universeConfig.announcementBanner.enabled}
                        onChange={(e) =>
                          setUniverseConfig({
                            ...universeConfig,
                            announcementBanner: {
                              ...universeConfig.announcementBanner,
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      <span>Enabled</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={universeConfig.announcementBanner.title}
                      onChange={(e) =>
                        setUniverseConfig({
                          ...universeConfig,
                          announcementBanner: {
                            ...universeConfig.announcementBanner,
                            title: e.target.value,
                          },
                        })
                      }
                      placeholder="Banner headline"
                      className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2"
                    />
                    <input
                      type="text"
                      value={universeConfig.announcementBanner.linkUrl || ''}
                      onChange={(e) =>
                        setUniverseConfig({
                          ...universeConfig,
                          announcementBanner: {
                            ...universeConfig.announcementBanner,
                            linkUrl: e.target.value,
                          },
                        })
                      }
                      placeholder="Action route (e.g. /explore)"
                      className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2"
                    />
                  </div>
                  <input
                    type="text"
                    value={universeConfig.announcementBanner.message}
                    onChange={(e) =>
                      setUniverseConfig({
                        ...universeConfig,
                        announcementBanner: {
                          ...universeConfig.announcementBanner,
                          message: e.target.value,
                        },
                      })
                    }
                    placeholder="Announcement message"
                    className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2"
                  />
                </div>

                {/* Section Order & Visibility Controls */}
                <div className="space-y-2.5 text-xs">
                  <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                    Homepage Section Order &amp; Visibility ({universeConfig.sectionOrder.length} modules)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {universeConfig.sectionOrder.map((key, idx) => {
                      const isHidden = universeConfig.hiddenSections.includes(key);
                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                            isHidden
                              ? 'border-zinc-200 dark:border-white/[0.05] opacity-55 bg-zinc-50 dark:bg-[#11111B]/50'
                              : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B]'
                          }`}
                        >
                          <label className="inline-flex items-center gap-2 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!isHidden}
                              onChange={() => toggleSectionVisibility(key)}
                            />
                            <span className="font-mono text-[10px] text-zinc-400">#{idx + 1}</span>
                            <span className="font-medium truncate text-zinc-900 dark:text-[#F5F3FF]">
                              {SECTION_LABELS[key] || key}
                            </span>
                          </label>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveSection(idx, -1)}
                              aria-label={`Move ${key} up`}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-[#20202D] disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === universeConfig.sectionOrder.length - 1}
                              onClick={() => moveSection(idx, 1)}
                              aria-label={`Move ${key} down`}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-[#20202D] disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Curated Collections CRUD */}
              <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                  Official Curated Collections ({collections.length})
                </h2>

                <form
                  onSubmit={handleCreateCollection}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs"
                >
                  <input
                    type="text"
                    required
                    value={newColTitle}
                    onChange={(e) => setNewColTitle(e.target.value)}
                    placeholder="Collection Title"
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
                  />
                  <input
                    type="text"
                    value={newColSubtitle}
                    onChange={(e) => setNewColSubtitle(e.target.value)}
                    placeholder="Subtitle / Description"
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
                  />
                  <input
                    type="text"
                    value={newColThemeTag}
                    onChange={(e) => setNewColThemeTag(e.target.value)}
                    placeholder="Theme Tag"
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
                  />
                  <input
                    type="text"
                    value={newColIds}
                    onChange={(e) => setNewColIds(e.target.value)}
                    placeholder="AniList IDs (e.g. 154587,21)"
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 font-mono"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 font-semibold text-white"
                  >
                    Add Collection
                  </button>
                </form>

                <div className="divide-y divide-zinc-100 dark:divide-white/[0.06] text-xs">
                  {collections.map((col) => (
                    <div key={col.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                          {col.title}{' '}
                          <span className="font-mono text-[10px] text-[#9B87FF]">
                            [{col.themeTag}]
                          </span>
                        </p>
                        <p className="text-zinc-500 dark:text-[#A5A1B5]">
                          {col.subtitle} · {col.anilistIds.length} AniList IDs
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleCollectionPublished(col)}
                          className={`rounded-lg border px-2.5 py-1 font-medium ${
                            col.published
                              ? 'border-emerald-500/40 text-emerald-500'
                              : 'border-zinc-200 dark:border-white/[0.1] text-zinc-400'
                          }`}
                        >
                          {col.published ? 'Published' : 'Unpublished'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCollection(col)}
                          className="p-1.5 text-zinc-400 hover:text-rose-500"
                          aria-label={`Delete ${col.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 5. PROVIDER CONTROL */}
          {activeSection === 'providers' && (
            <ProviderManager
              providers={providers}
              telemetry={playbackTelemetry}
              onReload={loadAll}
            />
          )}

          {/* 6. API MONITORING */}
          {activeSection === 'monitoring' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                      Background Sync Jobs
                    </h2>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch('/api/admin/schedule/refresh', { method: 'POST' });
                        showToast('Schedule sync triggered.', 'success');
                        void loadAll();
                      }}
                      className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 text-xs font-medium hover:border-[#9B87FF]"
                    >
                      Run Schedule Sync
                    </button>
                  </div>
                  <div className="space-y-3">
                    {overview.jobs?.map((j: any) => (
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
                      onClick={async () => {
                        await apiFetch('/api/admin/cache/clear', { method: 'POST' });
                        showToast('System cache cleared.', 'success');
                        void loadAll();
                      }}
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
          )}

          {/* 7. DATABASE CENTER */}
          {activeSection === 'database' && (
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
                      onClick={() => void handleExportJson()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3.5 py-2 font-medium hover:border-[#9B87FF]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export JSON Snapshot
                    </button>
                    <button
                      type="button"
                      disabled={creatingBackup}
                      onClick={() => void handleCreateBackup()}
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
                    <p className="text-zinc-500 dark:text-[#A5A1B5]">Firestore / External Env</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                      {overview.dbHealth?.firestoreConfigured ? 'Firestore Active' : 'Local Mode'}
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
                        <span className="font-mono text-zinc-900 dark:text-[#F5F3FF]">
                          {bk.filename}
                        </span>
                        <span className="font-mono tabular-nums text-zinc-500">
                          {(bk.sizeBytes / 1024).toFixed(1)} KB ·{' '}
                          {new Date(bk.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* 8. SECURITY CENTER */}
          {activeSection === 'security' && (
            <div className="space-y-6">
              <form
                onSubmit={handleAdminPasswordChange}
                className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-amber-400" />
                  <h1 className="text-lg font-bold text-zinc-900 dark:text-[#F5F3FF]">
                    Change Administrator Password
                  </h1>
                </div>
                <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                  Password must be at least 10 characters and include uppercase, lowercase, and
                  numeric characters. Changing your password automatically invalidates all other
                  active admin sessions.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <label className="space-y-1.5">
                    <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">
                      Current Admin Password
                    </span>
                    <input
                      type="password"
                      required
                      value={curAdminPwd}
                      onChange={(e) => setCurAdminPwd(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">
                      New Password (min 10 chars)
                    </span>
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
                    <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">
                      Confirm New Password
                    </span>
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
                      onClick={() => void handleRevokeAdminSession('others')}
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
                          onClick={() => void handleRevokeAdminSession(s.id)}
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
                            className={`font-semibold ${
                              ev.success ? 'text-emerald-500' : 'text-rose-500'
                            }`}
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
          )}

          {/* 9. ANALYTICS */}
          {activeSection === 'analytics' && analytics && (
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
          )}

          {/* 10. NOTIFICATIONS */}
          {activeSection === 'notifications' && (
            <div className="space-y-6">
              <form
                onSubmit={handleCreateNotification}
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
                    onChange={(e) => setNotifSeverity(e.target.value as any)}
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
                              onClick={() => void handleAckNotification(n.id)}
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
          )}

          {/* 11. APPEARANCE */}
          {activeSection === 'appearance' && settings && (
            <form
              onSubmit={saveSettings}
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
          )}

          {/* 12. SYSTEM SETTINGS */}
          {activeSection === 'settings' && settings && (
            <form
              onSubmit={saveSettings}
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
                    onChange={(e) =>
                      setSettings({ ...settings, allowRegistration: e.target.checked })
                    }
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-4 py-3.5">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                      Maintenance Mode Flag
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
                      Indicate scheduled platform maintenance across status checks
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.maintenanceMode}
                    onChange={(e) =>
                      setSettings({ ...settings, maintenanceMode: e.target.checked })
                    }
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
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 px-4 py-2.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  End Admin Session
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
}
