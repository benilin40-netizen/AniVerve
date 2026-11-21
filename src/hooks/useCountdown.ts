import { useEffect, useState } from 'react';
import { computeCountdown, type CountdownParts } from '../utils/countdown.ts';

export function useCountdown(airingAtUnixSeconds?: number | null): CountdownParts | null {
  const [parts, setParts] = useState<CountdownParts | null>(() =>
    airingAtUnixSeconds ? computeCountdown(airingAtUnixSeconds) : null
  );

  useEffect(() => {
    if (!airingAtUnixSeconds) {
      setParts(null);
      return;
    }

    setParts(computeCountdown(airingAtUnixSeconds));
    const timer = setInterval(() => {
      setParts(computeCountdown(airingAtUnixSeconds));
    }, 1000);

    return () => clearInterval(timer);
  }, [airingAtUnixSeconds]);

  return parts;
}
