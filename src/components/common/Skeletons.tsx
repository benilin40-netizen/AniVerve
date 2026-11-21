import React from 'react';

export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx}>
          <div className="aspect-[3/4] w-full rounded-xl bg-zinc-200 dark:bg-[#171722] av-shimmer" />
          <div className="mt-2.5 h-4 w-4/5 rounded bg-zinc-200 dark:bg-[#20202D] av-shimmer" />
          <div className="mt-1.5 h-3 w-3/5 rounded bg-zinc-200 dark:bg-[#171722] av-shimmer" />
        </div>
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="relative w-full h-[480px] sm:h-[540px] lg:h-[600px] overflow-hidden bg-zinc-200 dark:bg-[#11111B] av-shimmer">
      <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-12 sm:pb-16">
        <div className="space-y-3 w-full max-w-xl">
          <div className="h-4 w-40 rounded bg-zinc-300 dark:bg-[#20202D]" />
          <div className="h-11 w-full rounded bg-zinc-300 dark:bg-[#20202D]" />
          <div className="h-4 w-4/5 rounded bg-zinc-300 dark:bg-[#20202D]" />
          <div className="flex gap-3 pt-2">
            <div className="h-10 w-36 rounded-lg bg-zinc-300 dark:bg-[#20202D]" />
            <div className="h-10 w-32 rounded-lg bg-zinc-300 dark:bg-[#20202D]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-64 sm:h-80 w-full rounded-2xl bg-zinc-200 dark:bg-[#11111B] av-shimmer" />
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <div className="aspect-[3/4] w-44 md:w-full rounded-xl bg-zinc-200 dark:bg-[#171722] av-shimmer" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 rounded bg-zinc-200 dark:bg-[#20202D] av-shimmer" />
          <div className="h-4 w-1/2 rounded bg-zinc-200 dark:bg-[#171722] av-shimmer" />
          <div className="h-24 w-full rounded bg-zinc-200 dark:bg-[#171722] av-shimmer" />
        </div>
      </div>
    </div>
  );
}
