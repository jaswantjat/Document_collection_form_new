import type { ReactNode } from 'react';
import { AlertTriangle, Camera, CheckCircle, ChevronDown } from 'lucide-react';

interface DocSlotStatus {
  label: string;
  done: boolean;
}

const BLUR_TIPS = [
  '📱 Mantén el móvil completamente fijo mientras fotografías',
  '💡 Busca una zona bien iluminada, sin reflejos ni sombras',
  '📄 Coloca el documento sobre una superficie plana y lisa',
  '📏 Sitúate a 20–30 cm del documento',
];

export function BlurWarningCard({
  preview,
  onRetry,
  onForce,
}: {
  preview: string | null;
  onRetry: () => void;
  onForce?: () => void;
}) {
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
      {preview && (
        <div className="relative">
          <img
            src={preview}
            alt="Documento desenfocado"
            className="w-full h-28 object-cover"
            style={{ filter: 'blur(2px)', opacity: 0.55 }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-amber-500 rounded-full p-2 shadow-lg">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      )}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">Imagen desenfocada</p>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            Los portales gubernamentales pueden rechazar este documento porque el texto no es legible.
            Por favor, vuelve a fotografiarlo siguiendo estos consejos:
          </p>
        </div>
        <ul className="space-y-1">
          {BLUR_TIPS.map((tip) => (
            <li key={tip} className="text-xs text-amber-800">{tip}</li>
          ))}
        </ul>
        <div className={onForce ? 'flex gap-2' : ''}>
          {onForce && (
            <button
              type="button"
              onClick={onForce}
              className="flex-1 flex items-center justify-center py-2.5 bg-white border border-amber-300 text-amber-700 text-sm font-medium rounded-lg transition-colors hover:bg-amber-50"
            >
              Usar igualmente
            </button>
          )}
          <button
            type="button"
            onClick={onRetry}
            className={`${onForce ? 'flex-1' : 'w-full'} flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors`}
          >
            <Camera className="w-4 h-4" />
            Volver a fotografiar
          </button>
        </div>
      </div>
    </div>
  );
}

export function PersistentIssueNotice({
  message,
  tone = 'amber',
}: {
  message: string;
  tone?: 'amber' | 'red';
}) {
  const palette = tone === 'red'
    ? {
        box: 'bg-red-50 border-red-200',
        icon: 'text-red-500',
        text: 'text-red-700',
      }
    : {
        box: 'bg-amber-50 border-amber-200',
        icon: 'text-amber-500',
        text: 'text-amber-800',
      };

  return (
    <div className={`flex items-start gap-2 border rounded-xl p-3 ${palette.box}`}>
      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${palette.icon}`} />
      <p className={`text-sm ${palette.text}`}>{message}</p>
    </div>
  );
}

export function DocProgressStrip({ slots }: { slots: DocSlotStatus[] }) {
  const doneCount = slots.filter((slot) => slot.done).length;
  const allDone = doneCount === slots.length;
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Documentos necesarios</p>
        <span className={`text-xs font-bold tabular-nums ${allDone ? 'text-green-600' : 'text-eltex-blue'}`}>
          {doneCount} de {slots.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {slots.map((slot) => (
          <div
            key={slot.label}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${
              slot.done ? 'bg-green-50 border border-green-100' : 'bg-white border border-gray-200'
            }`}
          >
            {slot.done
              ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
              : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />}
            <span className={`text-xs font-medium truncate ${slot.done ? 'text-green-700' : 'text-gray-600'}`}>
              {slot.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompactRow({
  icon,
  title,
  subtitle,
  onExpand,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-100 rounded-2xl hover:bg-green-100 transition-colors text-left"
    >
      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-green-800">{title}</p>
        {subtitle && <p className="text-xs text-green-500 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1 text-xs text-green-400 shrink-0">
        {icon}
        <ChevronDown className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}
