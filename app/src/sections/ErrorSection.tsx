import { AlertTriangle, LayoutDashboard, Phone, RefreshCw } from 'lucide-react';

interface Props {
  error: string;
}

type ErrorAction =
  | { kind: 'reload'; label: string }
  | { kind: 'link'; label: string; href: string };

interface ErrorMessage {
  title: string;
  description: string;
  primaryAction?: ErrorAction;
}

const errorMessages: Record<string, ErrorMessage> = {
  PROJECT_NOT_FOUND: {
    title: 'Enlace no válido',
    description: 'Este enlace no existe o ha expirado. Contacta con tu asesor de Eltex para que te envíe un enlace nuevo.',
  },
  INVALID_CODE: {
    title: 'Enlace incompleto',
    description: 'Falta el código del proyecto en este enlace. Si eres cliente, usa el enlace completo que te envió tu asesor. Si eres de Eltex, entra al dashboard.',
    primaryAction: {
      kind: 'link',
      label: 'Abrir dashboard',
      href: '/dashboard',
    },
  },
  NETWORK_ERROR: {
    title: 'Sin conexión',
    description: 'No se ha podido conectar con el servidor. Comprueba tu conexión a internet e inténtalo de nuevo.',
  },
  FORBIDDEN: {
    title: 'Enlace no válido',
    description: 'Este enlace no tiene autorización para acceder al proyecto. Asegúrate de usar el enlace completo que te ha enviado tu asesor de Eltex.',
  },
  UNAUTHORIZED: {
    title: 'Enlace no válido',
    description: 'Este enlace no tiene autorización para acceder al proyecto. Asegúrate de usar el enlace completo que te ha enviado tu asesor de Eltex.',
  },
  INVALID_TOKEN: {
    title: 'Enlace no válido',
    description: 'Este enlace no tiene autorización para acceder al proyecto. Asegúrate de usar el enlace completo que te ha enviado tu asesor de Eltex.',
  },
  UNKNOWN_ERROR: {
    title: 'Error inesperado',
    description: 'Ha ocurrido un error inesperado. Por favor, recarga la página o contacta con tu asesor.',
  },
};

export function ErrorSection({ error }: Props) {
  const msg = errorMessages[error] || errorMessages['UNKNOWN_ERROR'];
  const primaryAction = msg.primaryAction ?? { kind: 'reload', label: 'Reintentar' } satisfies ErrorAction;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg text-center">

        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>

        <div className="form-card p-8 mb-6">
          <h1 className="text-xl font-bold text-gray-900 mb-3">{msg.title}</h1>
          <p className="text-gray-600 text-sm leading-relaxed">{msg.description}</p>
        </div>

        <div className="flex gap-3 justify-center">
          {primaryAction.kind === 'reload' ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 py-3 px-5 bg-eltex-blue text-white font-medium rounded-xl text-sm hover:bg-eltex-blue-dark transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {primaryAction.label}
            </button>
          ) : (
            <a
              href={primaryAction.href}
              className="flex items-center gap-2 py-3 px-5 bg-eltex-blue text-white font-medium rounded-xl text-sm hover:bg-eltex-blue-dark transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              {primaryAction.label}
            </a>
          )}
          <a
            href="tel:+34933868369"
            className="flex items-center gap-2 py-3 px-5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            <Phone className="w-4 h-4" />
            Llamar a Eltex
          </a>
        </div>

        <div className="mt-8">
          <img src="/eltex-logo.png" alt="Eltex" className="h-7 object-contain mx-auto opacity-50" />
        </div>
      </div>
    </div>
  );
}
