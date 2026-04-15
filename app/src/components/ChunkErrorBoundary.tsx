import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isNetworkError: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const CHUNK_RELOAD_KEY_PREFIX = 'eltex_chunk_reload';
const CHUNK_RELOAD_WINDOW_MS = 30_000;

export function isChunkLoadError(error: Pick<Error, 'message' | 'name'>): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('dynamically imported') ||
    msg.includes('loading chunk') ||
    msg.includes('error loading') ||
    msg.includes('importing a module script failed') ||
    msg.includes('failed to load module script') ||
    msg.includes('load failed for the module') ||
    msg === 'load failed' ||
    msg.includes('importerror') ||
    error.name === 'ChunkLoadError'
  );
}

function getChunkReloadKey(url: string): string {
  return `${CHUNK_RELOAD_KEY_PREFIX}:${url}`;
}

export function shouldAutoReloadChunkError(
  error: Pick<Error, 'message' | 'name'>,
  storage: StorageLike | null,
  url: string
): boolean {
  if (!isChunkLoadError(error) || !storage || !url) return false;
  const previousAttempt = Number(storage.getItem(getChunkReloadKey(url)));
  return !Number.isFinite(previousAttempt) || (Date.now() - previousAttempt) > CHUNK_RELOAD_WINDOW_MS;
}

export function markChunkReloadAttempt(storage: StorageLike | null, url: string) {
  if (!storage || !url) return;
  storage.setItem(getChunkReloadKey(url), String(Date.now()));
}

export function clearChunkReloadAttempt(storage: StorageLike | null, url: string) {
  if (!storage || !url) return;
  storage.removeItem(getChunkReloadKey(url));
}

export class ChunkErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    isNetworkError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, isNetworkError: isChunkLoadError(error) };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const stack = errorInfo.componentStack?.slice(0, 500) ?? '(no stack)';
    console.error(
      '[ChunkErrorBoundary] Caught error:',
      error.name,
      '—',
      error.message,
      '\nComponent stack (truncated):',
      stack
    );

    if (typeof window === 'undefined') return;
    if (!shouldAutoReloadChunkError(error, window.sessionStorage, window.location.href)) return;

    markChunkReloadAttempt(window.sessionStorage, window.location.href);
    window.location.reload();
  }

  private handleRetry = () => {
    if (typeof window !== 'undefined') {
      clearChunkReloadAttempt(window.sessionStorage, window.location.href);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const { isNetworkError } = this.state;
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <Card className="w-full max-w-md border-destructive/20 shadow-lg">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3 text-destructive mb-2">
                <AlertCircle className="w-6 h-6" />
                <CardTitle className="text-xl">Error de carga</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-gray-600 leading-relaxed">
                {isNetworkError
                  ? 'No se pudo cargar esta sección. Comprueba tu conexión a internet e inténtalo de nuevo.'
                  : 'Se produjo un error inesperado al cargar esta sección. Por favor, recarga la página e inténtalo de nuevo.'}
              </p>
              <Button
                onClick={this.handleRetry}
                className="w-full bg-eltex-blue hover:bg-eltex-blue/90 text-white font-medium py-6"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reintentar cargar
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
