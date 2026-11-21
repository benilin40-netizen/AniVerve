import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import {
  getConsentChoice,
  setConsentChoice,
  type ConsentChoice,
} from '../../services/analyticsService.ts';

export function ConsentBanner() {
  const [choice, setChoice] = useState<ConsentChoice>(() => getConsentChoice());

  useEffect(() => {
    const sync = () => setChoice(getConsentChoice());
    window.addEventListener('aniverve:consent-changed', sync);
    return () => window.removeEventListener('aniverve:consent-changed', sync);
  }, []);

  if (choice !== 'pending') return null;

  return (
    <div
      role="region"
      aria-label="Cookie and analytics preferences"
      className="fixed bottom-16 md:bottom-4 right-4 left-4 md:left-auto z-40 md:max-w-md rounded-xl border border-zinc-200 dark:border-white/[0.1] bg-white/95 dark:bg-[#171722]/95 p-4 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-start gap-3">
        <Cookie className="h-4 w-4 text-[#9B87FF] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-[#A5A1B5]">
            AniVerve uses essential cookies for sign-in sessions and optional privacy-first usage metrics.{' '}
            <Link to="/privacy" className="text-[#7C5CFF] dark:text-[#9B87FF] hover:underline">
              Privacy Policy
            </Link>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setConsentChoice('accepted');
                setChoice('accepted');
              }}
              className="av-btn-press rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Accept Analytics
            </button>
            <button
              type="button"
              onClick={() => {
                setConsentChoice('declined');
                setChoice('declined');
              }}
              className="av-btn-press rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D]"
            >
              Essential Only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
