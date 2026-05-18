import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import i18n from '@/i18n';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorCount: 0,
  };

  private static isChunkError(error: Error): boolean {
    const msg = String(error?.message || '');
    return (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk')
    );
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const msg = error?.message || '';

    // Chunk load failures should NOT be suppressed — they need auto-reload
    if (ErrorBoundary.isChunkError(error)) {
      return { hasError: true, error };
    }

    // Suppress known harmless errors that shouldn't crash the UI
    const suppressPatterns = [
      'removeChild', 'insertBefore', 'appendChild', // DOM reconciliation (browser extensions)
      'not implemented', 'UNIMPLEMENTED', 'not available', // Capacitor/plugin
      'ResizeObserver', // layout observer
      'Firebase', 'PERMISSION_DENIED', // Firebase auth
      'network', 'timeout', 'Failed to fetch', // network
      'AbortError', 'The operation was aborted', // cancelled requests
      'QuotaExceededError', // storage
    ];
    if (suppressPatterns.some(p => msg.includes(p))) {
      console.warn('Suppressed error:', msg.slice(0, 120));
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));

    // Auto-reload once for stale chunk errors
    if (ErrorBoundary.isChunkError(error)) {
      const key = 'chunk_reload_ts';
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
        return;
      }
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleClearAndReload = () => {
    // Clear any potentially corrupted cache
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(name => caches.delete(name)));
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      const t = i18n.t.bind(i18n);
      const isRepeatedError = this.state.errorCount > 2;

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-5">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          
          <h3 className="text-xl font-bold mb-2">
            {t('errorBoundary.somethingWentWrong', 'Something went wrong')}
          </h3>
          
          <p className="text-sm text-muted-foreground mb-6 max-w-sm">
            {isRepeatedError
              ? t('errorBoundary.repeatedError', 'This error keeps occurring. Try clearing the cache or going back to home.')
              : t('errorBoundary.unexpectedError', 'An unexpected error occurred. Please try again.')}
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button onClick={this.handleRetry} variant="default" className="w-full gap-2">
              <RefreshCw className="h-4 w-4" />
              {t('errorBoundary.tryAgain', 'Try Again')}
            </Button>
            
            <Button onClick={this.handleGoHome} variant="outline" className="w-full gap-2">
              <Home className="h-4 w-4" />
              {t('errorBoundary.goHome', 'Go to Home')}
            </Button>

            {isRepeatedError && (
              <Button onClick={this.handleClearAndReload} variant="ghost" className="w-full text-xs text-muted-foreground">
                {t('errorBoundary.clearCache', 'Clear cache & reload')}
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrapper for components that might crash
export const SafeComponent = ({ 
  children, 
  fallback 
}: { 
  children: ReactNode; 
  fallback?: ReactNode 
}) => {
  return (
    <ErrorBoundary fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
};
