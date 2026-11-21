import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit3,
  Link2,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  X,
  XCircle,
} from 'lucide-react';
import type {
  ProviderDiagnosticStageKey,
  ProviderHealthLifecycleState,
  ProviderTestResult,
  StreamingProvider,
  UnifiedPlaybackTelemetry,
} from '../../types/anime.ts';
import { createProviderAdapter } from '../../providers/adapters/index.ts';
import { apiFetch } from '../../services/apiClient.ts';
import { useToast } from '../../context/ToastContext.tsx';

interface ProviderManagerProps {
  providers: StreamingProvider[];
  telemetry: UnifiedPlaybackTelemetry | null;
  onReload: () => Promise<void> | void;
}

const STAGE_LABEL: Record<ProviderDiagnosticStageKey, string> = {
  url_syntax: 'Stage A · URL Syntax',
  hostname: 'Stage B · Hostname Validation',
  api_connectivity: 'Stage C · API Connectivity',
  url_generation: 'Stage D · Player URL Generation',
  iframe_init: 'Stage E · Iframe Initialization',
};

const HEALTH_STATE_META: Record<ProviderHealthLifecycleState, { label: string; cls: string }> = {
  INITIALIZING: { label: 'INITIALIZING', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  READY: { label: 'READY', cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  ACTIVE: { label: 'ACTIVE', cls: 'bg-[#7C5CFF]/25 text-[#9B87FF] border-[#9B87FF]/50 font-bold' },
  DEGRADED: { label: 'DEGRADED', cls: 'bg-orange-500/15 text-orange-500 border-orange-500/30' },
  FAILED: { label: 'FAILED', cls: 'bg-rose-500/15 text-rose-500 border-rose-500/30' },
  RECOVERING: { label: 'RECOVERING', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
};

function formatServerStatus(p?: StreamingProvider): string {
  if (!p) return 'Not Registered';
  if (!p.urlTemplate || !p.baseUrl) return 'Unconfigured';
  const validConfig = createProviderAdapter(p).validateConfiguration().valid;
  if (!validConfig) return 'Config Error';
  if (!p.licenseVerified) return 'Unverified';
  if (p.embeddingAllowed === false) return 'Blocked';
  if (!p.isEnabled) return 'Disabled';
  return p.availabilityStatus === 'unreachable' ? 'Degraded' : 'Ready';
}

function StageBadge({ passed }: { passed: boolean | null }) {
  if (passed === true) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Pass
      </span>
    );
  }
  if (passed === false) {
    return (
      <span className="inline-flex items-center gap-1 text-rose-500 font-semibold">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        Fail
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-zinc-400 dark:text-[#A5A1B5]">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      Skipped
    </span>
  );
}

export function ProviderManager({ providers, telemetry, onReload }: ProviderManagerProps) {
  const { showToast } = useToast();

  const [autoManageEnabled, setAutoManageEnabled] = useState(true);
  const [testAnilistId, setTestAnilistId] = useState(16498);
  const [testEpisode, setTestEpisode] = useState(1);
  const [testTrack, setTestTrack] = useState<'sub' | 'dub'>('sub');
  const [testStartSec, setTestStartSec] = useState(0);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});
  const [iframeLoadedMap, setIframeLoadedMap] = useState<Record<string, boolean>>({});
  const [iframePreview, setIframePreview] = useState<{
    key: string;
    name: string;
    url: string;
    loaded: boolean;
    error: string | null;
  } | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);
  const [permissionDocNote, setPermissionDocNote] = useState('');
  const [editForm, setEditForm] = useState<{
    name: string;
    baseUrl: string;
    urlTemplate: string;
    supportedLanguages: Array<'sub' | 'dub'>;
    priority: number;
    verificationNotes: string;
  } | null>(null);

  const sortedProviders = [...providers].sort((a, b) => a.priority - b.priority);
  const primaryProvider = sortedProviders.find((p) => p.priority === 1) || sortedProviders[0];
  const backupProvider = sortedProviders.find((p) => p.key !== primaryProvider?.key) || sortedProviders[1];

  const configuredCount = providers.filter((p) =>
    createProviderAdapter(p).validateConfiguration().valid
  ).length;
  const activeCount = providers.filter(
    (p) => p.isEnabled && p.licenseVerified && p.embeddingAllowed !== false
  ).length;

  const openEdit = (p: StreamingProvider) => {
    setEditingKey(p.key);
    setEditForm({
      name: p.name,
      baseUrl: p.baseUrl || '',
      urlTemplate: p.urlTemplate || '',
      supportedLanguages: (p.supportedLanguages?.length
        ? p.supportedLanguages.filter((l): l is 'sub' | 'dub' => l === 'sub' || l === 'dub')
        : ['sub', 'dub']) as Array<'sub' | 'dub'>,
      priority: p.priority,
      verificationNotes: p.verificationNotes || '',
    });
  };

  const handleSaveEdit = async (key: string) => {
    if (!editForm) return;
    try {
      await apiFetch(`/api/admin/providers/${key}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      setEditingKey(null);
      setEditForm(null);
      showToast(`Saved configuration for ${editForm.name}.`, 'success');
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save provider.', 'error');
    }
  };

  const handleToggleEnabled = async (p: StreamingProvider) => {
    try {
      await apiFetch(`/api/admin/providers/${p.key}`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled: !p.isEnabled }),
      });
      showToast(
        `${p.name} ${!p.isEnabled ? 'enabled' : 'disabled'}.`,
        !p.isEnabled ? 'success' : 'info'
      );
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Cannot change server state.', 'error');
    }
  };

  const handleChangePriority = async (p: StreamingProvider, priority: number) => {
    try {
      await apiFetch(`/api/admin/providers/${p.key}`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      const roleLabel = priority === 1 ? 'Primary' : priority === 2 ? 'Secondary' : 'Backup';
      showToast(
        `${p.name} set to ${roleLabel} (Priority ${priority}).`,
        'success'
      );
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update priority.', 'error');
    }
  };

  const handleVerifyLicense = async (
    p: StreamingProvider,
    verified: boolean,
    customNotes?: string
  ) => {
    const notesToSubmit = (customNotes ?? p.verificationNotes ?? '').trim();
    if (verified && notesToSubmit.length < 12) {
      setVerifyingKey(p.key);
      setPermissionDocNote(notesToSubmit);
      showToast(
        'Enter documented written/partner authorization (>= 12 chars) before verifying permission.',
        'info'
      );
      return;
    }

    setTestingKey(p.key);
    try {
      const res = await apiFetch<{
        provider: StreamingProvider;
        testResult: ProviderTestResult | null;
      }>(`/api/admin/providers/${p.key}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          verified,
          anilistId: testAnilistId,
          episode: testEpisode,
          verificationNotes: notesToSubmit || undefined,
        }),
      });
      if (res.testResult) {
        setTestResults((prev) => ({ ...prev, [p.key]: res.testResult! }));
      }
      setVerifyingKey(null);
      setPermissionDocNote('');
      showToast(
        verified
          ? `${p.name} permission recorded and technical checks verified.`
          : `${p.name} verification revoked and server disabled.`,
        verified ? 'success' : 'info'
      );
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Verification failed.', 'error');
      await onReload();
    } finally {
      setTestingKey(null);
    }
  };

  const getActiveInputsForTest = (p: StreamingProvider) => {
    if (editingKey === p.key && editForm) {
      return {
        baseUrl: editForm.baseUrl,
        urlTemplate: editForm.urlTemplate,
        isDraft: true,
      };
    }
    return {
      baseUrl: p.baseUrl || '',
      urlTemplate: p.urlTemplate || '',
      isDraft: false,
    };
  };

  const handleTestUrlGeneration = async (p: StreamingProvider) => {
    setTestingKey(p.key);
    const inputs = getActiveInputsForTest(p);
    try {
      const res = await apiFetch<ProviderTestResult>('/api/admin/providers/test', {
        method: 'POST',
        body: JSON.stringify({
          key: p.key,
          baseUrl: inputs.baseUrl,
          urlTemplate: inputs.urlTemplate,
          anilistId: testAnilistId,
          episode: testEpisode,
          track: testTrack,
          startSec: testStartSec,
          mode: 'url',
        }),
      });
      setTestResults((prev) => ({ ...prev, [p.key]: res }));
      showToast(
        res.resolvedUrl
          ? `${p.name} URL syntax, hostname & generation passed.`
          : res.error || 'URL validation failed.',
        res.resolvedUrl ? 'success' : 'error'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'URL generation test failed.', 'error');
    } finally {
      setTestingKey(null);
    }
  };

  const handleTestIframeInit = async (p: StreamingProvider) => {
    setTestingKey(p.key);
    const inputs = getActiveInputsForTest(p);
    try {
      const res = await apiFetch<ProviderTestResult>('/api/admin/providers/test', {
        method: 'POST',
        body: JSON.stringify({
          key: p.key,
          baseUrl: inputs.baseUrl,
          urlTemplate: inputs.urlTemplate,
          anilistId: testAnilistId,
          episode: testEpisode,
          track: testTrack,
          startSec: testStartSec,
          mode: 'probe',
          persist: !inputs.isDraft,
        }),
      });
      setTestResults((prev) => ({ ...prev, [p.key]: res }));

      if (
        res.stages.playerUrlGeneration.passed &&
        res.embeddingAllowed &&
        res.resolvedUrl
      ) {
        setIframePreview({
          key: p.key,
          name: p.name,
          url: res.resolvedUrl,
          loaded: false,
          error: null,
        });
      }

      if (!res.failedStage) {
        showToast(
          `${p.name}: API & embed probe passed (HTTP ${res.status} · ${res.latencyMs}ms).`,
          'success'
        );
      } else {
        showToast(
          `${p.name} (${STAGE_LABEL[res.failedStage]}): ${res.error || 'Probe failed'}`,
          'error'
        );
      }
      await onReload();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Provider connectivity test failed.',
        'error'
      );
    } finally {
      setTestingKey(null);
    }
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      const res = await apiFetch<{ results: ProviderTestResult[] }>(
        '/api/admin/providers/test-all',
        {
          method: 'POST',
          body: JSON.stringify({
            anilistId: testAnilistId,
            episode: testEpisode,
            track: testTrack,
          }),
        }
      );
      const map: Record<string, ProviderTestResult> = {};
      for (const r of res.results) {
        map[r.providerKey] = r;
      }
      setTestResults(map);
      const passed = res.results.filter((r) => !r.failedStage).length;
      showToast(
        `Probed ${res.results.length} servers: ${passed}/${res.results.length} passed all stages.`,
        passed > 0 ? 'info' : 'error'
      );
      await onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Probe failed.', 'error');
    } finally {
      setTestingAll(false);
    }
  };

  const handleReportAdminIframeLoad = async (
    key: string,
    initialized: boolean,
    errorMsg?: string
  ) => {
    setIframeLoadedMap((prev) => ({ ...prev, [key]: initialized }));
    try {
      await apiFetch(`/api/admin/providers/${key}/iframe-status`, {
        method: 'POST',
        body: JSON.stringify({ initialized, error: errorMsg || null }),
      });
      await onReload();
    } catch {
      // Non-blocking telemetry persistence
    }
  };

  const matchedActiveProvider = providers.find((p) => p.key === telemetry?.currentActiveServer);
  const firstEnabledProvider = sortedProviders.find((p) => p.isEnabled);
  const activeServerLabel =
    matchedActiveProvider?.name || firstEnabledProvider?.name || 'None';
  const totalProviderCount = Math.max(providers.length, 1);

  return (
    <div className="space-y-6">
      {/* UNIFIED PLAYBACK SYSTEM Header & Telemetry Grid */}
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-[#7C5CFF] dark:text-[#9B87FF]">
              <Activity className="h-3.5 w-3.5" />
              <span>UNIFIED PLAYBACK SYSTEM &amp; AUTO HEALTH MONITORING</span>
            </div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-[#F5F3FF] mt-1">
              Multi-Provider Streaming &amp; Intelligent Automatic Failover Console
            </h2>
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] mt-0.5">
              Priority failover across Yenime (Primary) and AniEmbed (Backup).
              Background health monitoring runs every 60 seconds with automatic recovery detection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3.5 py-2 text-xs">
              <span className="font-medium text-zinc-700 dark:text-[#F5F3FF]">
                Automatic Provider Management
              </span>
              <input
                type="checkbox"
                checked={autoManageEnabled}
                onChange={(e) => setAutoManageEnabled(e.target.checked)}
                className="rounded accent-[#7C5CFF]"
              />
            </label>

            <button
              type="button"
              disabled={testingAll}
              onClick={() => void handleTestAll()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap shrink-0 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testingAll ? 'animate-spin' : ''}`} />
              {testingAll ? 'Probing Providers...' : 'Probe All Providers'}
            </button>
          </div>
        </div>

        {/* Status Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5">
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">Current Active Server</p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] mt-0.5">
              {activeServerLabel}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5">
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
              Primary Server ({primaryProvider?.name || 'Yenime'})
            </p>
            <p className="text-sm font-semibold text-emerald-500 mt-0.5">
              {formatServerStatus(primaryProvider)}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5">
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
              Secondary Server ({backupProvider?.name || 'AniEmbed'})
            </p>
            <p className="text-sm font-semibold text-[#9B87FF] mt-0.5">
              {formatServerStatus(backupProvider)}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5">
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
              Provider Configuration Status
            </p>
            <p className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] mt-0.5 tabular-nums">
              {configuredCount}/{totalProviderCount} HTTPS · {activeCount}/{totalProviderCount} Active
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5">
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
              Last Successful Initialization
            </p>
            <p className="text-xs font-medium text-zinc-900 dark:text-[#F5F3FF] mt-1">
              {telemetry?.lastSuccessfulInitAt
                ? `${telemetry.lastSuccessfulServer || 'server'} · ${new Date(telemetry.lastSuccessfulInitAt).toLocaleString()}`
                : 'No live client confirmation recorded yet'}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5">
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">Last Confirmed Playback</p>
            <p className="text-xs font-medium text-zinc-900 dark:text-[#F5F3FF] mt-1">
              {telemetry?.lastConfirmedPlaybackAt
                ? new Date(telemetry.lastConfirmedPlaybackAt).toLocaleTimeString()
                : 'None yet'}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5">
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">Failover Count / Last Fallback</p>
            <p className="text-xs font-medium text-zinc-900 dark:text-[#F5F3FF] mt-1 truncate">
              {telemetry?.failoverCount ?? 0} failover(s)
              {telemetry?.lastFallbackEvent
                ? ` (${telemetry.lastFallbackEvent.from} → ${telemetry.lastFallbackEvent.to})`
                : ''}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5">
            <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">Last Health Check / Error</p>
            <p
              className="text-xs font-medium text-rose-500 mt-1 truncate"
              title={telemetry?.lastError?.message || ''}
            >
              {telemetry?.lastError
                ? `${telemetry.lastError.server}: ${telemetry.lastError.message}`
                : 'All background checks operational'}
            </p>
          </div>
        </div>

        {/* Probe Input Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
              Test AniList ID
            </span>
            <input
              type="number"
              min={1}
              value={testAnilistId}
              onChange={(e) => setTestAnilistId(Math.max(1, Number(e.target.value) || 16498))}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-1.5 text-xs font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
              Test Episode
            </span>
            <input
              type="number"
              min={1}
              value={testEpisode}
              onChange={(e) => setTestEpisode(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-1.5 text-xs font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
              Test Audio Track
            </span>
            <select
              value={testTrack}
              onChange={(e) => setTestTrack(e.target.value === 'dub' ? 'dub' : 'sub')}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-1.5 text-xs"
            >
              <option value="sub">SUB (sub)</option>
              <option value="dub">DUB (dub)</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
              Test Start Position (sec)
            </span>
            <input
              type="number"
              min={0}
              value={testStartSec}
              onChange={(e) => setTestStartSec(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-1.5 text-xs font-mono"
            />
          </label>
        </div>
      </div>

      {/* Live Iframe Initialization Preview Box */}
      {iframePreview && (
        <div className="rounded-2xl border border-[#9B87FF]/40 bg-white dark:bg-[#171722] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                Stage E · Iframe Initialization Test — {iframePreview.name}
              </span>
              <span className="ml-2 text-zinc-500 dark:text-[#A5A1B5]">
                {iframePreview.error
                  ? `Failed: ${iframePreview.error}`
                  : iframePreview.loaded
                    ? 'Iframe loaded in browser (video stream playback unconfirmed)'
                    : 'Initializing iframe element...'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIframePreview(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-2.5 py-1 text-zinc-600 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D]"
            >
              <X className="h-3.5 w-3.5" />
              Close Preview
            </button>
          </div>
          <p className="font-mono text-[11px] text-zinc-500 dark:text-[#A5A1B5] break-all">
            {iframePreview.url}
          </p>
          <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-black">
            <iframe
              src={iframePreview.url}
              title={`Admin Test Frame — ${iframePreview.name}`}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
              allowFullScreen
              referrerPolicy="origin"
              onLoad={() => {
                setIframePreview((prev) => (prev ? { ...prev, loaded: true, error: null } : null));
                void handleReportAdminIframeLoad(iframePreview.key, true);
              }}
              onError={() => {
                const errText = 'Iframe element triggered onError.';
                setIframePreview((prev) => (prev ? { ...prev, error: errText } : null));
                void handleReportAdminIframeLoad(iframePreview.key, false, errText);
              }}
            />
          </div>
        </div>
      )}

      {/* Server Cards (Yenime & AniEmbed) */}
      <div className="space-y-4">
        {sortedProviders.map((p) => {
          const liveTest = testResults[p.key];
          const isEditing = editingKey === p.key;
          const adapterValidation = createProviderAdapter(p).validateConfiguration();
          const urlIsValid = liveTest ? liveTest.urlValid && liveTest.hostnameValid : adapterValidation.valid;
          const apiIsReachable =
            liveTest && liveTest.stages.apiConnectivity.passed !== null
              ? liveTest.apiReachable
              : p.apiReachable;
          const playerInit =
            iframeLoadedMap[p.key] !== undefined
              ? iframeLoadedMap[p.key]
              : liveTest && liveTest.stages.iframeInitialization.passed !== null
                ? liveTest.stages.iframeInitialization.passed
                : p.playerInitialized;

          const priorityText =
            p.priority <= 1 ? 'Primary' : p.priority === 2 ? 'Secondary' : 'Backup';
          const templateConfigured = Boolean(p.urlTemplate && p.urlTemplate.trim());
          const healthState: ProviderHealthLifecycleState =
            p.healthState || (p.availabilityStatus === 'available' ? 'READY' : 'INITIALIZING');
          const healthMeta = HEALTH_STATE_META[healthState] || HEALTH_STATE_META.READY;

          return (
            <div
              key={p.key}
              className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5 space-y-4 text-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-bold text-zinc-900 dark:text-[#F5F3FF]">
                      {p.name}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${healthMeta.cls}`}
                    >
                      {p.operationalStatus || healthMeta.label}
                    </span>
                    {p.apiHealthState && (
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                        API:{' '}
                        <strong
                          className={
                            p.apiHealthState === 'healthy'
                              ? 'text-emerald-500'
                              : p.apiHealthState === 'degraded'
                                ? 'text-amber-500'
                                : 'text-rose-500'
                          }
                        >
                          {p.apiHealthState}
                        </strong>
                      </span>
                    )}
                    {p.playbackHealthState && (
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                        Playback:{' '}
                        <strong
                          className={
                            p.playbackHealthState === 'healthy'
                              ? 'text-emerald-500'
                              : p.playbackHealthState === 'degraded'
                                ? 'text-amber-500'
                                : 'text-rose-500'
                          }
                        >
                          {p.playbackHealthState}
                        </strong>
                      </span>
                    )}
                    {p.cooldownUntil && new Date(p.cooldownUntil).getTime() > Date.now() && (
                      <span className="text-[11px] font-mono text-amber-500 tabular-nums">
                        Cooldown until {new Date(p.cooldownUntil).toLocaleTimeString()}
                      </span>
                    )}
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                      Priority: <strong className="text-zinc-900 dark:text-[#F5F3FF]">{priorityText}</strong>
                    </span>
                    <span className="text-zinc-400 dark:text-white/20">·</span>
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                      Player template:{' '}
                      <strong
                        className={
                          templateConfigured
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-500'
                        }
                      >
                        {templateConfigured ? 'Configured' : 'Unconfigured'}
                      </strong>
                    </span>
                  </div>

                  <div className="space-y-0.5 text-[11px]">
                    <p className="text-zinc-500 dark:text-[#A5A1B5]">
                      Base URL:{' '}
                      <span className="font-mono text-zinc-800 dark:text-[#F5F3FF]">
                        {p.baseUrl || 'Unconfigured'}
                      </span>
                    </p>
                    <p className="text-zinc-500 dark:text-[#A5A1B5] break-all">
                      Template:{' '}
                      <span className="font-mono text-zinc-600 dark:text-[#A5A1B5]">
                        {p.urlTemplate || 'Not configured'}
                      </span>
                    </p>
                  </div>

                  {/* Four Separate Status Indicators */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1.5">
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        URL valid
                      </p>
                      <p
                        className={`mt-0.5 font-semibold inline-flex items-center gap-1 ${
                          urlIsValid ? 'text-emerald-500' : 'text-rose-500'
                        }`}
                      >
                        {urlIsValid ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {urlIsValid ? 'Valid HTTPS' : 'Invalid'}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        API reachable
                      </p>
                      <p
                        className={`mt-0.5 font-semibold inline-flex items-center gap-1 ${
                          apiIsReachable === true
                            ? 'text-emerald-500'
                            : apiIsReachable === false
                              ? 'text-rose-500'
                              : 'text-zinc-500 dark:text-[#A5A1B5]'
                        }`}
                      >
                        {apiIsReachable === true ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : apiIsReachable === false ? (
                          <XCircle className="h-3.5 w-3.5" />
                        ) : (
                          <Clock className="h-3.5 w-3.5" />
                        )}
                        {apiIsReachable === true
                          ? `Reachable${liveTest?.stages.apiConnectivity.status ? ` (${liveTest.stages.apiConnectivity.status})` : p.lastHttpStatus ? ` (${p.lastHttpStatus})` : ''}`
                          : apiIsReachable === false
                            ? 'Unreachable'
                            : 'Untested'}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        Player initialized
                      </p>
                      <p
                        className={`mt-0.5 font-semibold inline-flex items-center gap-1 ${
                          p.embeddingAllowed === false || playerInit === false
                            ? 'text-rose-500'
                            : iframeLoadedMap[p.key] || p.playerInitialized === true
                              ? 'text-emerald-500'
                              : playerInit === true
                                ? 'text-sky-500'
                                : 'text-zinc-500 dark:text-[#A5A1B5]'
                        }`}
                      >
                        {p.embeddingAllowed === false || playerInit === false ? (
                          <XCircle className="h-3.5 w-3.5" />
                        ) : iframeLoadedMap[p.key] || p.playerInitialized === true || playerInit === true ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <Clock className="h-3.5 w-3.5" />
                        )}
                        {p.embeddingAllowed === false
                          ? 'Blocked'
                          : iframeLoadedMap[p.key] || p.playerInitialized === true
                            ? 'Initialized'
                            : playerInit === true
                              ? 'Endpoint Ready'
                              : playerInit === false
                                ? 'Failed'
                                : 'Untested'}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        Permission verified
                      </p>
                      <p
                        className={`mt-0.5 font-semibold inline-flex items-center gap-1 ${
                          p.licenseVerified ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      >
                        {p.licenseVerified ? (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        ) : (
                          <ShieldOff className="h-3.5 w-3.5" />
                        )}
                        {p.licenseVerified ? 'Verified' : 'Auto-Active'}
                      </p>
                    </div>
                  </div>

                  {!adapterValidation.valid && adapterValidation.error && (
                    <p className="text-[11px] text-rose-500 flex items-center gap-1 pt-0.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {adapterValidation.error}
                    </p>
                  )}

                  {/* Operational Diagnostics Strip (Enabled, API Health, Latency, Episodes, Streams, Subtitles, Last Test) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 pt-1 text-[11px]">
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        Enabled Status
                      </p>
                      <p className={`mt-0.5 font-semibold ${p.isEnabled ? 'text-emerald-500' : 'text-zinc-500'}`}>
                        {p.isEnabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        API Health
                      </p>
                      <p
                        className={`mt-0.5 font-semibold capitalize ${
                          p.diagnostics?.apiHealth === 'healthy'
                            ? 'text-emerald-500'
                            : p.diagnostics?.apiHealth === 'degraded'
                              ? 'text-amber-500'
                              : p.diagnostics?.apiHealth === 'unreachable'
                                ? 'text-rose-500'
                                : 'text-zinc-500 dark:text-[#A5A1B5]'
                        }`}
                      >
                        {p.diagnostics?.apiHealth || (apiIsReachable ? 'healthy' : 'untested')}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        Response Time
                      </p>
                      <p className="mt-0.5 font-semibold text-zinc-800 dark:text-[#F5F3FF] tabular-nums">
                        {p.diagnostics?.searchLatencyMs != null
                          ? `${p.diagnostics.searchLatencyMs} ms`
                          : p.averageResponseTimeMs != null
                            ? `${Math.round(p.averageResponseTimeMs)} ms`
                            : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        Episode Discovery
                      </p>
                      <p className="mt-0.5 font-semibold capitalize text-zinc-800 dark:text-[#F5F3FF]">
                        {p.diagnostics?.episodeDiscoveryStatus || (p.isEnabled ? 'ready' : 'untested')}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        Stream Resolution
                      </p>
                      <p className="mt-0.5 font-semibold capitalize text-zinc-800 dark:text-[#F5F3FF]">
                        {p.diagnostics?.streamResolutionStatus || (p.isEnabled ? 'ready' : 'untested')}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        Subtitles
                      </p>
                      <p className="mt-0.5 font-semibold capitalize text-zinc-800 dark:text-[#F5F3FF]">
                        {p.diagnostics?.subtitleAvailability ||
                          (p.supportedLanguages.includes('sub') ? 'available' : 'unavailable')}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                        Last Successful Test
                      </p>
                      <p className="mt-0.5 font-medium text-zinc-700 dark:text-[#F5F3FF] truncate">
                        {p.diagnostics?.lastTestedAt || p.lastSuccessAt
                          ? new Date(
                              (p.diagnostics?.lastTestedAt || p.lastSuccessAt)!
                            ).toLocaleTimeString()
                          : 'Never'}
                      </p>
                    </div>
                  </div>

                  <p className="text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                    IDs: AniList / MAL · Audio: {p.supportedLanguages.join(', ').toUpperCase()} ·
                    Errors: {p.errorCount}
                    {p.lastHttpStatus !== null && p.lastHttpStatus !== undefined
                      ? ` · Last HTTP: ${p.lastHttpStatus}`
                      : ''}
                    {p.consecutiveFailures !== undefined && p.consecutiveFailures > 0
                      ? ` · Failures: ${p.consecutiveFailures}`
                      : ''}
                  </p>
                  {p.verificationNotes && (
                    <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
                      Notes: {p.verificationNotes}
                    </p>
                  )}
                  {p.lastError && (
                    <p className="text-[11px] text-rose-500">Last Error: {p.lastError}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    aria-label={`${p.name} priority`}
                    value={p.priority <= 1 ? 1 : p.priority === 2 ? 2 : 3}
                    onChange={(e) => void handleChangePriority(p, Number(e.target.value))}
                    className="rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-transparent dark:bg-[#11111B] px-2.5 py-1.5 font-medium"
                  >
                    <option value={1}>Priority: Primary (1)</option>
                    <option value={2}>Priority: Secondary (2)</option>
                    <option value={3}>Priority: Backup (3)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => (isEditing ? setEditingKey(null) : openEdit(p))}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-2.5 py-1.5 font-medium hover:bg-zinc-100 dark:hover:bg-[#20202D] transition-colors"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    {isEditing ? 'Close' : 'Configure'}
                  </button>

                  <button
                    type="button"
                    disabled={testingKey === p.key}
                    onClick={() => void handleTestUrlGeneration(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-2.5 py-1.5 font-medium hover:bg-zinc-100 dark:hover:bg-[#20202D] disabled:opacity-50 transition-colors"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Test URL
                  </button>

                  <button
                    type="button"
                    disabled={testingKey === p.key}
                    onClick={() => void handleTestIframeInit(p)}
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-2.5 py-1.5 font-medium hover:bg-zinc-100 dark:hover:bg-[#20202D] disabled:opacity-50 transition-colors"
                  >
                    <MonitorPlay className="h-3.5 w-3.5" />
                    {testingKey === p.key ? 'Probing...' : 'Test Iframe Init'}
                  </button>

                  <button
                    type="button"
                    disabled={testingKey === p.key}
                    onClick={() => {
                      if (p.licenseVerified) {
                        void handleVerifyLicense(p, false);
                      } else {
                        setVerifyingKey((prev) => (prev === p.key ? null : p.key));
                        setPermissionDocNote(p.verificationNotes || '');
                      }
                    }}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium ${
                      p.licenseVerified
                        ? 'border border-amber-500/40 text-amber-500 hover:bg-amber-500/10'
                        : 'border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'
                    }`}
                  >
                    {p.licenseVerified ? 'Revoke Verify' : 'Verify Permission'}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleToggleEnabled(p)}
                    className={`rounded-lg px-3 py-1.5 font-semibold text-white transition-colors ${
                      p.isEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-zinc-600 hover:bg-zinc-700'
                    }`}
                  >
                    {p.isEnabled ? 'Enabled' : 'Disabled'}
                  </button>

                  {p.errorCount > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/providers/${p.key}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ resetErrors: true }),
                        });
                        await onReload();
                      }}
                      className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-2.5 py-1.5 text-zinc-600 dark:text-[#A5A1B5]"
                    >
                      Reset Errors
                    </button>
                  )}
                </div>
              </div>

              {/* 5-Stage Diagnostic Breakdown */}
              {liveTest && (
                <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-semibold">
                    {!liveTest.failedStage ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {liveTest.stages.apiConnectivity.passed === null
                          ? 'URL Syntax, Hostname & Episode URL Generation Passed'
                          : `All Diagnostic Stages Passed (HTTP ${liveTest.status} · ${liveTest.latencyMs}ms)`}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-rose-500">
                        <XCircle className="h-3.5 w-3.5" />
                        {STAGE_LABEL[liveTest.failedStage]} Failed
                        {liveTest.status > 0 ? ` (HTTP ${liveTest.status})` : ''}
                      </span>
                    )}
                    <span className="text-[11px] font-normal text-zinc-500 dark:text-[#A5A1B5]">
                      {new Date(liveTest.testedAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {liveTest.error && (
                    <p className="inline-flex items-start gap-1.5 text-rose-500 text-[11px]">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{liveTest.error}</span>
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px]">
                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-[#171722] p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-700 dark:text-[#F5F3FF]">
                          A. URL Syntax
                        </span>
                        <StageBadge passed={liveTest.stages.urlSyntax.passed} />
                      </div>
                      <p className="text-zinc-500 dark:text-[#A5A1B5] leading-snug">
                        {liveTest.stages.urlSyntax.message}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-[#171722] p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-700 dark:text-[#F5F3FF]">
                          B. Hostname
                        </span>
                        <StageBadge passed={liveTest.stages.hostname.passed} />
                      </div>
                      <p className="text-zinc-500 dark:text-[#A5A1B5] leading-snug">
                        {liveTest.stages.hostname.message}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-[#171722] p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-700 dark:text-[#F5F3FF]">
                          C. API Connectivity
                        </span>
                        <StageBadge passed={liveTest.stages.apiConnectivity.passed} />
                      </div>
                      <p className="text-zinc-500 dark:text-[#A5A1B5] leading-snug">
                        {liveTest.stages.apiConnectivity.message}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-[#171722] p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-700 dark:text-[#F5F3FF]">
                          D. URL Generation
                        </span>
                        <StageBadge passed={liveTest.stages.playerUrlGeneration.passed} />
                      </div>
                      <p className="text-zinc-500 dark:text-[#A5A1B5] leading-snug">
                        {liveTest.stages.playerUrlGeneration.message}
                      </p>
                    </div>

                    <div className="rounded-lg border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-[#171722] p-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-700 dark:text-[#F5F3FF]">
                          E. Iframe Init
                        </span>
                        <StageBadge passed={liveTest.stages.iframeInitialization.passed} />
                      </div>
                      <p className="text-zinc-500 dark:text-[#A5A1B5] leading-snug">
                        {liveTest.stages.iframeInitialization.message}
                      </p>
                    </div>
                  </div>

                  {liveTest.resolvedUrl && (
                    <p className="font-mono text-[11px] text-zinc-500 dark:text-[#A5A1B5] break-all pt-0.5">
                      Resolved Player URL: {liveTest.resolvedUrl}
                    </p>
                  )}
                </div>
              )}

              {verifyingKey === p.key && !p.licenseVerified && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                    Document Distribution Permission — {p.name}
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-[#A5A1B5]">
                    Technical reachability probes cannot confirm licensing rights. Record your
                    written agreement or partner authorization reference (minimum 12 characters)
                    before running the verification probe.
                  </p>
                  <input
                    type="text"
                    value={permissionDocNote}
                    onChange={(e) => setPermissionDocNote(e.target.value)}
                    placeholder="e.g. Written embed authorization ref #2026-04 from rights holder"
                    className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2 text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={testingKey === p.key || permissionDocNote.trim().length < 12}
                      onClick={() => void handleVerifyLicense(p, true, permissionDocNote)}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
                    >
                      {testingKey === p.key ? 'Probing & Verifying...' : 'Save Authorization & Probe'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVerifyingKey(null)}
                      className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isEditing && editForm && (
                <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                        Server Name
                      </span>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                        Base URL (
                        {p.key === 'yenime' ? 'api.yenime.net' : 'aniembed.se'}
                        )
                      </span>
                      <input
                        type="text"
                        value={editForm.baseUrl}
                        onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
                        placeholder={
                          p.key === 'yenime' ? 'https://api.yenime.net' : 'https://aniembed.se/e'
                        }
                        className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs font-mono"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                        Priority Role
                      </span>
                      <select
                        value={editForm.priority <= 1 ? 1 : editForm.priority === 2 ? 2 : 3}
                        onChange={(e) =>
                          setEditForm({ ...editForm, priority: Number(e.target.value) })
                        }
                        className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs"
                      >
                        <option value={1}>1 — Primary Server</option>
                        <option value={2}>2 — Secondary Server</option>
                        <option value={3}>3 — Backup Server</option>
                      </select>
                    </label>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                      {p.key === 'yenime'
                        ? 'HTTPS Player URL Template (Required: {ANILIST_ID}, {EPISODE})'
                        : 'HTTPS Player URL Template (Required: {ANILIST_ID}, {EPISODE}, {LANG}, {AUTOPLAY}, {START})'}
                    </span>
                    <input
                      type="text"
                      value={editForm.urlTemplate}
                      onChange={(e) => setEditForm({ ...editForm, urlTemplate: e.target.value })}
                      placeholder={
                        p.key === 'yenime'
                          ? 'https://player.yenime.net/anime/ani/{ANILIST_ID}/{EPISODE}'
                          : 'https://aniembed.se/e/{ANILIST_ID}/{EPISODE}?lang={LANG}&autoplay={AUTOPLAY}&t={START}'
                      }
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2 text-xs font-mono"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="block text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                      Supported Audio Tracks
                    </span>
                    <div className="flex items-center gap-4">
                      {(['sub', 'dub'] as const).map((lang) => (
                        <label key={lang} className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={editForm.supportedLanguages.includes(lang)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...editForm.supportedLanguages, lang]
                                : editForm.supportedLanguages.filter((x) => x !== lang);
                              setEditForm({
                                ...editForm,
                                supportedLanguages: next.length ? next : ['sub'],
                              });
                            }}
                          />
                          {lang.toUpperCase()}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                      Verification &amp; Compliance Notes
                    </span>
                    <input
                      type="text"
                      value={editForm.verificationNotes}
                      onChange={(e) =>
                        setEditForm({ ...editForm, verificationNotes: e.target.value })
                      }
                      className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs"
                    />
                  </label>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleSaveEdit(p.key)}
                      className="rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-1.5 text-xs font-semibold text-white transition-colors"
                    >
                      Save Configuration
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingKey(null)}
                      className="rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
