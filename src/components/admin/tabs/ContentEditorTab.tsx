import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import type {
  CuratedCollection,
  HomepageSectionKey,
  HomepageUniverseConfig,
} from '../../../types/anime.ts';
import { SECTION_LABELS } from './adminTypes.ts';

interface ContentEditorTabProps {
  universeConfig: HomepageUniverseConfig;
  setUniverseConfig: React.Dispatch<React.SetStateAction<HomepageUniverseConfig | null>>;
  spotlightOverrideInput: string;
  setSpotlightOverrideInput: React.Dispatch<React.SetStateAction<string>>;
  trailerOverrideInput: string;
  setTrailerOverrideInput: React.Dispatch<React.SetStateAction<string>>;
  collections: CuratedCollection[];
  onPatchUniverseConfig: (
    payload: Partial<HomepageUniverseConfig> & { saveDraft?: boolean; publishDraft?: boolean },
    toastMsg: string
  ) => Promise<void>;
  onResetUniverseConfig: () => Promise<void>;
  onCreateCollection: (payload: {
    title: string;
    subtitle: string;
    themeTag: string;
    anilistIds: number[];
  }) => Promise<void>;
  onToggleCollectionPublished: (col: CuratedCollection) => Promise<void>;
  onDeleteCollection: (col: CuratedCollection) => Promise<void>;
}

export function ContentEditorTab({
  universeConfig,
  setUniverseConfig,
  spotlightOverrideInput,
  setSpotlightOverrideInput,
  trailerOverrideInput,
  setTrailerOverrideInput,
  collections,
  onPatchUniverseConfig,
  onResetUniverseConfig,
  onCreateCollection,
  onToggleCollectionPublished,
  onDeleteCollection,
}: ContentEditorTabProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [newColSubtitle, setNewColSubtitle] = useState('');
  const [newColThemeTag, setNewColThemeTag] = useState('Curated');
  const [newColIds, setNewColIds] = useState('');

  const moveSection = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= universeConfig.sectionOrder.length) return;
    const nextOrder = [...universeConfig.sectionOrder];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(target, 0, moved);
    setUniverseConfig({ ...universeConfig, sectionOrder: nextOrder });
  };

  const toggleSectionVisibility = (key: HomepageSectionKey) => {
    const hidden = new Set(universeConfig.hiddenSections);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    setUniverseConfig({ ...universeConfig, hiddenSections: Array.from(hidden) });
  };

  const handleCollectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = newColIds
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    await onCreateCollection({
      title: newColTitle,
      subtitle: newColSubtitle,
      themeTag: newColThemeTag,
      anilistIds: ids,
    });
    setNewColTitle('');
    setNewColSubtitle('');
    setNewColIds('');
  };

  return (
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
                void onPatchUniverseConfig(
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
                  void onPatchUniverseConfig({ publishDraft: true }, 'Saved draft published live.')
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 font-semibold text-white"
              >
                Publish Saved Draft
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                void onPatchUniverseConfig(
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
              onClick={() => void onResetUniverseConfig()}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <label className="space-y-1.5">
            <span className="font-medium text-zinc-600 dark:text-[#A5A1B5]">
              Today&apos;s Anime Spotlight Override (AniList ID — leave blank for automatic daily pick)
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

      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 space-y-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF]">
          Official Curated Collections ({collections.length})
        </h2>

        <form
          onSubmit={(e) => void handleCollectionSubmit(e)}
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
                  <span className="font-mono text-[10px] text-[#9B87FF]">[{col.themeTag}]</span>
                </p>
                <p className="text-zinc-500 dark:text-[#A5A1B5]">
                  {col.subtitle} · {col.anilistIds.length} AniList IDs
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onToggleCollectionPublished(col)}
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
                  onClick={() => void onDeleteCollection(col)}
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
  );
}
