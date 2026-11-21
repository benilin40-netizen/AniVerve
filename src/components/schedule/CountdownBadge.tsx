import React from 'react';
import { useCountdown } from '../../hooks/useCountdown.ts';
import { formatCountdownString } from '../../utils/countdown.ts';

export function CountdownBadge({ airingAt }: { airingAt?: number | null }) {
  const validTimestamp = typeof airingAt === 'number' && Number.isFinite(airingAt) && airingAt > 0;
  const parts = useCountdown(validTimestamp ? airingAt : null);

  if (!validTimestamp || !parts) {
    return (
      <span className="font-mono text-xs text-zinc-500 dark:text-[#A5A1B5]">
        Information unavailable.
      </span>
    );
  }

  return (
    <span
      className={`font-mono text-xs font-semibold tabular-nums ${
        parts.isReleased
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-[#7C5CFF] dark:text-[#9B87FF]'
      }`}
    >
      {parts.isReleased ? 'Broadcast time passed' : formatCountdownString(parts)}
    </span>
  );
}
