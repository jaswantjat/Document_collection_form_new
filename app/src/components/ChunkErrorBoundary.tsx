import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ChunkErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleRetry = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
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
                Algo fue mal al cargar esta sección. Esto suele ocurrir debido a una mala conexión a internet.
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
