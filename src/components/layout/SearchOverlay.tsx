import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Clock,
  Film,
  FolderHeart,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  UserCircle2,
  X,
} from 'lucide-react';
import type { UniversalSearchResult } from '../../types/anime.ts';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { universeService } from '../../services/universeService.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat, formatScore } from '../../utils/formatters.ts';
import { SafeImage } from '../common/SafeImage.tsx';

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
}

const HISTORY_STORAGE_KEY = 'aniverve-search-history-v2';

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => typeof x === 'string').slice(0, 8);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function saveSearchHistory(next: string[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next.slice(0, 8)));
  } catch {
    // ignore storage errors
  }
}

interface FlatActionItem {
  id: string;
  label: string;
  to: string;
}

export function SearchOverlay({ open, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniversalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(() => loadSearchHistory());
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounced = useDebounce(query, 240);
  const navigate = useNavigate();

  const recordHistory = useCallback((term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setHistory((prev) => {
      const next = [clean, ...prev.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(
        0,
        8
      );
      saveSearchHistory(next);
      return next;
    });
  }, []);

  const clearHistory = () => {
    setHistory([]);
    saveSearchHistory([]);
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
      setActiveIndex(-1);
    } else {
      setQuery('');
      setResults(null);
      setActiveIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !debounced.trim()) {
      setResults(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    universeService
      .universalSearch(debounced, controller.signal)
      .then((res) => {
        setResults(res);
        setActiveIndex(-1);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Universal search failed.');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debounced, open]);

  const flatActions = useMemo<FlatActionItem[]>(() => {
    if (!results) return [];
    const list: FlatActionItem[] = [];
    for (const a of results.anime) {
      list.push({
        id: `anime:${a.id}`,
        label: getPrimaryTitle(a.title),
        to: `/anime/${a.slug}`,
      });
    }
    for (const c of results.characters) {
      const target = c.anime[0];
      if (target) {
        list.push({
          id: `char:${c.id}`,
          label: c.name,
          to: `/anime/${target.slug}`,
        });
      }
    }
    for (const s of results.studios) {
      list.push({
        id: `studio:${s.id}`,
        label: s.name,
        to: `/explore?search=${encodeURIComponent(s.name)}`,
      });
    }
    for (const g of results.genres) {
      list.push({
        id: `genre:${g}`,
        label: g,
        to: `/explore?genre=${encodeURIComponent(g)}`,
      });
    }
    for (const col of results.collections) {
      list.push({
        id: `col:${col.id}`,
        label: col.title,
        to: `/#collection-${col.slug}`,
      });
    }
    return list;
  }, [results]);

  const goTo = useCallback(
    (to: string, searchLabel?: string) => {
      if (searchLabel) recordHistory(searchLabel);
      onClose();
      if (to.startsWith('/#')) {
        navigate('/');
        setTimeout(() => {
          const el = document.getElementById(to.slice(2));
          el?.scrollIntoView({ behavior: 'smooth' });
        }, 160);
      } else {
        navigate(to);
      }
    },
    [navigate, onClose, recordHistory]
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown' && flatActions.length > 0) {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % flatActions.length);
      } else if (e.key === 'ArrowUp' && flatActions.length > 0) {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? flatActions.length - 1 : i - 1));
      } else if (e.key === 'Enter' && activeIndex >= 0 && flatActions[activeIndex]) {
        e.preventDefault();
        goTo(flatActions[activeIndex].to, query || flatActions[activeIndex].label);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, flatActions, activeIndex, goTo, query]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    recordHistory(query.trim());
    onClose();
    navigate(`/explore?search=${encodeURIComponent(query.trim())}`);
  };

  const hasAnyResults =
    results &&
    (results.anime.length > 0 ||
      results.characters.length > 0 ||
      results.studios.length > 0 ||
      results.genres.length > 0 ||
      results.collections.length > 0);

  let cursor = -1;
  const nextIndex = () => {
    cursor += 1;
    return cursor;
  };

  return (
    <div
      className="av-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-[#09090F]/80 p-4 pt-12 sm:pt-20 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Universal AniVerve Search"
      onClick={onClose}
    >
      <div
        className="av-modal-enter w-full max-w-3xl rounded-2xl border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#171722] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/[0.08] px-4 py-3.5"
        >
          <Search className="h-5 w-5 text-[#9B87FF] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anime, characters, studios, genres, or collections..."
            className="flex-1 bg-transparent text-sm sm:text-base text-zinc-900 dark:text-[#F5F3FF] placeholder:text-zinc-400 dark:placeholder:text-[#A5A1B5] focus:outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-[#9B87FF]" />}
          <span className="hidden sm:inline font-mono text-[10px] text-zinc-400 dark:text-[#A5A1B5] border border-zinc-200 dark:border-white/[0.08] rounded px-1.5 py-0.5">
            ESC
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="av-btn-press rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-[#20202D] hover:text-zinc-900 dark:hover:text-[#F5F3FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <X className="h-4 w-4" />
          </button>
        </form>

        <div className="max-h-[68vh] overflow-y-auto p-4 space-y-5">
          {!query.trim() && (
            <div className="space-y-4">
              {history.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                      <Clock className="h-3.5 w-3.5 text-[#9B87FF]" />
                      Recent Searches
                    </span>
                    <button
                      type="button"
                      onClick={clearHistory}
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear History
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {history.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setQuery(item)}
                        className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF] transition-colors"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-6 text-center text-xs text-zinc-500 dark:text-[#A5A1B5]">
                  Search across AniList titles, favorite characters, animation studios, genres, and
                  curated collections. Use Up/Down arrows and Enter to jump directly.
                </p>
              )}
            </div>
          )}

          {error && <p className="py-4 text-center text-xs text-rose-500">{error}</p>}

          {query.trim() && !loading && !error && !hasAnyResults && (
            <p className="py-8 text-center text-xs text-zinc-500 dark:text-[#A5A1B5]">
              No matching anime, characters, studios, or collections found for "{query}".
            </p>
          )}

          {results && hasAnyResults && (
            <div className="space-y-5">
              {/* Anime */}
              {results.anime.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                    <Film className="h-3.5 w-3.5 text-[#9B87FF]" />
                    Anime
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {results.anime.slice(0, 6).map((item) => {
                      const idx = nextIndex();
                      const title = getPrimaryTitle(item.title);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => goTo(`/anime/${item.slug}`, query)}
                          className={`flex items-center gap-3 rounded-xl p-2 text-left transition-colors ${
                            activeIndex === idx
                              ? 'bg-[#7C5CFF]/20 border border-[#9B87FF]/40'
                              : 'hover:bg-zinc-100 dark:hover:bg-[#20202D]'
                          }`}
                        >
                          <SafeImage
                            src={item.coverImage?.medium || item.coverImage?.large}
                            alt={title}
                            className="h-12 w-9 rounded-md object-cover shrink-0 bg-[#11111B]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate">
                              {title}
                            </p>
                            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] truncate tabular-nums">
                              {formatFormat(item.format)}
                              {item.seasonYear ? ` · ${item.seasonYear}` : ''}
                              {item.averageScore ? ` · ${formatScore(item.averageScore)}` : ''}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Characters */}
              {results.characters.length > 0 && (
                <section className="space-y-2">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                    <UserCircle2 className="h-3.5 w-3.5 text-[#9B87FF]" />
                    Characters
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {results.characters.slice(0, 4).map((char) => {
                      const target = char.anime[0];
                      if (!target) return null;
                      const idx = nextIndex();
                      return (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => goTo(`/anime/${target.slug}`, query)}
                          className={`flex items-center gap-3 rounded-xl p-2 text-left transition-colors ${
                            activeIndex === idx
                              ? 'bg-[#7C5CFF]/20 border border-[#9B87FF]/40'
                              : 'hover:bg-zinc-100 dark:hover:bg-[#20202D]'
                          }`}
                        >
                          <SafeImage
                            src={char.image}
                            alt={char.name}
                            className="h-11 w-11 rounded-lg object-cover shrink-0 bg-[#11111B]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate">
                              {char.name}
                            </p>
                            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] truncate">
                              {getPrimaryTitle(target.title)}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Studios + Genres + Collections */}
              {(results.studios.length > 0 ||
                results.genres.length > 0 ||
                results.collections.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {results.studios.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        <Building2 className="h-3.5 w-3.5 text-[#9B87FF]" />
                        Studios
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {results.studios.map((s) => {
                          const idx = nextIndex();
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() =>
                                goTo(`/explore?search=${encodeURIComponent(s.name)}`, s.name)
                              }
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                activeIndex === idx
                                  ? 'border-[#9B87FF] bg-[#7C5CFF]/20 text-white'
                                  : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]'
                              }`}
                            >
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {(results.genres.length > 0 || results.collections.length > 0) && (
                    <section className="space-y-2">
                      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        <FolderHeart className="h-3.5 w-3.5 text-[#9B87FF]" />
                        Genres & Collections
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {results.genres.map((g) => {
                          const idx = nextIndex();
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() =>
                                goTo(`/explore?genre=${encodeURIComponent(g)}`, g)
                              }
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                activeIndex === idx
                                  ? 'border-[#9B87FF] bg-[#7C5CFF]/20 text-white'
                                  : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] text-[#7C5CFF] dark:text-[#9B87FF] hover:border-[#9B87FF]'
                              }`}
                            >
                              <Sparkles className="h-3 w-3" />
                              {g}
                            </button>
                          );
                        })}
                        {results.collections.map((col) => {
                          const idx = nextIndex();
                          return (
                            <button
                              key={col.id}
                              type="button"
                              onClick={() => goTo(`/#collection-${col.slug}`, col.title)}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                activeIndex === idx
                                  ? 'border-[#9B87FF] bg-[#7C5CFF]/20 text-white'
                                  : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]'
                              }`}
                            >
                              {col.title}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                className="av-btn-press flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] py-2.5 text-xs font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:bg-zinc-50 dark:hover:bg-[#20202D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                Browse full filtered catalog for "{query}"
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
