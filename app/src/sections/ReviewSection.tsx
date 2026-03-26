import { useState } from 'react';
import { CheckCircle, Loader2, AlertTriangle, RotateCcw, ArrowRight, ArrowLeft, Camera, FileText, Zap, Send } from 'lucide-react';
import type { FormData, ProjectData, LocationRegion } from '@/types';
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

function hasRequiredSignatures(formData: FormData): boolean {
  const location = (formData.location ?? (formData.representation as any)?.location ?? null) as LocationRegion | null;
  if (!location || location === 'other') return true;
  const rep = formData.representation;
  if (location === 'cataluna') {
    return !!(rep?.ivaCertificateSignature && rep?.generalitatSignature && rep?.representacioSignature);
  }
  return !!(rep?.ivaCertificateEsSignature && rep?.poderRepresentacioSignature);
}

export function ReviewSection({ project, formData, source, hasBlockingDocumentProcessing, onEdit, onSuccess, projectToken, onBack }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const signaturesOk = hasRequiredSignatures(formData);

  const { dni, ibi, electricityBill } = formData;
  const ebPages = electricityBill.pages ?? [];
  const ebUploaded = ebPages.filter(p => !!p.photo).length;

  const allItems = [
    {
      id: 'dni',
      label: 'DNI / NIE',
      doneLabel: (!!dni.front.photo && !!dni.back.photo)
        ? 'DNI / NIE — ambas caras'
        : !!dni.front.photo ? 'DNI / NIE — cara frontal'
        : 'DNI / NIE — cara trasera',
      description: 'Foto de tu DNI o NIE por ambas caras',
      hint: 'Asegúrate de que los datos sean legibles',
      icon: Camera,
      done: !!dni.front.photo || !!dni.back.photo,
      section: 'property-docs',
    },
    {
      id: 'ibi',
      label: 'IBI o escritura',
      doneLabel: 'IBI o escritura',
      description: 'Recibo del IBI o escritura de la propiedad',
      hint: 'Puede ser una foto o un PDF',
      icon: FileText,
      done: !!ibi.photo,
      section: 'property-docs',
    },
    {
      id: 'electricity',
      label: 'Factura de luz',
      doneLabel: `Factura de luz — ${ebUploaded} imagen${ebUploaded !== 1 ? 'es' : ''}`,
      description: 'Última factura de la luz',
      hint: 'Foto o PDF — si tiene varias páginas, súbelas todas',
      icon: Zap,
      done: ebUploaded > 0,
      section: 'property-docs',
    },
  ];

  const pendingItems = allItems.filter(i => !i.done);
  const doneItems = allItems.filter(i => i.done);
  const allDone = pendingItems.length === 0;
  const progress = doneItems.length;
  const total = allItems.length;

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

  if (submitting) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 gap-4">
        <Loader2 className="w-10 h-10 text-eltex-blue animate-spin" />
        <p className="text-base font-medium text-gray-700">Enviando tu documentación...</p>
        <p className="text-sm text-gray-400 text-center">Esto puede tardar unos segundos.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white px-5 pt-6 pb-5 border-b border-gray-100">
        <div className="max-w-sm mx-auto">
          <img src="/eltex-logo.png" alt="Eltex" className="h-7 object-contain mb-4" />
          <h1 className="text-xl font-bold text-gray-900">
            {allDone ? '¡Todo listo para enviar!' : 'Completa tu expediente'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {allDone
              ? 'Hemos recibido todos tus documentos. Revisa y envía cuando quieras.'
              : `Faltan ${pendingItems.length} documento${pendingItems.length !== 1 ? 's' : ''} — toca cada uno para subirlo`}
          </p>

          {/* Progress bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-xs text-gray-400">
              <span>{progress} de {total} documentos</span>
              <span>{Math.round((progress / total) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-eltex-blue rounded-full transition-all duration-500"
                style={{ width: `${(progress / total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-sm mx-auto px-5 py-5 space-y-4">

        {/* Pending items — big action cards */}
        {pendingItems.length > 0 && (
          <div className="space-y-3">
            {pendingItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onEdit(item.section)}
                  disabled={hasBlockingDocumentProcessing}
                  className="w-full bg-white rounded-2xl border-2 border-eltex-blue p-4 text-left shadow-sm hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-eltex-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.hint}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-1 bg-eltex-blue text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
                      Subir <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Completed items — compact */}
        {doneItems.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {doneItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onEdit(item.section)}
                  disabled={hasBlockingDocumentProcessing}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${idx > 0 ? 'border-t border-gray-100' : ''}`}
                >
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-600">{item.doneLabel}</p>
                  </div>
                  <Icon className="w-4 h-4 text-gray-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {/* Processing */}
        {hasBlockingDocumentProcessing && (
          <div className="flex items-center justify-center gap-3 py-4 bg-blue-50 rounded-2xl border border-blue-100">
            <Loader2 className="w-5 h-5 text-eltex-blue animate-spin" />
            <p className="text-sm font-medium text-eltex-blue">Procesando documentos...</p>
          </div>
        )}

        {/* Signature warning */}
        {!hasBlockingDocumentProcessing && !signaturesOk && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Aún no has firmado los documentos de representación. Puedes enviar igualmente.</span>
          </div>
        )}

        {/* Error */}
        {submitError && (
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

        {/* Bottom nav */}
        {!submitError && (
          <div className="pt-2 space-y-3">
            {allDone ? (
              <button
                type="button"
                onClick={submit}
                disabled={hasBlockingDocumentProcessing}
                className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors disabled:opacity-40 shadow-sm"
              >
                <Send className="w-5 h-5" /> Enviar documentación
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={hasBlockingDocumentProcessing}
                className="w-full border-2 border-gray-200 text-gray-500 font-medium py-3 rounded-2xl flex items-center justify-center gap-2 text-sm transition-colors hover:border-gray-300 disabled:opacity-40"
              >
                Enviar igualmente (incompleto)
              </button>
            )}

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                disabled={hasBlockingDocumentProcessing}
                className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 py-1 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Volver
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
