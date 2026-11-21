import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Bell,
  CheckCircle2,
  EyeOff,
  FolderPlus,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Palette,
  Play,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import type {
  AnimeSummary,
  PremiereReminder,
  UniverseVisualTheme,
  UserCollection,
  UserSessionInfo,
} from '../../types/anime.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { authService } from '../../services/authService.ts';
import { universeService } from '../../services/universeService.ts';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import {
  getSavedScheduleTimezone,
  saveScheduleTimezone,
  SCHEDULE_TIMEZONES,
} from '../../utils/countdown.ts';
import { SafeImage } from '../../components/common/SafeImage.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { AnimeCard } from '../../components/anime/AnimeCard.tsx';

const VISUAL_THEMES: Array<{ id: UniverseVisualTheme; label: string; desc: string; swatch: string }> = [
  { id: 'midnight-violet', label: 'Midnight Violet', desc: 'Signature deep obsidian & violet aura', swatch: '#9B87FF' },
  { id: 'obsidian', label: 'Pure Obsidian', desc: 'Minimal monochrome slate contrast', swatch: '#A1A1AA' },
  { id: 'aurora', label: 'Aurora Nebula', desc: 'Cyan & teal atmospheric accents', swatch: '#38BDF8' },
  { id: 'eclipse', label: 'Solar Eclipse', desc: 'Warm crimson ember dusk tones', swatch: '#F43F5E' },
];

const ACCENT_PRESETS = ['#9B87FF', '#7C5CFF', '#38BDF8', '#10B981', '#F43F5E', '#F59E0B'];

export function ProfilePage() {
  useDocumentMeta({ title: 'My Anime Universe & Settings' });
  const { user, isAdminAuthenticated, isAuthenticated, loading, refreshUser, logout, logoutAdmin } =
    useAuth();
  const { watchHistory } = useLibrary();
  const { theme, toggleTheme, preferences, updatePreferences } = useTheme();
  const { showToast } = useToast();

  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [scheduleTz, setScheduleTz] = useState(() => getSavedScheduleTimezone());
  const [autoPlayDefault, setAutoPlayDefault] = useState(() => {
    try {
      return localStorage.getItem('aniverve-autoplay') === '1';
    } catch {
      return false;
    }
  });

  // Universe profile data
  const [summary, setSummary] = useState<{
    stats: {
      watchlistCount: number;
      watchingCount: number;
      completedCount: number;
      favoritesCount: number;
      episodesLogged: number;
      uniqueAnimeWatched: number;
      hoursWatched: number;
      ratingsCount: number;
      averageRating: number | null;
      remindersCount: number;
      collectionsCount: number;
    };
    favoriteGenres: Array<{ genre: string; count: number }>;
    achievements: Array<{
      id: string;
      title: string;
      description: string;
      unlocked: boolean;
      progress: number;
      target: number;
      category: string;
    }>;
    personalizedRecommendations: AnimeSummary[];
  } | null>(null);
  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [reminders, setReminders] = useState<PremiereReminder[]>([]);

  // Create collection state
  const [newColTitle, setNewColTitle] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [newColPrivate, setNewColPrivate] = useState(true);
  const [creatingCol, setCreatingCol] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setLoadingSessions(true);
    try {
      const list = await authService.listSessions();
      setSessions(list);
    } catch {
      // Ignore transient error
    } finally {
      setLoadingSessions(false);
    }
  }, [user]);

  const loadUniverseData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [sum, cols, rems] = await Promise.all([
        universeService.getUserUniverseSummary(),
        universeService.getUserCollections(),
        universeService.getReminders(),
      ]);
      setSummary(sum);
      setCollections(cols);
      setReminders(rems);
    } catch {
      // Keep graceful UI if transient failure
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setAvatarUrl(user.avatarUrl || '');
      setBio(user.bio || '');
      void loadSessions();
    }
    if (isAuthenticated) {
      void loadUniverseData();
    }
  }, [user, isAuthenticated, loadSessions, loadUniverseData]);

  const continueWatching = useMemo(
    () =>
      watchHistory.filter(
        (entry, idx, arr) => arr.findIndex((x) => x.anilistId === entry.anilistId) === idx
      ),
    [watchHistory]
  );

  if (!loading && !isAuthenticated) {
    return (
      <EmptyState
        icon={User}
        title="Sign in to view your Anime Universe"
        description="Access your watch stats, earned achievements, custom collections, premiere reminders, and appearance preferences."
        actionLabel="Sign In"
        actionTo="/login"
      />
    );
  }

  if (!isAuthenticated) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authService.updateProfile({ username, avatarUrl, bio });
      await refreshUser();
      showToast('Profile updated.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrefs = (nextTz: string, nextAutoPlay: boolean) => {
    const saved = saveScheduleTimezone(nextTz);
    setScheduleTz(saved);
    setAutoPlayDefault(nextAutoPlay);
    try {
      localStorage.setItem('aniverve-autoplay', nextAutoPlay ? '1' : '0');
    } catch {
      // Ignore storage errors
    }
    showToast('Playback & timezone preferences saved.', 'success');
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColTitle.trim()) return;
    setCreatingCol(true);
    try {
      const created = await universeService.createUserCollection({
        title: newColTitle.trim(),
        description: newColDesc.trim(),
        isPrivate: newColPrivate,
      });
      setCollections((prev) => [created, ...prev]);
      setNewColTitle('');
      setNewColDesc('');
      showToast(`Collection "${created.title}" created.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to create collection.', 'error');
    } finally {
      setCreatingCol(false);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    try {
      await universeService.deleteUserCollection(id);
      setCollections((prev) => prev.filter((c) => c.id !== id));
      showToast('Collection removed.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to delete collection.', 'error');
    }
  };

  const handleRemoveReminder = async (anilistId: number) => {
    try {
      await universeService.removeReminder(anilistId);
      setReminders((prev) => prev.filter((r) => r.anilistId !== anilistId));
      showToast('Premiere reminder removed.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to remove reminder.', 'error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('New password confirmation does not match.', 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated. Other active sessions were signed out.', 'success');
      await loadSessions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to change password.', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await authService.revokeSession(sessionId);
      showToast(
        sessionId === 'others'
          ? `Signed out ${res.revokedCount} other session(s).`
          : 'Session revoked.',
        'success'
      );
      await loadSessions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to revoke session.', 'error');
    }
  };

  const maxGenreCount = Math.max(1, ...(summary?.favoriteGenres.map((g) => g.count) || [1]));

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-av-enter">
      {/* Identity Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl overflow-hidden bg-[#7C5CFF]/15 border border-[#9B87FF]/30 flex items-center justify-center shrink-0">
            {user?.avatarUrl ? (
              <SafeImage src={user.avatarUrl} alt={user.username} className="h-full w-full object-cover" />
            ) : !user && isAdminAuthenticated ? (
              <Shield className="h-7 w-7 text-amber-400" />
            ) : (
              <User className="h-7 w-7 text-[#7C5CFF] dark:text-[#9B87FF]" />
            )}
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
              {user ? 'My Anime Universe' : 'Administrator Anime Universe'}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
              {user ? user.username : 'Administrator'}
            </h1>
            {user ? (
              <>
                <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                  {user.email} · Joined {new Date(user.createdAt).toLocaleDateString()} ·{' '}
                  {preferences.profilePublic ? 'Public Showcase Enabled' : 'Private Profile'}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs">
                  {user.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-emerald-500">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Email verified
                    </span>
                  ) : (
                    <Link to="/verify-email" className="text-amber-500 hover:underline">
                      Email unverified — Verify now
                    </Link>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                  Browsing site panels under independent Administrator clearance · Full access enabled
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-400">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Independent Admin Session Active</span>
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdminAuthenticated && (
            <Link
              to="/admin"
              className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3.5 py-2 text-xs font-medium text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
            >
              <Shield className="h-3.5 w-3.5" />
              Admin Console
            </Link>
          )}
          <button
            type="button"
            onClick={() => void (user ? logout() : logoutAdmin())}
            className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <LogOut className="h-3.5 w-3.5" />
            {user ? 'Sign Out' : 'Lock Admin Session'}
          </button>
        </div>
      </div>

      {/* Real Account Universe Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          { label: 'Watching', value: summary?.stats.watchingCount ?? 0 },
          { label: 'Completed', value: summary?.stats.completedCount ?? 0 },
          { label: 'Favorites', value: summary?.stats.favoritesCount ?? 0 },
          { label: 'Episodes Logged', value: summary?.stats.episodesLogged ?? 0 },
          { label: 'Hours Watched', value: `${summary?.stats.hoursWatched ?? 0}h` },
          {
            label: 'Avg Rating',
            value: summary?.stats.averageRating != null ? `${summary.stats.averageRating}/10` : '—',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-4"
          >
            <p className="text-[11px] uppercase tracking-wider font-mono text-zinc-500 dark:text-[#A5A1B5]">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-zinc-900 dark:text-[#F5F3FF]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Favorite Genres + Achievements Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Favorite Genres
            </h2>
            <span className="font-mono text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
              Library Affinity
            </span>
          </div>
          {summary?.favoriteGenres && summary.favoriteGenres.length > 0 ? (
            <div className="space-y-3 text-xs">
              {summary.favoriteGenres.map((g) => (
                <div key={g.genre} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-800 dark:text-[#F5F3FF]">{g.genre}</span>
                    <span className="font-mono tabular-nums text-zinc-500 dark:text-[#A5A1B5]">
                      {g.count} {g.count === 1 ? 'title' : 'titles'}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-200 dark:bg-[#20202D] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#7C5CFF] transition-all duration-300"
                      style={{ width: `${Math.round((g.count / maxGenreCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Add titles to your watchlist or favorites to build your genre affinity profile.
            </p>
          )}
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-[#9B87FF]" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                Earned Achievements
              </h2>
            </div>
            <button
              type="button"
              onClick={() =>
                void updatePreferences({ hideAchievements: !preferences.hideAchievements })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 text-xs text-zinc-600 dark:text-[#A5A1B5] hover:border-[#9B87FF]"
            >
              <EyeOff className="h-3.5 w-3.5" />
              {preferences.hideAchievements ? 'Show Achievements' : 'Hide Achievements'}
            </button>
          </div>

          {preferences.hideAchievements ? (
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] py-4">
              Achievement tracking display is currently hidden in your preferences.
            </p>
          ) : summary?.achievements && summary.achievements.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {summary.achievements.map((ach) => {
                const pct = Math.min(100, Math.round((ach.progress / Math.max(1, ach.target)) * 100));
                return (
                  <div
                    key={ach.id}
                    className={`rounded-xl border p-3.5 space-y-2 ${
                      ach.unlocked
                        ? 'border-[#9B87FF]/45 bg-[#7C5CFF]/10'
                        : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                        {ach.title}
                      </span>
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wider ${
                          ach.unlocked ? 'text-emerald-400 font-semibold' : 'text-zinc-500'
                        }`}
                      >
                        {ach.unlocked ? 'Unlocked' : `${ach.progress}/${ach.target}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-[#A5A1B5]">{ach.description}</p>
                    <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-[#20202D] overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          ach.unlocked ? 'bg-emerald-500' : 'bg-[#7C5CFF]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Loading achievement milestones from your account activity...
            </p>
          )}
        </div>
      </div>

      {/* Continue Watching Strip */}
      {continueWatching.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Continue Watching
            </h2>
            <Link to="/watchlist" className="text-xs font-medium text-[#9B87FF] hover:underline">
              Full Watchlist &amp; History
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {continueWatching.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                to={`/watch/${item.animeSlug}/${item.episodeNumber}`}
                className="group flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3 hover:border-[#9B87FF]"
              >
                <SafeImage
                  src={item.coverImage}
                  alt={item.animeTitle}
                  className="h-14 w-10 rounded-lg object-cover shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate group-hover:text-[#9B87FF]">
                    {item.animeTitle}
                  </p>
                  <p className="text-[11px] font-mono text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                    Ep {item.episodeNumber} · {item.language.toUpperCase()}
                  </p>
                </div>
                <Play className="h-4 w-4 text-[#9B87FF] shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Personalized Recommendations */}
      {preferences.personalizationEnabled &&
        summary?.personalizedRecommendations &&
        summary.personalizedRecommendations.length > 0 && (
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#9B87FF]" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                Recommended For Your Universe
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {summary.personalizedRecommendations.slice(0, 5).map((anime) => (
                <AnimeCard key={anime.id} anime={anime} />
              ))}
            </div>
          </div>
        )}

      {/* Private Collections & Premiere Reminders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-[#9B87FF]" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Private Anime Collections ({collections.length})
            </h2>
          </div>

          <form onSubmit={handleCreateCollection} className="space-y-3 border-b border-zinc-200 dark:border-white/[0.08] pb-4">
            <input
              type="text"
              value={newColTitle}
              onChange={(e) => setNewColTitle(e.target.value)}
              placeholder="Collection title (e.g. Autumn Cyber Picks)"
              required
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs focus:border-[#9B87FF] focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newColDesc}
                onChange={(e) => setNewColDesc(e.target.value)}
                placeholder="Optional notes or mood"
                className="flex-1 min-w-[160px] rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs focus:border-[#9B87FF] focus:outline-none"
              />
              <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-[#A5A1B5]">
                <input
                  type="checkbox"
                  checked={newColPrivate}
                  onChange={(e) => setNewColPrivate(e.target.checked)}
                />
                <Lock className="h-3 w-3" />
                Private
              </label>
              <button
                type="submit"
                disabled={creatingCol}
                className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {creatingCol ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>

          {collections.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Create personal shelves to organize anime lists beyond your standard watchlist.
            </p>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-white/[0.06] text-xs">
              {collections.map((col) => (
                <div key={col.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                      {col.title}
                      <span className="ml-2 font-mono text-[10px] text-zinc-500">
                        · {col.isPrivate ? 'Private' : 'Public'} · {col.anilistIds.length} items
                      </span>
                    </p>
                    {col.description && (
                      <p className="text-zinc-500 dark:text-[#A5A1B5] mt-0.5">{col.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCollection(col.id)}
                    aria-label={`Delete ${col.title}`}
                    className="p-1.5 text-zinc-400 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#9B87FF]" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
              Saved Premiere Reminders ({reminders.length})
            </h2>
          </div>

          {reminders.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              No premiere reminders saved yet. Use "Remind Me" on the Season Premiere Countdown section on Home.
            </p>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-white/[0.06] text-xs">
              {reminders.map((rem) => (
                <div key={rem.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <SafeImage
                      src={rem.coverImage}
                      alt={rem.animeTitle}
                      className="h-12 w-9 rounded-md object-cover shrink-0 bg-[#11111B]"
                    />
                    <div className="min-w-0">
                      <Link
                        to={`/anime/${rem.animeSlug}`}
                        className="font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate block hover:text-[#9B87FF]"
                      >
                        {rem.animeTitle}
                      </Link>
                      <p className="font-mono text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
                        {rem.episode ? `Episode ${rem.episode} · ` : ''}
                        {rem.airingAt
                          ? new Date(rem.airingAt * 1000).toLocaleString()
                          : 'Timestamp pending'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemoveReminder(rem.anilistId)}
                    className="p-1.5 text-zinc-400 hover:text-rose-500 transition-colors shrink-0"
                    aria-label={`Remove reminder for ${rem.animeTitle}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Appearance & Universe Personalization */}
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-[#9B87FF]" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-[#F5F3FF]">
            Universe Appearance &amp; Personalization
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {VISUAL_THEMES.map((vt) => {
            const active = preferences.visualTheme === vt.id;
            return (
              <button
                key={vt.id}
                type="button"
                onClick={() => void updatePreferences({ visualTheme: vt.id })}
                className={`av-btn-press rounded-xl border p-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  active
                    ? 'border-[#9B87FF] bg-[#7C5CFF]/15'
                    : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] hover:border-[#9B87FF]/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                    {vt.label}
                  </span>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: vt.swatch }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-[#A5A1B5]">{vt.desc}</p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 dark:border-white/[0.08] pt-4 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">Accent Aura:</span>
            {ACCENT_PRESETS.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => void updatePreferences({ customAccentHex: hex })}
                aria-label={`Accent ${hex}`}
                className={`av-btn-press h-6 w-6 rounded-md border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  preferences.customAccentHex.toUpperCase() === hex
                    ? 'border-white scale-110'
                    : 'border-transparent opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="av-btn-press rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 font-medium hover:border-[#9B87FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            Mode: {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {[
            {
              key: 'compactMode' as const,
              title: 'Compact Card Density',
              desc: 'Show tighter grid columns on Home',
              value: preferences.compactMode,
            },
            {
              key: 'reducedMotion' as const,
              title: 'Reduced Motion',
              desc: 'Soften ambient particle & hover motion',
              value: preferences.reducedMotion,
            },
            {
              key: 'personalizationEnabled' as const,
              title: 'Tailored Recommendations',
              desc: 'Suggest picks from your watchlist genres',
              value: preferences.personalizationEnabled,
            },
            {
              key: 'profilePublic' as const,
              title: 'Public Profile Mode',
              desc: 'Allow universe stats display to members',
              value: preferences.profilePublic,
            },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => void updatePreferences({ [opt.key]: !opt.value })}
              className="av-btn-press flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3.5 py-3 text-left hover:border-[#9B87FF]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
            >
              <div>
                <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">{opt.title}</p>
                <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">{opt.desc}</p>
              </div>
              <span
                className={`rounded-md px-2 py-1 text-[11px] font-mono font-semibold shrink-0 ${
                  opt.value
                    ? 'bg-[#7C5CFF] text-white'
                    : 'bg-zinc-200 dark:bg-[#20202D] text-zinc-500'
                }`}
              >
                {opt.value ? 'ON' : 'OFF'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Edit Profile (Member Accounts) */}
      {user && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-[#F5F3FF]">Edit Profile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]">Username</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]">
                Avatar Image URL (HTTPS)
              </span>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
              />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]">Bio</span>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-5 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      {/* Playback & Airing Schedule Settings */}
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-[#9B87FF]" />
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-[#F5F3FF]">
            Playback &amp; Schedule Settings
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]">
              Airing Schedule Timezone
            </span>
            <select
              value={scheduleTz}
              onChange={(e) => handleSavePrefs(e.target.value, autoPlayDefault)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
            >
              {SCHEDULE_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                Default Player Autoplay
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
                Auto-start episode playback on watch pages
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSavePrefs(scheduleTz, !autoPlayDefault)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                autoPlayDefault
                  ? 'bg-[#7C5CFF] text-white'
                  : 'bg-zinc-200 dark:bg-[#20202D] text-zinc-700 dark:text-[#A5A1B5]'
              }`}
            >
              {autoPlayDefault ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      </div>

      {/* Security: Password Change & Sessions (Member vs Independent Admin) */}
      {user ? (
        <>
          <form
            onSubmit={handleChangePassword}
            className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#9B87FF]" />
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                Change Account Password
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]">
                  Current Password
                </span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]">
                  New Password
                </span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]">
                  Confirm New Password
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={changingPassword}
              className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-5 py-2 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
            >
              {changingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>

          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Laptop className="h-4 w-4 text-[#9B87FF]" />
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                  Active Sessions ({sessions.length})
                </h2>
              </div>
              {sessions.length > 1 && (
                <button
                  type="button"
                  onClick={() => void handleRevokeSession('others')}
                  className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition-colors whitespace-nowrap"
                >
                  Sign Out Other Sessions
                </button>
              )}
            </div>

            {loadingSessions && sessions.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">Loading active sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                No active persistent sessions recorded.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-white/[0.08] text-xs">
                {sessions.map((s) => (
                  <div key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-zinc-900 dark:text-[#F5F3FF] truncate max-w-xl">
                        {s.current ? 'Current Device · ' : ''}
                        {s.userAgent || 'Browser / API Session'}
                      </p>
                      <p className="text-zinc-500 dark:text-[#A5A1B5] font-mono tabular-nums">
                        {s.ipAddress ? `IP ${s.ipAddress} · ` : ''}
                        Started {new Date(s.createdAt).toLocaleString()} · Expires{' '}
                        {new Date(s.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    {!s.current && (
                      <button
                        type="button"
                        onClick={() => void handleRevokeSession(s.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-2.5 py-1.5 text-zinc-600 dark:text-[#A5A1B5] hover:text-rose-500 hover:border-rose-500/40 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-500">
              <Shield className="h-4 w-4" />
              <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                Administrator Credentials &amp; Sessions
              </h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Password rotation and active console sessions for Administrator are managed in the Admin Security Center.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition-colors"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Manage in Security Center
          </Link>
        </div>
      )}
    </div>
  );
}
