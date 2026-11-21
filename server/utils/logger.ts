export type LogLevel = 'info' | 'warn' | 'error';

export interface StructuredLogPayload {
  ts: string;
  level: LogLevel;
  message: string;
  requestId?: string | null;
  route?: string | null;
  statusCode?: number;
  durationMs?: number;
  [key: string]: unknown;
}

export type ExternalErrorTracker = (error: Error, context: Record<string, unknown>) => void;

let externalTracker: ExternalErrorTracker | null = null;

export function setErrorTracker(tracker: ExternalErrorTracker | null) {
  externalTracker = tracker;
}

export function captureTrackedError(error: unknown, context: Record<string, unknown> = {}) {
  const errObj = error instanceof Error ? error : new Error(String(error || 'Unknown error'));
  if (externalTracker) {
    try {
      externalTracker(errObj, context);
    } catch {
      // Never let telemetry crash request handling
    }
  }
}

function writeLog(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const entry: StructuredLogPayload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, context: Record<string, unknown> = {}) => writeLog('info', message, context),
  warn: (message: string, context: Record<string, unknown> = {}) => writeLog('warn', message, context),
  error: (message: string, context: Record<string, unknown> = {}) => writeLog('error', message, context),
};
