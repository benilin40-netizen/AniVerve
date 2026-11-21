import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, Download, Sparkles, X } from 'lucide-react';
import { ANIME_GENRES } from '../../config/constants.ts';
import { apiFetch } from '../../services/apiClient.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.ts';

export const ONBOARDING_PENDING_KEY = 'aniverve-onboarding-pending';
export const ONBOARDING_DONE_KEY = 'aniverve-onboarding-done';

export function OnboardingModal() {
  const { isAuthenticated, user } = useAuth();
  const { refreshLibrary } = useLibrary();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [anilistUsername, setAnilistUsername] = useState('');
  const [malTitles, setMalTitles] = useState('');
  const [busy, setBusy] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    try {
      const pending = localStorage.getItem(ONBOARDING_PENDING_KEY) === '1';
      const done = localStorage.getItem(ONBOARDING_DONE_KEY) === '1';
      if (pending && !done) {
        setOpen(true);
      }
    } catch {
      // Ignore storage error
    }
  }, [isAuthenticated, user]);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.removeItem(ONBOARDING_PENDING_KEY);
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch {
      // Ignore storage error
    }
  };

  useFocusTrap(modalRef, open, dismiss);

  if (!open || !isAuthenticated) return null;

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((item) => item !== g) : prev.length < 6 ? [...prev, g] : prev
    );
  };

  const handleSaveGenres = async () => {
    if (selectedGenres.length > 0) {
      setBusy(true);
      try {
        await apiFetch('/api/user/import', {
          method: 'POST',
          body: JSON.stringify({
            source: 'onboarding-genres',
            genres: selectedGenres,
          }),
        });
        await refreshLibrary();
      } catch {
        // Non-blocking seed
      } finally {
        setBusy(false);
      }
    }
    setStep(2);
  };

  const handleImportList = async () => {
    if (!anilistUsername.trim() && !malTitles.trim()) {
      setStep(3);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ importedCount: number }>('/api/user/import', {
        method: 'POST',
        body: JSON.stringify(
          anilistUsername.trim()
            ? { source: 'anilist', anilistUsername: anilistUsername.trim() }
            : {
                source: 'mal-titles',
                titles: malTitles
                  .split(/\r?\n|,/)
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .slice(0, 20),
              }
        ),
      });
      await refreshLibrary();
      showToast(`Imported ${res.importedCount} anime titles to your library.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to import list.', 'error');
    } finally {
      setBusy(false);
      setStep(3);
    }
  };

  const handleEnableNotifications = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          setRemindersEnabled(true);
          try {
            localStorage.setItem('aniverve-browser-alerts', '1');
          } catch {
            // Ignore
          }
          showToast('Episode release alerts enabled.', 'success');
        }
      } catch {
        // Ignore browser notification failure
      }
    }
    dismiss();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090F]/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-xl rounded-2xl border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#171722] p-6 shadow-2xl space-y-5 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
              Step {step} of 3
            </p>
            <h2 id="onboarding-title" className="text-xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
              {step === 1
                ? 'Pick your favorite genres'
                : step === 2
                  ? 'Import your existing anime list'
                  : 'Enable episode release alerts'}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip setup"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-[#20202D]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Choose up to 6 genres so AniVerve can personalize your Home feed immediately.
            </p>
            <div className="flex flex-wrap gap-2">
              {ANIME_GENRES.map((genre) => {
                const active = selectedGenres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleGenre(genre)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-[#7C5CFF] bg-[#7C5CFF] text-white'
                        : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                Skip for now
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveGenres()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {busy ? 'Personalizing...' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Bring over your public AniList profile or paste titles from MyAnimeList — or skip to start fresh.
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-[#F5F3FF]">
                AniList Public Username (optional)
              </span>
              <input
                type="text"
                value={anilistUsername}
                onChange={(e) => setAnilistUsername(e.target.value)}
                placeholder="e.g. demo_user"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-[#F5F3FF]">
                Or paste anime titles (one per line)
              </span>
              <textarea
                rows={3}
                value={malTitles}
                onChange={(e) => setMalTitles(e.target.value)}
                placeholder={'Frieren: Beyond Journey\'s End\nSolo Leveling'}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
              />
            </label>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                Skip import
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleImportList()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {busy ? 'Importing...' : anilistUsername.trim() || malTitles.trim() ? 'Import List' : 'Next'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              Get notified when new episodes air for shows in your Watching list. You can change this anytime in Profile Settings.
            </p>
            <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-4 flex items-center gap-3">
              <Bell className="h-5 w-5 text-[#9B87FF] shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                  Browser Episode Alerts
                </p>
                <p className="text-zinc-500 dark:text-[#A5A1B5]">
                  {remindersEnabled ? 'Enabled for your browser' : 'Only triggers for shows you bookmark'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={dismiss}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                Finish without alerts
              </button>
              <button
                type="button"
                onClick={() => void handleEnableNotifications()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
              >
                <Check className="h-3.5 w-3.5" />
                Enable Alerts &amp; Finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
