import React from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_LAST_UPDATED } from '../../config/constants.ts';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';

function LegalShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  useDocumentMeta({ title, description });
  return (
    <article className="max-w-3xl mx-auto py-8 space-y-6 animate-av-enter">
      <header className="space-y-2 border-b border-zinc-200 dark:border-white/[0.08] pb-5">
        <p className="text-xs font-mono text-[#7C5CFF] dark:text-[#9B87FF]">
          AniVerve · Updated {LEGAL_LAST_UPDATED}
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-[#F5F3FF]">
          {title}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-[#A5A1B5]">{description}</p>
      </header>
      <div className="space-y-5 text-sm leading-relaxed text-zinc-700 dark:text-[#F5F3FF]/85">
        {children}
      </div>
    </article>
  );
}

export function AboutPage() {
  return (
    <LegalShell
      title="About AniVerve"
      description="A curated anime discovery, schedule tracking, and streaming companion designed for speed and clarity."
    >
      <p>
        AniVerve indexes rich anime metadata from AniList and MyAnimeList (Jikan) to help fans track
        seasonal releases, export personalized airing calendars, manage watchlists across devices, and
        discover new series through clean filtering and spoiler-free previews.
      </p>
      <p>
        Guests can browse the entire catalog, explore genres, inspect airing times in their local timezone,
        and track episode progress right on their device before choosing to create an optional free account.
      </p>
      <div className="pt-2 flex flex-wrap gap-3">
        <Link
          to="/explore"
          className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
        >
          Explore Catalog
        </Link>
        <Link
          to="/schedule"
          className="rounded-lg border border-zinc-200 dark:border-white/[0.08] px-4 py-2 text-xs font-semibold text-zinc-800 dark:text-[#F5F3FF]"
        >
          View Airing Schedule
        </Link>
      </div>
    </LegalShell>
  );
}

export function ContactPage() {
  return (
    <LegalShell
      title="Contact Us"
      description="Reach the AniVerve platform team for support, provider feedback, or rights inquiries."
    >
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5 space-y-3">
        <h2 className="text-base font-bold text-zinc-900 dark:text-[#F5F3FF]">Direct Channels</h2>
        <p>
          General support &amp; bug reports:{' '}
          <a href="mailto:support@aniverve.app" className="text-[#7C5CFF] dark:text-[#9B87FF] hover:underline">
            support@aniverve.app
          </a>
        </p>
        <p>
          Rights &amp; DMCA compliance:{' '}
          <a href="mailto:legal@aniverve.app" className="text-[#7C5CFF] dark:text-[#9B87FF] hover:underline">
            legal@aniverve.app
          </a>
        </p>
      </div>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      description="Guidelines governing access to AniVerve's discovery index, user accounts, and external provider integrations."
    >
      <p>
        AniVerve acts strictly as an indexing, catalog discovery, and watchlist management service.
        External video streams and embedded players are served by third-party providers configured through
        the platform administration interface.
      </p>
      <p>
        By creating an account, you agree not to automate bulk scraping, attempt unauthorized administrative
        access, or abuse public API rate limits.
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      description="How AniVerve handles guest local storage, optional account credentials, and consent-gated analytics."
    >
      <p>
        Guest progress, watchlists, and theme preferences remain strictly inside your browser storage unless
        you sign in and choose to sync them to your account.
      </p>
      <p>
        Optional analytics remain disabled until you opt in via the consent banner. AniVerve never transmits
        personal user data to AI search or recommendation endpoints.
      </p>
    </LegalShell>
  );
}

export function DmcaPage() {
  return (
    <LegalShell
      title="DMCA & Copyright Takedown Policy"
      description="How copyright holders can submit a formal takedown notice or report unauthorized external provider links."
    >
      <p>
        AniVerve does not host media files on its own servers. Streaming links and player frames reference
        external third-party providers configured by site administrators.
      </p>
      <p>
        If you believe any metadata reference or external stream provider violates your copyright, please send
        a written notice including your contact information, identification of the copyrighted work, and the
        specific AniVerve URL to{' '}
        <a href="mailto:legal@aniverve.app" className="text-[#7C5CFF] dark:text-[#9B87FF] hover:underline">
          legal@aniverve.app
        </a>
        . Verified notices are actioned promptly, and administrators can disable offending providers globally.
      </p>
    </LegalShell>
  );
}
