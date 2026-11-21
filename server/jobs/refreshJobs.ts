import { getAiringSchedule } from '../services/anilistService.ts';
import { getProviders, testProviderAdapter } from '../providers/providerRegistry.ts';

export interface BackgroundJobStatus {
  name: string;
  lastRunAt: string | null;
  status: 'idle' | 'running' | 'ok' | 'error';
  lastError: string | null;
}

const jobStatuses: Record<string, BackgroundJobStatus> = {
  scheduleRefresh: { name: 'Airing Schedule Sync', lastRunAt: null, status: 'idle', lastError: null },
  providerHealthCheck: { name: 'Provider Health Monitoring (60s)', lastRunAt: null, status: 'idle', lastError: null },
};

let timersStarted = false;

export async function runScheduleRefreshJob() {
  jobStatuses.scheduleRefresh.status = 'running';
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    await getAiringSchedule(nowSec - 86400, nowSec + 7 * 86400, 1, 50);
    jobStatuses.scheduleRefresh.status = 'ok';
    jobStatuses.scheduleRefresh.lastError = null;
  } catch (err) {
    jobStatuses.scheduleRefresh.status = 'error';
    jobStatuses.scheduleRefresh.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    jobStatuses.scheduleRefresh.lastRunAt = new Date().toISOString();
  }
}

export async function runProviderHealthCheckJob() {
  jobStatuses.providerHealthCheck.status = 'running';
  try {
    const providers = await getProviders(true);
    const settled = await Promise.allSettled(
      providers.map((p) => testProviderAdapter(p, { persist: true, force: true }))
    );

    const errors: string[] = [];
    settled.forEach((outcome, idx) => {
      const providerName = providers[idx]?.name || `provider-${idx}`;
      if (outcome.status === 'rejected') {
        errors.push(
          `${providerName}: ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`
        );
      } else if (outcome.value.failedStage) {
        errors.push(`${providerName}: ${outcome.value.error || outcome.value.failedStage}`);
      }
    });

    const anySucceeded = settled.some(
      (outcome) => outcome.status === 'fulfilled' && !outcome.value.failedStage
    );

    jobStatuses.providerHealthCheck.status = anySucceeded || errors.length === 0 ? 'ok' : 'error';
    jobStatuses.providerHealthCheck.lastError = errors.length > 0 ? errors.join(' | ') : null;
  } catch (err) {
    jobStatuses.providerHealthCheck.status = 'error';
    jobStatuses.providerHealthCheck.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    jobStatuses.providerHealthCheck.lastRunAt = new Date().toISOString();
  }
}

export function startBackgroundJobs() {
  if (timersStarted) return;
  timersStarted = true;

  // Initial health check run after short startup delay
  setTimeout(() => {
    void runProviderHealthCheckJob();
  }, 3000);

  // Schedule sync every 10 minutes
  setInterval(() => {
    void runScheduleRefreshJob();
  }, 10 * 60 * 1000).unref();

  // Automatic background provider health monitoring every 60 seconds
  setInterval(() => {
    void runProviderHealthCheckJob();
  }, 60 * 1000).unref();
}

export function getBackgroundJobStatuses(): BackgroundJobStatus[] {
  return Object.values(jobStatuses);
}
