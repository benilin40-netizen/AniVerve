export const DEFAULT_SCHEDULE_TIMEZONE = 'Africa/Kampala';
const TIMEZONE_STORAGE_KEY = 'aniverve-schedule-tz';

export const SCHEDULE_TIMEZONES = [
  { value: 'Africa/Kampala', label: 'East Africa Time (Africa/Kampala · UTC+3)' },
  { value: 'Africa/Nairobi', label: 'Nairobi (Africa/Nairobi · UTC+3)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (Asia/Tokyo · UTC+9)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  { value: 'Europe/London', label: 'London (Europe/London)' },
  { value: 'America/New_York', label: 'Eastern Time (America/New_York)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (America/Los_Angeles)' },
] as const;

export function getSavedScheduleTimezone(): string {
  try {
    const saved = localStorage.getItem(TIMEZONE_STORAGE_KEY);
    if (saved && saved.trim()) {
      // Validate timezone identifier
      Intl.DateTimeFormat(undefined, { timeZone: saved.trim() });
      return saved.trim();
    }
  } catch {
    // Ignore storage or invalid timezone errors
  }
  return DEFAULT_SCHEDULE_TIMEZONE;
}

export function saveScheduleTimezone(tz: string): string {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    localStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
    return tz;
  } catch {
    return DEFAULT_SCHEDULE_TIMEZONE;
  }
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isReleased: boolean;
  totalSecondsRemaining: number;
}

export function computeCountdown(airingAtUnixSeconds: number, nowMs = Date.now()): CountdownParts {
  const targetMs = airingAtUnixSeconds * 1000;
  const diffMs = targetMs - nowMs;

  if (diffMs <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isReleased: true,
      totalSecondsRemaining: 0,
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    isReleased: false,
    totalSecondsRemaining: totalSeconds,
  };
}

export function formatCountdownString(parts: CountdownParts): string {
  if (parts.isReleased) return 'Aired';
  const pad = (n: number) => String(n).padStart(2, '0');
  if (parts.days > 0) {
    return `${parts.days}d ${pad(parts.hours)}h ${pad(parts.minutes)}m ${pad(parts.seconds)}s`;
  }
  return `${pad(parts.hours)}h ${pad(parts.minutes)}m ${pad(parts.seconds)}s`;
}

export function getWeekdayKeyInTimezone(unixSeconds: number, timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  const date = new Date(unixSeconds * 1000);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    })
      .format(date)
      .toLowerCase()
      .slice(0, 3);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: DEFAULT_SCHEDULE_TIMEZONE,
      weekday: 'short',
    })
      .format(date)
      .toLowerCase()
      .slice(0, 3);
  }
}

export function getDateKeyInTimezone(unixSeconds: number, timeZone = DEFAULT_SCHEDULE_TIMEZONE): string {
  const date = new Date(unixSeconds * 1000);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: DEFAULT_SCHEDULE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

export function formatLocalReleaseTime(
  airingAtUnixSeconds: number,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): {
  dateLabel: string;
  timeLabel: string;
  timezoneLabel: string;
  weekdayKey: string;
  dateKey: string;
} {
  const date = new Date(airingAtUnixSeconds * 1000);
  let safeTz = timeZone;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: safeTz });
  } catch {
    safeTz = DEFAULT_SCHEDULE_TIMEZONE;
  }

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);

  const timeLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return {
    dateLabel,
    timeLabel,
    timezoneLabel: safeTz,
    weekdayKey: getWeekdayKeyInTimezone(airingAtUnixSeconds, safeTz),
    dateKey: getDateKeyInTimezone(airingAtUnixSeconds, safeTz),
  };
}
