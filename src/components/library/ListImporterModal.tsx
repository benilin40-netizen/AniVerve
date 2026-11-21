import React, { useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';
import { apiFetch } from '../../services/apiClient.ts';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.ts';

interface ListImporterModalProps {
  open: boolean;
  onClose: () => void;
}

export function ListImporterModal({ open, onClose }: ListImporterModalProps) {
  const { refreshLibrary } = useLibrary();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'anilist' | 'mal-titles'>('anilist');
  const [anilistUsername, setAnilistUsername] = useState('');
  const [titlesRaw, setTitlesRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef, open, onClose);

  if (!open) return null;

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload =
        mode === 'anilist'
          ? { source: 'anilist', anilistUsername: anilistUsername.trim() }
          : {
              source: 'mal-titles',
              titles: titlesRaw
                .split(/\r?\n|,/)
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 20),
            };
      const res = await apiFetch<{ importedCount: number }>('/api/user/import', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await refreshLibrary();
      showToast(`Imported ${res.importedCount} anime titles to your Watchlist.`, 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to import list.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090F]/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#171722] p-6 shadow-2xl space-y-4 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="import-modal-title" className="text-base font-bold text-zinc-900 dark:text-[#F5F3FF]">
            Import Anime List
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-[#20202D]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-[#11111B] p-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('anilist')}
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              mode === 'anilist'
                ? 'bg-white dark:bg-[#7C5CFF] text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-600 dark:text-[#A5A1B5]'
            }`}
          >
            AniList Username
          </button>
          <button
            type="button"
            onClick={() => setMode('mal-titles')}
            className={`flex-1 rounded-md py-1.5 font-medium transition-colors ${
              mode === 'mal-titles'
                ? 'bg-white dark:bg-[#7C5CFF] text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-600 dark:text-[#A5A1B5]'
            }`}
          >
            Paste Titles (MAL / Text)
          </button>
        </div>

        <form onSubmit={handleImport} className="space-y-4">
          {mode === 'anilist' ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-[#F5F3FF]">
                Public AniList Username
              </span>
              <input
                type="text"
                required
                value={anilistUsername}
                onChange={(e) => setAnilistUsername(e.target.value)}
                placeholder="Enter AniList username"
                className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
              />
            </label>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-[#F5F3FF]">
                Anime Titles (up to 20, one per line)
              </span>
              <textarea
                rows={5}
                required
                value={titlesRaw}
                onChange={(e) => setTitlesRaw(e.target.value)}
                placeholder={'Sousou no Frieren\nDungeon Meshi\nChainsaw Man'}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
              />
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {submitting ? 'Importing...' : 'Import to Watchlist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
