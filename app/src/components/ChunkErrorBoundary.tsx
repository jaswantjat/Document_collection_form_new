import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  clearProjectLocalState,
  getProjectCodeFromUrl,
} from '@/lib/projectLocalStateRecovery';

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
const RUNTIME_RECOVERY_KEY_PREFIX = 'eltex_runtime_recovery';
const RUNTIME_RECOVERY_WINDOW_MS = 30_000;

type RuntimeRecoveryStage = 'reload' | 'cleared';
type RuntimeRecoveryAction = 'none' | 'reload' | 'clear-project-state';

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
    msg.includes("unexpected token '<'") ||
    msg.includes("expected expression, got '<'") ||
    msg === 'load failed' ||
    msg.includes('importerror') ||
    error.name === 'ChunkLoadError'
  );
}

function getChunkReloadKey(url: string): string {
  return `${CHUNK_RELOAD_KEY_PREFIX}:${url}`;
}

function getRuntimeRecoveryKey(url: string): string | null {
  const projectCode = getProjectCodeFromUrl(url);
  return projectCode ? `${RUNTIME_RECOVERY_KEY_PREFIX}:${projectCode}` : null;
}

function parseRuntimeRecovery(value: string | null): { stage: RuntimeRecoveryStage; at: number } | null {
  if (!value) return null;
  const [stage, at] = value.split(':');
  if (stage !== 'reload' && stage !== 'cleared') return null;
  const timestamp = Number(at);
  return Number.isFinite(timestamp) ? { stage, at: timestamp } : null;
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

export function getRuntimeErrorRecoveryAction(
  error: Pick<Error, 'message' | 'name'>,
  storage: StorageLike | null,
  url: string,
  now = Date.now()
): RuntimeRecoveryAction {
  const key = getRuntimeRecoveryKey(url);
  if (isChunkLoadError(error) || !storage || !key) return 'none';

  const previous = parseRuntimeRecovery(storage.getItem(key));
  if (!previous || now - previous.at > RUNTIME_RECOVERY_WINDOW_MS) return 'reload';
  if (previous.stage === 'reload') return 'clear-project-state';
  return 'none';
}

export function markRuntimeErrorRecoveryAttempt(
  storage: StorageLike | null,
  url: string,
  stage: RuntimeRecoveryStage,
  now = Date.now()
) {
  const key = getRuntimeRecoveryKey(url);
  if (!storage || !key) return;
  storage.setItem(key, `${stage}:${now}`);
}

export function clearRuntimeErrorRecoveryAttempt(storage: StorageLike | null, url: string) {
  const key = getRuntimeRecoveryKey(url);
  if (!storage || !key) return;
  storage.removeItem(key);
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
    if (shouldAutoReloadChunkError(error, window.sessionStorage, window.location.href)) {
      markChunkReloadAttempt(window.sessionStorage, window.location.href);
      window.location.reload();
      return;
    }

    const recoveryAction = getRuntimeErrorRecoveryAction(
      error,
      window.sessionStorage,
      window.location.href
    );
    if (recoveryAction === 'reload') {
      markRuntimeErrorRecoveryAttempt(window.sessionStorage, window.location.href, 'reload');
      window.location.reload();
      return;
    }
    if (recoveryAction === 'clear-project-state') {
      void this.clearProjectStateAndReload();
    }
  }

  private clearProjectStateAndReload = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    const projectCode = getProjectCodeFromUrl(url);
    if (projectCode) {
      markRuntimeErrorRecoveryAttempt(window.sessionStorage, url, 'cleared');
      await clearProjectLocalState(projectCode);
    }
    window.location.reload();
  };

  private handleRetry = async () => {
    if (typeof window !== 'undefined') {
      clearChunkReloadAttempt(window.sessionStorage, window.location.href);
      clearRuntimeErrorRecoveryAttempt(window.sessionStorage, window.location.href);
      if (!this.state.isNetworkError) {
        await this.clearProjectStateAndReload();
        return;
      }
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
