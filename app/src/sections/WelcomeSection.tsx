import { ArrowRight, CheckCircle, Circle } from 'lucide-react';
import type { ProjectData, FormData } from '@/types';

interface Props {
  project: ProjectData;
  completedCount: number;
  totalCount: number;
  source: 'assessor' | 'customer';
  formData?: FormData;
  onContinue: () => void;
}

export function WelcomeSection({ project, source, formData, onContinue }: Props) {
  const fd = formData;
  const isAssessor = source === 'assessor';

  const docs = [
    { label: 'DNI — cara frontal', done: !!fd?.dni?.front?.photo },
    { label: 'DNI — cara trasera', done: !!fd?.dni?.back?.photo },
    { label: 'IBI o escritura', done: !!fd?.ibi?.photo },
    { label: 'Factura de luz', done: !!(fd?.electricityBill?.pages ?? []).some((p: any) => p?.photo) },
    { label: 'Firmas', done: !!(fd?.signatures?.customerSignature && fd?.signatures?.repSignature) },
  ];

  const doneCount = docs.filter(d => d.done).length;
  const allDone = doneCount === docs.length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <div className="w-full max-w-sm space-y-8">

        <img src="/eltex-logo.png" alt="Eltex" className="h-9 object-contain" />

        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {isAssessor ? `Hola, ${project.assessor.split(' ')[0]}` : allDone ? '¡Todo listo!' : doneCount > 0 ? 'Bienvenido de nuevo' : 'Hola'}
          </h1>
          <p className="text-gray-400 text-sm">
            {isAssessor
              ? `Expediente ${project.code}`
              : `Expediente ${project.code} · Asesor: ${project.assessor}`}
          </p>
        </div>

        {/* Checklist */}
        <div className="divide-y divide-gray-100">
          {docs.map(doc => (
            <div key={doc.label} className="flex items-center gap-3 py-3">
              {doc.done
                ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                : <Circle className="w-5 h-5 text-gray-200 shrink-0" />}
              <span className={`text-sm ${doc.done ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`}>
                {doc.label}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="btn-primary flex items-center justify-center gap-2 text-base py-3.5"
        >
          {allDone ? 'Revisar y enviar' : doneCount > 0 ? 'Continuar' : 'Empezar'}
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
