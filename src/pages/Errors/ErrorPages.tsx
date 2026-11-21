import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home, Search } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';

export function NotFoundPage() {
  useDocumentMeta({
    title: 'Page Not Found (404)',
    description: 'The requested AniVerve page could not be located.',
    noindex: true,
  });

  return (
    <div className="max-w-lg mx-auto my-14 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-8 text-center space-y-5 animate-av-enter">
      <div className="mx-auto h-12 w-12 rounded-xl bg-[#7C5CFF]/15 text-[#7C5CFF] dark:text-[#9B87FF] flex items-center justify-center">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
          Error 404
        </p>
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-[#F5F3FF]">
          Page Not Found
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#A5A1B5]">
          The anime page or route you requested does not exist or may have moved.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Home className="h-3.5 w-3.5" />
          Back to Home
        </Link>
        <Link
          to="/explore"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-4 py-2 text-xs font-semibold text-zinc-800 dark:text-[#F5F3FF] hover:border-[#9B87FF]"
        >
          <Search className="h-3.5 w-3.5" />
          Browse Anime
        </Link>
      </div>
    </div>
  );
}

export function GonePage() {
  useDocumentMeta({
    title: 'Content Removed (410)',
    description: 'This content is permanently no longer available on AniVerve.',
    noindex: true,
  });

  return (
    <div className="max-w-lg mx-auto my-14 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-8 text-center space-y-5 animate-av-enter">
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-wider text-rose-500">
          HTTP 410 · Removed
        </p>
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-[#F5F3FF]">
          This Content Is No Longer Available
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#A5A1B5]">
          This entry has been permanently retired or removed following a rights request.
        </p>
      </div>
      <Link
        to="/explore"
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
      >
        Discover Available Anime
      </Link>
    </div>
  );
}
