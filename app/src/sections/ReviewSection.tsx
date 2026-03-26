import { useState } from 'react';
import { CheckCircle, Circle, Loader2, AlertTriangle, RotateCcw, ArrowRight, ArrowLeft } from 'lucide-react';
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
  onBack?: () => void;
}

export function ReviewSection({ project, formData, source, hasBlockingDocumentProcessing, onEdit, onSuccess, projectToken, onBack }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { dni, ibi, electricityBill } = formData;
  const ebPages = electricityBill.pages ?? [];
  const ebUploaded = ebPages.filter(p => !!p.photo).length;

  const allItems = [
    {
      label: (!!dni.front.photo && !!dni.back.photo) ? 'DNI / NIE — ambas caras' :
        !!dni.front.photo ? 'DNI / NIE — cara frontal' :
        !!dni.back.photo ? 'DNI / NIE — cara trasera' : 'DNI / NIE',
      done: !!dni.front.photo || !!dni.back.photo,
      section: 'property-docs',
    },
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
  const visibleItems = pendingItems.length > 0 ? pendingItems : allItems;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const renderedFormData = await ensureRenderedDocuments(formData);
      const submitPayload = stripRenderedImages(renderedFormData);
      const res = await submitForm(project.code, submitPayload, source, projectToken);
      if (res.success) onSuccess();
      else setSubmitError('Error al enviar. Inténtalo de nuevo.');
    } catch {
      setSubmitError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  function stripRenderedImages(fd: FormData): FormData {
    const docs = fd.representation?.renderedDocuments;
    if (!docs) return fd;
    const stripped: Record<string, object> = {};
    for (const [key, val] of Object.entries(docs)) {
      if (val && typeof val === 'object') {
        const { imageDataUrl: _omit, ...meta } = val as { imageDataUrl?: string; [k: string]: unknown };
        stripped[key] = meta;
      }
    }
    return {
      ...fd,
      representation: { ...fd.representation, renderedDocuments: stripped as typeof docs },
    };
  }

  return (
    <div className="min-h-screen bg-white p-5 pb-10">
      <div className="max-w-sm mx-auto space-y-6">

        <div className="pt-2 pb-2">
          <h1 className="text-2xl font-bold text-gray-900">Resumen</h1>
          <p className="text-gray-400 text-sm mt-1">
            {submitting
              ? 'Enviando tu documentación...'
              : hasBlockingDocumentProcessing
                ? 'Procesando documentos...'
                : pendingItems.length > 0
                  ? `${pendingItems.length} elemento${pendingItems.length !== 1 ? 's' : ''} pendiente${pendingItems.length !== 1 ? 's' : ''}`
                  : `${doneCount} de ${allItems.length} elementos completados`}
          </p>
        </div>

        {/* Checklist */}
        <div className="divide-y divide-gray-100">
          {visibleItems.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => !submitting && onEdit(item.section)}
              className="w-full flex items-center gap-3 py-3 text-left"
              disabled={submitting}
            >
              {item.done
                ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                : <Circle className="w-5 h-5 text-gray-200 shrink-0" />}
              <span className={`text-sm flex-1 ${item.done ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
                {item.label}
              </span>
              {!submitting && <span className="text-xs text-gray-400">{item.done ? '✓' : 'Añadir →'}</span>}
            </button>
          ))}
        </div>

        {/* Submitting indicator */}
        {submitting && (
          <div className="flex items-center justify-center gap-3 py-6 bg-blue-50 rounded-2xl border border-blue-100">
            <Loader2 className="w-6 h-6 text-eltex-blue animate-spin" />
            <p className="text-sm font-medium text-eltex-blue">Enviando documentación...</p>
          </div>
        )}

        {/* Processing indicator */}
        {hasBlockingDocumentProcessing && !submitting && (
          <div className="flex items-center justify-center gap-3 py-6 bg-blue-50 rounded-2xl border border-blue-100">
            <Loader2 className="w-6 h-6 text-eltex-blue animate-spin" />
            <p className="text-sm font-medium text-eltex-blue">Preparando documentos...</p>
          </div>
        )}

        {/* Error + retry */}
        {submitError && !submitting && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-xl text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {submitError}
            </div>
            <button
              type="button"
              onClick={submit}
              className="btn-primary flex items-center justify-center gap-2 text-base py-3.5"
            >
              <RotateCcw className="w-5 h-5" /> Reintentar envío
            </button>
          </div>
        )}

        {!submitting && !submitError && !hasBlockingDocumentProcessing && (
          <p className="text-xs text-center text-gray-400">
            Puedes enviar aunque falten algunos documentos.
          </p>
        )}

        {/* Navigation */}
        {!submitting && !submitError && (
          <div className="flex gap-3 pt-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="btn-secondary flex items-center gap-1.5 px-5"
                disabled={hasBlockingDocumentProcessing}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={hasBlockingDocumentProcessing}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Enviar documentación <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
