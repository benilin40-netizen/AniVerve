export type ConsentChoice = 'pending' | 'accepted' | 'declined';

const CONSENT_STORAGE_KEY = 'aniverve-consent';
const ANALYTICS_LOG_KEY = 'aniverve-analytics-events';

interface AnalyticsEventRecord {
  name: string;
  props?: Record<string, string | number | boolean>;
  timestamp: string;
}

export function getConsentChoice(): ConsentChoice {
  if (typeof window === 'undefined') return 'pending';
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === 'accepted' || raw === 'declined') return raw;
    return 'pending';
  } catch {
    return 'pending';
  }
}

export function setConsentChoice(choice: 'accepted' | 'declined'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, choice);
    if (choice === 'declined') {
      localStorage.removeItem(ANALYTICS_LOG_KEY);
    }
    window.dispatchEvent(new CustomEvent('aniverve:consent-changed', { detail: choice }));
  } catch {
    // Ignore storage errors
  }
}

export const analyticsService = {
  isEnabled(): boolean {
    return getConsentChoice() === 'accepted';
  },

  trackPageView(pathname: string): void {
    this.trackEvent('page_view', { path: pathname.slice(0, 120) });
  },

  trackEvent(name: string, props?: Record<string, string | number | boolean>): void {
    if (!this.isEnabled() || typeof window === 'undefined') return;
    try {
      const existingRaw = localStorage.getItem(ANALYTICS_LOG_KEY);
      const parsed = existingRaw ? (JSON.parse(existingRaw) as AnalyticsEventRecord[]) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      list.unshift({
        name: name.slice(0, 64),
        props,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem(ANALYTICS_LOG_KEY, JSON.stringify(list.slice(0, 50)));
    } catch {
      // Non-blocking telemetry
    }
  },
};
