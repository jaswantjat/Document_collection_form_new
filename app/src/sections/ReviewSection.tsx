import { useState } from 'react';
import { CheckCircle, Circle, Send, Loader2, AlertTriangle } from 'lucide-react';
import type { FormData, ProjectData } from '@/types';
import { submitForm } from '@/services/api';
import { ensureRenderedDocuments } from '@/lib/signedDocumentOverlays';

interface Props {
  project: ProjectData;
  formData: FormData;
  source: 'customer' | 'assessor';
  canSubmit: boolean;
  hasBlockingDocumentProcessing: boolean;
  onEdit: (section: string) => void;
  onSuccess: () => void;
  projectToken?: string | null;
}

export function ReviewSection({ project, formData, source, hasBlockingDocumentProcessing, onEdit, onSuccess, projectToken }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { dni, ibi, electricityBill } = formData;
  const ebPages = electricityBill.pages ?? [];
  const ebUploaded = ebPages.filter(p => !!p.photo).length;

  const allItems = [
    { label: 'DNI — cara frontal', done: !!dni.front.photo, section: 'property-docs' },
    { label: 'DNI — cara trasera', done: !!dni.back.photo, section: 'property-docs' },
    { label: 'IBI o escritura', done: !!ibi.photo, section: 'property-docs' },
    {
      label: ebUploaded > 0
        ? `Factura de luz — ${ebUploaded} imagen${ebUploaded !== 1 ? 'es' : ''}`
        : 'Factura de luz',
      done: ebUploaded > 0,
      section: 'property-docs',
    },
  ];

  const pendingItems = allItems.filter(i => !i.done);
  const doneCount = allItems.filter(i => i.done).length;

  // Show only pending items if some are incomplete; show all if everything is done
  const visibleItems = pendingItems.length > 0 ? pendingItems : allItems;

  const submit = async () => {
    if (hasBlockingDocumentProcessing) {
      setSubmitError('Hay documentos aún en proceso o pendientes de corregir.');
      return;
    }

    setSubmitting(true); setSubmitError('');
    try {
      const renderedFormData = await ensureRenderedDocuments(formData);
      const res = await submitForm(project.code, renderedFormData, source, projectToken);
      if (res.success) onSuccess();
      else setSubmitError('Error al enviar. Inténtalo de nuevo.');
    } catch { setSubmitError('Sin conexión. Inténtalo de nuevo.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-white p-5 pb-10">
      <div className="max-w-sm mx-auto space-y-6">

        <div className="pt-2 pb-2">
          <h1 className="text-2xl font-bold text-gray-900">Resumen</h1>
          <p className="text-gray-400 text-sm mt-1">
            {pendingItems.length > 0
              ? `${pendingItems.length} elemento${pendingItems.length !== 1 ? 's' : ''} pendiente${pendingItems.length !== 1 ? 's' : ''}`
              : `${doneCount} de ${allItems.length} elementos completados`}
          </p>
        </div>

        {/* Checklist — only pending items (or all if everything done) */}
        <div className="divide-y divide-gray-100">
          {visibleItems.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => onEdit(item.section)}
              className="w-full flex items-center gap-3 py-3 text-left"
            >
              {item.done
                ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                : <Circle className="w-5 h-5 text-gray-200 shrink-0" />}
              <span className={`text-sm flex-1 ${item.done ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
                {item.label}
              </span>
              <span className="text-xs text-gray-400">{item.done ? '✓' : 'Añadir →'}</span>
            </button>
          ))}
        </div>

        {submitError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-600">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {submitError}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || hasBlockingDocumentProcessing}
          className="btn-primary flex items-center justify-center gap-2 text-base py-3.5"
        >
          {submitting
            ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando...</>
            : <><Send className="w-5 h-5" /> Enviar documentación</>}
        </button>

        <p className="text-xs text-center text-gray-400">
          Puedes enviar aunque falten algunos documentos, pero no mientras alguno siga en verificación o extracción.
        </p>
      </div>
    </div>
  );
}
