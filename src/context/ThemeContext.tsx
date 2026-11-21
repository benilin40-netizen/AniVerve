import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UniversePreferences, UniverseVisualTheme } from '../types/anime.ts';
import { universeService } from '../services/universeService.ts';

type Theme = 'dark' | 'light';

const DEFAULT_UNIVERSE_PREFS: UniversePreferences = {
  visualTheme: 'midnight-violet',
  customAccentHex: '#9B87FF',
  compactMode: false,
  reducedMotion: false,
  personalizationEnabled: true,
  profilePublic: false,
  hideAchievements: false,
};

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  preferences: UniversePreferences;
  updatePreferences: (patch: Partial<UniversePreferences>, syncRemote?: boolean) => Promise<void>;
  hydrateRemotePreferences: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const PREF_STORAGE_KEY = 'aniverve-universe-prefs';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('aniverve-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Ignore storage failures
    }
    return 'dark';
  });

  const [preferences, setPreferences] = useState<UniversePreferences>(() => {
    try {
      const raw = localStorage.getItem(PREF_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_UNIVERSE_PREFS, ...JSON.parse(raw) };
      }
    } catch {
      // Ignore storage failures
    }
    return DEFAULT_UNIVERSE_PREFS;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('aniverve-theme', theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const validThemes: UniverseVisualTheme[] = ['midnight-violet', 'obsidian', 'aurora', 'eclipse'];
    const vt = validThemes.includes(preferences.visualTheme)
      ? preferences.visualTheme
      : 'midnight-violet';
    root.setAttribute('data-universe-theme', vt);
    root.style.setProperty('--av-accent-primary', preferences.customAccentHex || '#9B87FF');

    if (preferences.reducedMotion) {
      root.setAttribute('data-reduced-motion', 'true');
    } else {
      root.removeAttribute('data-reduced-motion');
    }

    if (preferences.compactMode) {
      root.setAttribute('data-compact-mode', 'true');
    } else {
      root.removeAttribute('data-compact-mode');
    }

    try {
      localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Ignore
    }
  }, [preferences]);

  const hydrateRemotePreferences = useCallback(async () => {
    try {
      const remote = await universeService.getUserPreferences();
      setPreferences((prev) => ({ ...prev, ...remote }));
    } catch {
      // Unauthenticated or offline — keep local preferences
    }
  }, []);

  const updatePreferences = useCallback(
    async (patch: Partial<UniversePreferences>, syncRemote = true) => {
      setPreferences((prev) => ({ ...prev, ...patch }));
      if (syncRemote) {
        try {
          const saved = await universeService.updateUserPreferences(patch);
          setPreferences((prev) => ({ ...prev, ...saved }));
        } catch {
          // Keep optimistic local preference if not signed in
        }
      }
    },
    []
  );

  const toggleTheme = () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme: setThemeState,
        preferences,
        updatePreferences,
        hydrateRemotePreferences,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
