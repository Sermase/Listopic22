import { Component, type ErrorInfo, type ReactNode } from 'react';

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
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
    this.props.onError?.(error, info);
    // TODO: integrate Sentry/Crashlytics here when el usuario active el DSN.
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50 dark:bg-neutral-900">
        <div className="max-w-md w-full bg-white dark:bg-neutral-800 rounded-2xl shadow-lg p-6 text-center">
          <h1 className="text-xl font-semibold text-red-600 dark:text-red-400 mb-2">
            Algo ha fallado
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
            Se ha producido un error inesperado. Puedes intentar recargar la pantalla.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-xs text-left bg-neutral-100 dark:bg-neutral-900 p-3 rounded overflow-auto max-h-48 mb-4">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition"
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.assign('/')}
              className="px-4 py-2 rounded-lg bg-neutral-200 dark:bg-neutral-700 text-sm font-medium hover:bg-neutral-300 dark:hover:bg-neutral-600 transition"
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
