import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useInView } from '../../hooks/useInView.ts';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  to?: string;
  linkLabel?: string;
  action?: React.ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  to,
  linkLabel = 'View All',
  action,
}: SectionHeaderProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`av-reveal ${inView ? 'av-reveal-visible' : ''} flex items-end justify-between gap-4`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          <span
            aria-hidden="true"
            className="h-[2.5px] w-5 rounded-full bg-gradient-to-r from-[#9B87FF] to-[#7C5CFF] shrink-0"
          />
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF] truncate">
            {title}
          </h2>
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-[#A5A1B5] truncate pl-7.5">
            {subtitle}
          </p>
        )}
      </div>

      {action ? (
        <div className="shrink-0">{action}</div>
      ) : to ? (
        <Link
          to={to}
          className="group inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:text-[#6844F5] dark:hover:text-[#F5F3FF] transition-colors whitespace-nowrap shrink-0"
        >
          <span>{linkLabel}</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      ) : null}
    </div>
  );
}
