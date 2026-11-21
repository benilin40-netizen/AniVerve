import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-6 py-16 text-center animate-av-enter">
      <div className="h-12 w-12 rounded-xl bg-[#9B87FF]/12 text-[#7C5CFF] dark:text-[#9B87FF] flex items-center justify-center mb-4">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-[#F5F3FF] mb-1.5">{title}</h3>
      <p className="text-sm text-zinc-600 dark:text-[#A5A1B5] max-w-md mb-6">{description}</p>
      {actionLabel && actionTo && (
        <Link
          to={actionTo}
          className="inline-flex items-center justify-center rounded-lg bg-[#7C5CFF] hover:bg-[#6A48F5] px-5 py-2.5 text-sm font-medium text-white transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center justify-center rounded-lg bg-[#7C5CFF] hover:bg-[#6A48F5] px-5 py-2.5 text-sm font-medium text-white transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
