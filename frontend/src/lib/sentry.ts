import * as Sentry from '@sentry/react';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // Sentry disabled — no DSN provided.
  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.0,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
      ],
    });
    initialized = true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Sentry init failed:', e);
  }
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch { /* noop */ }
}
