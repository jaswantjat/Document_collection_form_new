import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Loader2, AlertTriangle, RotateCcw, ArrowRight, ArrowLeft, Camera, FileText, Zap, Send } from 'lucide-react';
import type { FormData, ProjectData, LocationRegion, RenderedDocumentAsset, RenderedDocumentKey } from '@/types';
import { submitForm, preUploadAssets } from '@/services/api';
import { getIdentityDocumentDoneLabel, isIdentityDocumentComplete } from '@/lib/identityDocument';
import { stampRenderedDocumentMetadata } from '@/lib/signedDocumentOverlays';
import { createRenderedEnergyCertificateAsset } from '@/lib/energyCertificateDocument';
import { isEnergyCertificateReadyToComplete } from '@/lib/energyCertificateValidation';

interface Props {
  project: ProjectData;
  formData: FormData;
  source: 'customer' | 'assessor';
  canSubmit: boolean;
  hasBlockingDocumentProcessing: boolean;
  followUpMode?: boolean;
  onEdit: (section: string) => void;
  onSuccess: () => void;
  projectToken?: string | null;
  onBack?: () => void;
  autoSubmit?: boolean;
}

function hasRequiredSignatures(formData: FormData): boolean {
  const location = (formData.location ?? formData.representation?.location ?? null) as LocationRegion | null;
  if (!location || location === 'other') return true;
  const rep = formData.representation;
  if (location === 'cataluna') {
    return !!(rep?.ivaCertificateSignature && rep?.generalitatSignature && rep?.representacioSignature);
  }
  return !!(rep?.ivaCertificateEsSignature && rep?.poderRepresentacioSignature);
}

export function ReviewSection({
  project,
  formData,
  source,
  hasBlockingDocumentProcessing,
  followUpMode = false,
  onEdit,
  onSuccess,
  projectToken,
  onBack,
  autoSubmit = false,
}: Props) {
  const [submitting, setSubmitting] = useState(autoSubmit);
  const [submitError, setSubmitError] = useState('');
  const [confirmingIncomplete, setConfirmingIncomplete] = useState(false);
  const submitInProgress = useRef(false);
  const autoSubmitFired = useRef(false);
  const autoSubmitProp = useRef(autoSubmit);
  // Pre-render the energy certificate canvas on mount so submit() is instant.
  // The user spends at least a second reading the review screen — we use that
  // time to run the expensive canvas + JPEG encode in the background.
  const energyCertPreRender = useRef<Promise<RenderedDocumentAsset> | null>(null);
  // Pre-upload binary assets as multipart/form-data so the final submit JSON is lean.
  const preUploadPromise = useRef<Promise<boolean> | null>(null);
  const preUploadDone = useRef(false);
  const signaturesOk = hasRequiredSignatures(formData);

  const { dni, ibi, electricityBill } = formData;
  const ebPages = electricityBill.pages ?? [];
  const ebUploaded = ebPages.filter(p => !!p.photo).length;
  const dniDone = isIdentityDocumentComplete(dni);

  const allItems = [
    {
      id: 'dni',
      label: 'DNI / NIE',
      doneLabel: getIdentityDocumentDoneLabel(dni),
      description: 'Documento de identidad del titular',
      hint: 'DNI por ambas caras o NIE válido',
      icon: Camera,
      done: dniDone,
      section: 'property-docs',
    },
    {
      id: 'ibi',
      label: 'IBI o escritura',
      doneLabel: 'IBI o escritura',
      description: 'Recibo del IBI o escritura de la propiedad',
      hint: 'Puede ser una foto o un PDF',
      icon: FileText,
      done: !!ibi.photo || (ibi.pages?.length ?? 0) > 0,
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
  // Guard: re-validate fields even if status is 'completed' — defence-in-depth
  // to handle any edge case where a stale/invalid 'completed' is in memory.
  const rawEnergyStatus = formData.energyCertificate.status;
  const energyStatus =
    rawEnergyStatus === 'completed' && !isEnergyCertificateReadyToComplete(formData.energyCertificate)
      ? ('in-progress' as const)
      : rawEnergyStatus;

  const submit = async () => {
    if (submitInProgress.current) return;
    submitInProgress.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      // Stamp metadata (generatedAt + templateVersion) without rendering any canvas.
      const renderedRepresentation = stampRenderedDocumentMetadata(formData);
      let renderedFormData = renderedRepresentation;

      if (renderedRepresentation.energyCertificate.status === 'completed') {
        // Re-use the pre-rendered result that was kicked off on mount.
        // Falls back to rendering on-demand if somehow the ref is null.
        const renderedDocument = await (
          energyCertPreRender.current ??
          createRenderedEnergyCertificateAsset({ project, formData: renderedRepresentation })
        );
        renderedFormData = {
          ...renderedRepresentation,
          energyCertificate: {
            ...renderedRepresentation.energyCertificate,
            renderedDocument,
          },
        };
      }

      // If pre-upload has already completed, strip ALL binary from the submit payload.
      // The server already has the files from the pre-upload — sending them again is waste.
      // If pre-upload is still in progress, give it up to 3s; fall back to full payload on timeout.
      const preUploadSuccess = preUploadDone.current || await Promise.race([
        preUploadPromise.current ?? Promise.resolve(false),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 3000)),
      ]);

      const submitPayload = preUploadSuccess
        ? stripAllBinaryData(renderedFormData)
        : stripRenderedImages(renderedFormData);

      const res = await submitForm(project.code, submitPayload, source, projectToken);
      if (res.success) onSuccess();
      else setSubmitError(res.message || 'Error al enviar. Inténtalo de nuevo.');
    } catch {
      setSubmitError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      submitInProgress.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!autoSubmitProp.current || autoSubmitFired.current) return;
    autoSubmitFired.current = true;
    submit();
  // Runs once on mount — autoSubmitProp.current captures the initial value
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire-and-forget: start rendering the energy cert canvas immediately on mount
  // so the expensive toDataURL() is done before the user taps submit.
  useEffect(() => {
    if (formData.energyCertificate.status !== 'completed') return;
    energyCertPreRender.current = createRenderedEnergyCertificateAsset({ project, formData });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-upload all binary assets (photos + PDFs) as binary multipart files in the
  // background while the user reads the review screen.  When pre-upload succeeds,
  // the final submit JSON payload drops from ~2-5 MB to ~80 KB because the server
  // already has the files.  If the pre-upload fails or times out we fall back to
  // including the binary inline in the submit (the existing behavior).
  useEffect(() => {
    const getReadyFormData = () => {
      // Chain on the EC pre-render so the energy cert image is included.
      if (energyCertPreRender.current) {
        return energyCertPreRender.current.then(renderedDoc => ({
          ...formData,
          energyCertificate: {
            ...formData.energyCertificate,
            renderedDocument: renderedDoc,
          },
        }));
      }
      return Promise.resolve(formData);
    };

    preUploadPromise.current = getReadyFormData()
      .then(fd => preUploadAssets(project.code, fd, projectToken ?? null))
      .then(() => {
        preUploadDone.current = true;
        return true;
      })
      .catch(() => false);
  // Runs once on mount — captures initial formData and project values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strips ALL binary fields. Used after a successful pre-upload so the server
  // already has the files and doesn't need them re-sent in the submit payload.
  function stripAllBinaryData(fd: FormData): FormData {
    return JSON.parse(JSON.stringify(fd, (key: string, value: unknown) => {
      if (key === 'preview') return undefined;          // UploadedPhoto JPEG base64
      if (key === 'dataUrl') return undefined;          // StoredDocumentFile PDF base64
      if (key === 'imageDataUrl') return undefined;     // RenderedDocumentAsset JPEG base64
      if (value instanceof File) return undefined;
      return value;
    })) as FormData;
  }

  function stripRenderedImages(fd: FormData): FormData {
    const docs = fd.representation?.renderedDocuments;
    const strippedRepresentation = docs ? { ...docs } : null;
    if (strippedRepresentation) {
      for (const [key, val] of Object.entries(strippedRepresentation) as [RenderedDocumentKey, RenderedDocumentAsset | undefined][]) {
        if (!val) continue;
        strippedRepresentation[key] = {
          generatedAt: val.generatedAt,
          templateVersion: val.templateVersion,
        };
      }
    }

    const energyDocument = fd.energyCertificate?.renderedDocument
      ? {
          imageDataUrl: fd.energyCertificate.renderedDocument.imageDataUrl,
          generatedAt: fd.energyCertificate.renderedDocument.generatedAt,
          templateVersion: fd.energyCertificate.renderedDocument.templateVersion,
        }
      : null;

    const stripped: NonNullable<FormData['representation']['renderedDocuments']> = {};
    if (strippedRepresentation) Object.assign(stripped, strippedRepresentation);
    return {
      ...fd,
      representation: { ...fd.representation, renderedDocuments: strippedRepresentation ? stripped : fd.representation.renderedDocuments },
      energyCertificate: {
        ...fd.energyCertificate,
        renderedDocument: energyDocument,
      },
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
            {followUpMode
              ? (allDone ? 'Confirma tu documentación' : 'Sube lo que falte y confirma')
              : (allDone ? '¡Todo listo para enviar!' : 'Completa tu expediente')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {followUpMode
              ? (allDone
                ? 'Las firmas ya están registradas. Solo revisa y confirma el envío.'
                : `Añade los documentos que te falten y confirma cuando quieras.`)
              : (allDone
                ? 'Hemos recibido todos tus documentos. Revisa y envía cuando quieras.'
                : `Faltan ${pendingItems.length} documento${pendingItems.length !== 1 ? 's' : ''} — toca cada uno para subirlo`)}
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

        <button
          type="button"
          onClick={() => onEdit('energy-certificate')}
          className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
            energyStatus === 'completed'
              ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
              : energyStatus === 'skipped'
                ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-3">
            {energyStatus === 'completed' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            ) : energyStatus === 'skipped' ? (
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${
                energyStatus === 'completed' ? 'text-emerald-800'
                : energyStatus === 'skipped' ? 'text-amber-800'
                : 'text-gray-700'
              }`}>
                {energyStatus === 'completed'
                  ? 'Certificado energético — confirmado'
                  : energyStatus === 'skipped'
                    ? 'Certificado energético — saltado por cliente'
                    : 'Certificado energético — pendiente'}
              </p>
              <p className={`text-xs mt-0.5 ${
                energyStatus === 'completed' ? 'text-emerald-600'
                : energyStatus === 'skipped' ? 'text-amber-700'
                : 'text-gray-400'
              }`}>
                {energyStatus === 'completed'
                  ? 'Revisar o actualizar el certificado energético firmado'
                  : energyStatus === 'skipped'
                    ? 'Puedes completarlo más tarde desde este mismo enlace'
                    : 'Completa el certificado energético de la vivienda'}
              </p>
            </div>
            <FileText className={`w-4 h-4 shrink-0 ${
              energyStatus === 'completed' ? 'text-emerald-500'
              : energyStatus === 'skipped' ? 'text-amber-500'
              : 'text-gray-300'
            }`} />
          </div>
        </button>

        {/* Processing */}
        {hasBlockingDocumentProcessing && (
          <div className="flex items-center justify-center gap-3 py-4 bg-blue-50 rounded-2xl border border-blue-100">
            <Loader2 className="w-5 h-5 text-eltex-blue animate-spin" />
            <p className="text-sm font-medium text-eltex-blue">Procesando documentos...</p>
          </div>
        )}

        {/* Signature warning */}
        {!followUpMode && !hasBlockingDocumentProcessing && !signaturesOk && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {formData.representation?.signatureDeferred ? (
              <span>Firma pendiente — recuerda volver a este enlace para firmar los documentos antes de que tu asesor pueda tramitar el expediente.</span>
            ) : (
              <span>Faltan las firmas de los documentos de representación. Sin ellas, tu asesor <strong>no podrá tramitar el expediente</strong> ni solicitar las subvenciones correspondientes.</span>
            )}
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
            {followUpMode ? (
              <button
                type="button"
                onClick={submit}
                disabled={hasBlockingDocumentProcessing}
                className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors disabled:opacity-40 shadow-sm"
              >
                <Send className="w-5 h-5" /> {allDone ? 'Confirmar documentación' : 'Confirmar por ahora'}
              </button>
            ) : allDone ? (
              <button
                type="button"
                onClick={submit}
                disabled={hasBlockingDocumentProcessing}
                className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors disabled:opacity-40 shadow-sm"
              >
                <Send className="w-5 h-5" /> Enviar documentación
              </button>
            ) : confirmingIncomplete ? (
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-300 rounded-xl text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Faltan documentos. Tu asesor puede no poder continuar sin ellos. ¿Confirmas el envío incompleto?</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingIncomplete(false)}
                    className="flex-1 border-2 border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl text-sm transition-colors hover:border-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={hasBlockingDocumentProcessing}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-40"
                  >
                    Sí, enviar incompleto
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingIncomplete(true)}
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
