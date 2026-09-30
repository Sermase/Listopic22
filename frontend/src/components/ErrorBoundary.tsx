import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/sentry';
import { isChunkLoadError, reloadOnceForNewVersion } from '../lib/chunkErrors';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Un trozo de una versión anterior que ya no existe: basta con recargar.
    if (isChunkLoadError(error) && reloadOnceForNewVersion()) return;
    console.error('[ErrorBoundary]', error, info);
    this.props.onError?.(error, info);
    reportError(error, { componentStack: info.componentStack });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    const newVersion = isChunkLoadError(this.state.error);

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--lt-bg)]">
        <div role="alert" className="max-w-md w-full rounded-2xl border border-[var(--lt-border)] bg-[var(--lt-card-strong)] shadow-lg p-6 text-center">
          <h1 className="text-xl font-bold text-[var(--lt-text)] mb-2">
            {newVersion ? 'Hay una versión nueva de Listopic' : 'Algo ha fallado'}
          </h1>
          <p className="text-sm text-[var(--lt-text-muted)] mb-5">
            {newVersion
              ? 'Actualiza para seguir donde estabas.'
              : 'Se ha producido un error inesperado. Puedes reintentarlo o volver al inicio.'}
          </p>
          {import.meta.env.DEV && (
            <pre className="text-xs text-left bg-[var(--lt-bg-deep)] text-[var(--lt-text-muted)] p-3 rounded-lg overflow-auto max-h-48 mb-4">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={newVersion ? () => window.location.reload() : this.reset}
              className="btn-primary"
            >
              {newVersion ? 'Actualizar' : 'Reintentar'}
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="btn-glass"
            >
              Ir al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
