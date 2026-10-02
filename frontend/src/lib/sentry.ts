import * as Sentry from '@sentry/react';
import { Capacitor } from '@capacitor/core';
import { scrubBreadcrumb, scrubEvent } from './sentryScrub';

let initialized = false;

/**
 * Entorno de Sentry: `VITE_SENTRY_ENVIRONMENT` (production / preview, lo pone
 * cada workflow) o, si no está, production en un build y development en local.
 * En development no se envía nada.
 */
export function sentryEnvironment(): string {
  return import.meta.env.VITE_SENTRY_ENVIRONMENT || (import.meta.env.PROD ? 'production' : 'development');
}

export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const environment = sentryEnvironment();
  if (!dsn || environment === 'development') return;
  try {
    Sentry.init({
      dsn,
      environment,
      release: import.meta.env.VITE_APP_RELEASE || undefined,
      // Sin usuario ni IP, sin cookies ni cuerpos; de las cabeceras, solo el
      // navegador. beforeSend vuelve a limpiar (correos, tokens en URLs).
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { allow: ['User-Agent'] }, response: false },
        httpBodies: [],
      },
      tracesSampleRate: environment === 'production' ? 0.1 : 0,
      integrations: [Sentry.browserTracingIntegration()],
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    });
    Sentry.setTag('app_platform', Capacitor.getPlatform());
    initialized = true;
    // El capturador de arranque de index.html deja de enviar: ya lo hace el SDK.
    (window as Window & { __lpSentryReady?: boolean }).__lpSentryReady = true;
  } catch (e) {
    console.warn('Sentry init failed:', e);
  }
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch { /* noop */ }
}
