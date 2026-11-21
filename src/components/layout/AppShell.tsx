import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  CalendarClock,
  Compass,
  Film,
  Home,
  LayoutGrid,
  Menu,
  Moon,
  Search,
  Shield,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { anilistService } from '../../services/anilistService.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat, formatScore } from '../../utils/formatters.ts';
import type { AnimeSummary } from '../../types/anime.ts';
import { SafeImage } from '../common/SafeImage.tsx';
import { SearchOverlay } from './SearchOverlay.tsx';
import { LivingUniverseParticles } from '../effects/LivingUniverseParticles.tsx';
import { AnimeQuickViewModal } from '../anime/AnimeQuickViewModal.tsx';
import { NotificationCenter } from '../notifications/NotificationCenter.tsx';

const PRIMARY_NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/explore', label: 'Browse Anime', icon: Compass },
  { to: '/movies', label: 'Movies', icon: Film },
  { to: '/genres', label: 'Genres', icon: LayoutGrid },
  { to: '/schedule', label: 'Airing Schedule', icon: CalendarClock },
  { to: '/watchlist', label: 'Watchlist', icon: Bookmark },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { user, isAdminAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Inline live search bar with dropdown suggestions
  const [inlineQuery, setInlineQuery] = useState('');
  const [inlineFocused, setInlineFocused] = useState(false);
  const [inlineResults, setInlineResults] = useState<AnimeSummary[]>([]);
  const debouncedInline = useDebounce(inlineQuery, 260);

  const isHeroRoute =
    location.pathname === '/' || location.pathname.startsWith('/anime/');

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOverlayOpen(true);
      } else if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!debouncedInline.trim()) {
      setInlineResults([]);
      return;
    }
    const controller = new AbortController();
    anilistService
      .quickSearch(debouncedInline, controller.signal)
      .then(setInlineResults)
      .catch(() => {});
    return () => controller.abort();
  }, [debouncedInline]);

  const handleInlineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineQuery.trim()) return;
    setInlineFocused(false);
    navigate(`/explore?search=${encodeURIComponent(inlineQuery.trim())}`);
  };

  const isAdminRoute = location.pathname.startsWith('/admin');
  const transparentTop = isHeroRoute && !scrolled;

  return (
    <div className="relative min-h-screen bg-[#F6F5FA] text-[#141320] dark:bg-[var(--av-bg-primary,#09090F)] dark:text-[#F5F3FF] flex flex-col">
      <LivingUniverseParticles />
      {/* Sticky Top Navigation Bar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 h-14 sm:h-16 transition-all duration-300 ${
          transparentTop
            ? 'bg-gradient-to-b from-[#09090F]/85 via-[#09090F]/45 to-transparent border-b border-transparent text-[#F5F3FF]'
            : 'bg-white/95 dark:bg-[#09090F]/95 backdrop-blur-xl border-b border-zinc-200 dark:border-white/[0.08] text-zinc-900 dark:text-[#F5F3FF]'
        }`}
      >
        <div className="max-w-[1440px] h-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Left: Mobile Trigger + Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className={`lg:hidden av-btn-press rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                transparentTop
                  ? 'text-[#F5F3FF] hover:bg-white/10'
                  : 'text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D]'
              }`}
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              to="/"
              aria-label="AniVerve Home"
              className="inline-flex items-center shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9B87FF] rounded-lg"
            >
              <img
                src="/branding/aniverve-logo.svg"
                alt="AniVerve — Anime Beyond Borders"
                className="hidden sm:block h-9 w-auto object-contain"
              />
              <img
                src="/branding/aniverve-icon.svg"
                alt="AniVerve"
                className="sm:hidden h-8 w-8 object-contain"
              />
            </Link>
          </div>

          {/* Center: Desktop Primary Navigation */}
          <nav
            aria-label="Main navigation"
            className="hidden lg:flex items-center gap-1 min-w-0"
          >
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `av-nav-link px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                    isActive
                      ? transparentTop
                        ? 'text-white bg-white/15'
                        : 'text-[#7C5CFF] dark:text-[#9B87FF] bg-[#7C5CFF]/10 dark:bg-[#9B87FF]/12'
                      : transparentTop
                        ? 'text-[#F5F3FF]/80 hover:text-white hover:bg-white/10'
                        : 'text-zinc-600 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#171722]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}

            {(isAdminRoute || isAdminAuthenticated) && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `av-nav-link inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                    isActive
                      ? 'text-[#9B87FF] bg-[#9B87FF]/15'
                      : transparentTop
                        ? 'text-amber-300 hover:text-amber-200 hover:bg-white/10'
                        : 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10'
                  }`
                }
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Admin</span>
              </NavLink>
            )}
          </nav>

          {/* Right: Live Search + Theme + Account */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative hidden md:block w-56 xl:w-64">
              <form onSubmit={handleInlineSubmit} className="relative">
                <Search
                  className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ${
                    transparentTop ? 'text-[#F5F3FF]/70' : 'text-zinc-400 dark:text-[#A5A1B5]'
                  }`}
                />
                <input
                  type="search"
                  value={inlineQuery}
                  onFocus={() => setInlineFocused(true)}
                  onBlur={() => setTimeout(() => setInlineFocused(false), 180)}
                  onChange={(e) => setInlineQuery(e.target.value)}
                  placeholder="Search (Ctrl+K)"
                  aria-label="Search anime"
                  className={`w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs transition-colors focus:outline-none ${
                    transparentTop
                      ? 'border-white/15 bg-[#09090F]/50 text-white placeholder:text-white/60 focus:border-[#9B87FF] backdrop-blur-md'
                      : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-100/80 dark:bg-[#171722] text-zinc-900 dark:text-[#F5F3FF] placeholder:text-zinc-500 dark:placeholder:text-[#A5A1B5] focus:border-[#9B87FF]'
                  }`}
                />
              </form>

              {inlineFocused && inlineQuery.trim() && inlineResults.length > 0 && (
                <div className="av-modal-enter absolute right-0 top-full mt-2 w-80 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] shadow-2xl p-2 z-50">
                  {inlineResults.slice(0, 6).map((item) => {
                    const t = getPrimaryTitle(item.title);
                    return (
                      <Link
                        key={item.id}
                        to={`/anime/${item.slug}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setInlineFocused(false);
                          setInlineQuery('');
                        }}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-[#20202D] transition-colors"
                      >
                        <SafeImage
                          src={item.coverImage?.medium || item.coverImage?.large}
                          alt={t}
                          className="h-11 w-8 rounded object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate">
                            {t}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                            {formatFormat(item.format)}
                            {item.seasonYear ? ` · ${item.seasonYear}` : ''}
                            {item.averageScore ? ` · ${formatScore(item.averageScore)}` : ''}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSearchOverlayOpen(true)}
              aria-label="Open search"
              className={`md:hidden av-btn-press rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                transparentTop
                  ? 'text-[#F5F3FF] hover:bg-white/10'
                  : 'text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#20202D]'
              }`}
            >
              <Search className="h-4 w-4" />
            </button>

            <NotificationCenter transparentTop={transparentTop} />

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className={`av-btn-press rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                transparentTop
                  ? 'text-[#F5F3FF] hover:bg-white/10'
                  : 'text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#20202D]'
              }`}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {user ? (
              <Link
                to="/profile"
                className={`av-btn-press inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs sm:text-[13px] font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  transparentTop
                    ? 'border-white/20 bg-[#171722]/70 text-[#F5F3FF] hover:border-[#9B87FF] backdrop-blur-md'
                    : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-900 dark:text-[#F5F3FF] hover:border-[#9B87FF]'
                }`}
              >
                <User className="h-3.5 w-3.5 text-[#9B87FF]" />
                <span className="max-w-[96px] truncate">{user.username}</span>
              </Link>
            ) : isAdminAuthenticated ? (
              <Link
                to="/profile"
                className={`av-btn-press inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs sm:text-[13px] font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  transparentTop
                    ? 'border-amber-400/40 bg-[#171722]/80 text-amber-200 hover:border-amber-300 backdrop-blur-md'
                    : 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:border-amber-400'
                }`}
              >
                <Shield className="h-3.5 w-3.5 text-amber-400" />
                <span>Administrator</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="av-btn-press inline-flex items-center rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3.5 py-1.5 text-xs sm:text-[13px] font-semibold text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        className={
          isHeroRoute
            ? 'relative z-10 flex-1 w-full pb-16'
            : 'relative z-10 flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-16'
        }
      >
        <div key={location.pathname} className="av-page-enter">
          {children}
        </div>
      </main>

      {/* Compact Platform Footer */}
      <footer className="border-t border-zinc-200 dark:border-white/[0.08] bg-white/60 dark:bg-[#11111B]/70">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-[#A5A1B5]">
          <div className="flex items-center gap-2.5">
            <img
              src="/branding/aniverve-icon.svg"
              alt=""
              aria-hidden="true"
              className="h-5 w-5 object-contain"
            />
            <span className="font-bold text-zinc-900 dark:text-[#F5F3FF]">
              Ani<span className="text-[#9B87FF]">Verve</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Anime Beyond Borders</span>
          </div>
          <nav aria-label="Footer links" className="flex flex-wrap items-center gap-5">
            <Link to="/explore" className="hover:text-zinc-900 dark:hover:text-[#F5F3FF] transition-colors">
              Browse Anime
            </Link>
            <Link to="/movies" className="hover:text-zinc-900 dark:hover:text-[#F5F3FF] transition-colors">
              Movies
            </Link>
            <Link to="/genres" className="hover:text-zinc-900 dark:hover:text-[#F5F3FF] transition-colors">
              Genres
            </Link>
            <Link to="/schedule" className="hover:text-zinc-900 dark:hover:text-[#F5F3FF] transition-colors">
              Airing Schedule
            </Link>
            <a href="/sitemap.xml" className="hover:text-zinc-900 dark:hover:text-[#F5F3FF] transition-colors">
              Sitemap
            </a>
            <Link to="/admin/login" className="hover:text-[#9B87FF] transition-colors">
              Admin Portal
            </Link>
          </nav>
        </div>
      </footer>

      {/* Mobile Slide-Out Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className="av-backdrop-enter fixed inset-0 z-50 lg:hidden bg-[#09090F]/75 backdrop-blur-sm flex"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="av-drawer-enter w-72 bg-white dark:bg-[#11111B] h-full p-5 flex flex-col border-r border-zinc-200 dark:border-white/[0.08]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-white/[0.08]">
              <img
                src="/branding/aniverve-logo.svg"
                alt="AniVerve"
                className="h-8 w-auto object-contain"
              />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="av-btn-press p-2 rounded-lg text-zinc-500 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#20202D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setSearchOverlayOpen(true);
              }}
              className="av-btn-press mt-4 flex items-center gap-2.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#171722] px-3 py-2.5 text-xs text-zinc-500 dark:text-[#A5A1B5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
            >
              <Search className="h-4 w-4 text-[#9B87FF]" />
              <span>Search anime...</span>
            </button>

            <div className="mt-4 space-y-1 flex-1 overflow-y-auto">
              {PRIMARY_NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                        isActive
                          ? 'bg-[#7C5CFF]/15 text-[#7C5CFF] dark:text-[#9B87FF]'
                          : 'text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#171722]'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}

              {(isAdminRoute || isAdminAuthenticated) && (
                <NavLink
                  to="/admin"
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  <Shield className="h-4 w-4" />
                  <span>Admin Console</span>
                </NavLink>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-white/[0.08]">
              <Link
                to={user || isAdminAuthenticated ? '/profile' : '/login'}
                className="av-btn-press flex items-center justify-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] py-2.5 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                {isAdminAuthenticated && !user ? (
                  <Shield className="h-4 w-4 text-amber-300" />
                ) : (
                  <User className="h-4 w-4" />
                )}
                {user ? user.username : isAdminAuthenticated ? 'Administrator' : 'Sign In / Register'}
              </Link>
            </div>
          </div>
        </div>
      )}

      <SearchOverlay open={searchOverlayOpen} onClose={() => setSearchOverlayOpen(false)} />
      <AnimeQuickViewModal />
    </div>
  );
}
