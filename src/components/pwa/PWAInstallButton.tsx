import React, { useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useOnlineStatus, usePWAInstall } from '../../hooks/usePWA.ts';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const [installing, setInstalling] = useState(false);

  if (!canInstall || isInstalled) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleInstall()}
      disabled={installing}
      aria-label="Install AniVerve App"
      className={`av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-[#9B87FF]/40 bg-[#7C5CFF]/15 hover:bg-[#7C5CFF] text-[#7C5CFF] dark:text-[#9B87FF] hover:text-white transition-colors font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
        compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'
      }`}
    >
      <Download className="h-3.5 w-3.5 shrink-0" />
      <span className={compact ? 'hidden xl:inline' : ''}>
        {installing ? 'Installing...' : 'Install App'}
      </span>
    </button>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 sm:top-[68px] inset-x-0 z-30 flex justify-center px-4 pointer-events-none"
    >
      <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-[#11111B]/95 px-3.5 py-1.5 text-xs font-medium text-amber-200 shadow-lg backdrop-blur-md pointer-events-auto">
        <WifiOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span>You are offline — showing cached catalog data</span>
      </div>
    </div>
  );
}

export function PWAUpdatePrompt() {
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh || dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Application update available"
      className="fixed bottom-20 md:bottom-5 left-4 z-40 max-w-sm rounded-xl border border-[#9B87FF]/40 bg-white dark:bg-[#171722] p-3.5 shadow-2xl flex items-center gap-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF]">
          AniVerve update ready
        </p>
        <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
          Reload to apply the latest speed and security improvements.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="av-btn-press inline-flex items-center gap-1 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3 py-1.5 text-xs font-semibold text-white shrink-0"
      >
        <RefreshCw className="h-3 w-3" />
        Update
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notification"
        className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
