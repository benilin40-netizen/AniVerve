import React, { createContext, useCallback, useContext, useState } from 'react';
import type { AnimeSummary } from '../types/anime.ts';

interface QuickViewContextValue {
  quickViewAnime: AnimeSummary | null;
  openQuickView: (anime: AnimeSummary) => void;
  closeQuickView: () => void;
}

const QuickViewContext = createContext<QuickViewContextValue | undefined>(undefined);

export function QuickViewProvider({ children }: { children: React.ReactNode }) {
  const [quickViewAnime, setQuickViewAnime] = useState<AnimeSummary | null>(null);

  const openQuickView = useCallback((anime: AnimeSummary) => {
    setQuickViewAnime(anime);
  }, []);

  const closeQuickView = useCallback(() => {
    setQuickViewAnime(null);
  }, []);

  return (
    <QuickViewContext.Provider value={{ quickViewAnime, openQuickView, closeQuickView }}>
      {children}
    </QuickViewContext.Provider>
  );
}

export function useQuickView() {
  const ctx = useContext(QuickViewContext);
  if (!ctx) throw new Error('useQuickView must be used inside QuickViewProvider');
  return ctx;
}
