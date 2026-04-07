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

type ChecklistStatus = 'pending' | 'attention' | 'done';

interface ChecklistItem {
  id: string;
  description: string;
  hint: string;
  label: string;
  icon: typeof Camera;
  status: ChecklistStatus;
  section: string;
  actionLabel: string;
}

export function ReviewSection({
  project,
  formData,
  source,
  hasBlockingDocumentProcessing,
  followUpMode = false,
  onEdit,
  onSuccess,
  onBack,
  autoSubmit = false,
}: Props) {
  const [submitting, setSubmitting] = useState(autoSubmit);
  const [submitError, setSubmitError] = useState('');
  const [confirmingIncomplete, setConfirmingIncomplete] = useState(false);
  const submitInProgress = useRef(false);
  const autoSubmitFired = useRef(false);
  const autoSubmitProp = useRef(autoSubmit);
  const energyCertPreRender = useRef<Promise<RenderedDocumentAsset> | null>(null);
  const preUploadPromise = useRef<Promise<boolean> | null>(null);
  const preUploadDone = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const signaturesOk = hasRequiredSignatures(formData);
  const locationVar = (formData.location ?? formData.representation?.location ?? null) as LocationRegion | null;
  const needsRepresentation = !!locationVar && locationVar !== 'other';
  const repDocsCount = locationVar === 'cataluna' ? 3 : 2;

  const { dni, ibi, electricityBill } = formData;
  const ebPages = electricityBill.pages ?? [];
  const ebUploaded = ebPages.filter(p => !!p.photo).length;
  const dniDone = isIdentityDocumentComplete(dni);
  const ibiBool = !!ibi.photo || (ibi.pages?.length ?? 0) > 0;
  const electricityBool = ebUploaded > 0;

  const rawEnergyStatus = formData.energyCertificate.status;
  const energyStatus =
    rawEnergyStatus === 'completed' && !isEnergyCertificateReadyToComplete(formData.energyCertificate)
      ? ('in-progress' as const)
      : rawEnergyStatus;

  const dniDoneLabel = getIdentityDocumentDoneLabel(dni);

  const docItems = [
    {
      id: 'dni',
      description: 'Documento de identidad del titular',
      hint: dniDone ? 'Toca para revisar o actualizar' : 'DNI, NIE o pasaporte — una cara es suficiente',
      label: dniDoneLabel ?? 'DNI / NIE',
      icon: Camera,
      status: (dniDone ? 'done' : 'pending') as ChecklistStatus,
      section: 'property-docs',
      actionLabel: 'Subir',
    },
    {
      id: 'ibi',
      description: 'Recibo del IBI o escritura de la propiedad',
      hint: ibiBool ? 'Documento de propiedad subido' : 'Puede ser una foto o un PDF',
      label: 'IBI o escritura',
      icon: FileText,
      status: (ibiBool ? 'done' : 'pending') as ChecklistStatus,
      section: 'property-docs',
      actionLabel: 'Subir',
    },
    {
      id: 'electricity',
      description: 'Última factura de la luz',
      hint: electricityBool
        ? `${ebUploaded} imagen${ebUploaded !== 1 ? 'es' : ''} subida${ebUploaded !== 1 ? 's' : ''}`
        : 'Foto o PDF — si tiene varias páginas, súbelas todas',
      label: electricityBool
        ? `Factura de luz — ${ebUploaded} imagen${ebUploaded !== 1 ? 'es' : ''}`
        : 'Factura de luz',
      icon: Zap,
      status: (electricityBool ? 'done' : 'pending') as ChecklistStatus,
      section: 'property-docs',
      actionLabel: 'Subir',
    },
  ];

  const repItem: ChecklistItem | null = needsRepresentation ? {
    id: 'representation',
    description: signaturesOk
      ? `Representación — ${repDocsCount} documento${(repDocsCount as number) !== 1 ? 's' : ''} firmado${(repDocsCount as number) !== 1 ? 's' : ''}`
      : formData.representation?.signatureDeferred
        ? 'Representación — firma aplazada'
        : 'Representación — firma pendiente',
    hint: signaturesOk
      ? 'Toca para revisar los documentos de autorización'
      : formData.representation?.signatureDeferred
        ? 'El cliente debe volver a este enlace para firmar'
        : 'Sin estas firmas no se puede tramitar el expediente',
    label: `Representación — ${repDocsCount} doc${(repDocsCount as number) !== 1 ? 's' : ''} firmado${(repDocsCount as number) !== 1 ? 's' : ''}`,
    icon: FileText,
    status: signaturesOk ? 'done' : formData.representation?.signatureDeferred ? 'attention' : 'pending',
    section: 'representation',
    actionLabel: 'Firmar',
  } : null;

  const energyItem: ChecklistItem = {
    id: 'energy',
    description: energyStatus === 'completed'
      ? 'Certificado energético — confirmado'
      : energyStatus === 'skipped'
        ? 'Certificado energético — saltado por cliente'
        : 'Certificado energético — pendiente',
    hint: energyStatus === 'completed'
      ? 'Toca para revisar o actualizar el certificado firmado'
      : energyStatus === 'skipped'
        ? 'Puedes completarlo más tarde desde este mismo enlace'
        : 'Completa el formulario del certificado energético',
    label: energyStatus === 'completed'
      ? 'Certificado energético — confirmado'
      : energyStatus === 'skipped'
        ? 'Certificado energético — saltado'
        : 'Certificado energético',
    icon: FileText,
    status: energyStatus === 'completed' ? 'done' : energyStatus === 'skipped' ? 'attention' : 'pending',
    section: 'energy-certificate',
    actionLabel: 'Completar',
  };

  const allChecklistItems: ChecklistItem[] = [
    ...docItems,
    ...(repItem ? [repItem] : []),
    energyItem,
  ];

  const pendingItems = allChecklistItems.filter(i => i.status === 'pending');
  const attentionItems = allChecklistItems.filter(i => i.status === 'attention');
  const doneItems = allChecklistItems.filter(i => i.status === 'done');

  const docsAllDone = dniDone && ibiBool && electricityBool;
  const doneCount = doneItems.length;
  const totalCount = allChecklistItems.length;
  const progressPct = Math.round((doneCount / totalCount) * 100);

  const submit = async () => {
    if (submitInProgress.current) return;
    submitInProgress.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const renderedRepresentation = stampRenderedDocumentMetadata(formData);
      let renderedFormData = renderedRepresentation;

      if (renderedRepresentation.energyCertificate.status === 'completed') {
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

      const preUploadSuccess = preUploadDone.current || await (preUploadPromise.current ?? Promise.resolve(false));

      const submitPayload = preUploadSuccess
        ? stripAllBinaryData(renderedFormData)
        : stripRenderedImages(renderedFormData);

      const res = await submitForm(project.code, submitPayload, source);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (formData.energyCertificate.status !== 'completed') return;
    energyCertPreRender.current = createRenderedEnergyCertificateAsset({ project, formData });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const getReadyFormData = () => {
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
      .then(fd => preUploadAssets(project.code, fd))
      .then(() => {
        preUploadDone.current = true;
        return true;
      })
      .catch(() => false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: scroll past the header so the checklist is the first thing visible.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!listRef.current) return;
      const top = listRef.current.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    }, 150);
    return () => clearTimeout(id);
  }, []);

  function stripAllBinaryData(fd: FormData): FormData {
    return JSON.parse(JSON.stringify(fd, (key: string, value: unknown) => {
      if (key === 'preview') return undefined;
      if (key === 'dataUrl') return undefined;
      if (key === 'imageDataUrl') return undefined;
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

      {/* Compact header — scrolls away on mount so the checklist leads */}
      <div className="bg-white px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-3">
            <img src="/eltex-logo.png" alt="Eltex" className="h-6 object-contain" />
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              {doneCount} de {totalCount} completados
            </span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {followUpMode
              ? (docsAllDone ? 'Confirma tu documentación' : 'Sube lo que falte y confirma')
              : (docsAllDone ? '¡Todo listo para enviar!' : 'Completa tu expediente')}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {followUpMode
              ? 'Revisa el estado de cada documento y confirma.'
              : 'Revisa cada punto antes de enviar.'}
          </p>
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-eltex-blue rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Checklist — this is where the scroll snaps to on mount */}
      <div ref={listRef} className="max-w-sm mx-auto px-5 pt-4 pb-8 space-y-5">

        {/* ── Pending items: action cards ── */}
        {pendingItems.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-0.5">
              Por completar · {pendingItems.length}
            </p>
            {pendingItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onEdit(
                    item.section === 'property-docs' ? `property-docs:${item.id}` : item.section
                  )}
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
                      {item.actionLabel} <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Attention items: deferred / skipped ── */}
        {attentionItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-0.5">
              En espera · {attentionItems.length}
            </p>
            {attentionItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onEdit(
                    item.section === 'property-docs' ? `property-docs:${item.id}` : item.section
                  )}
                  disabled={hasBlockingDocumentProcessing}
                  className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-left hover:bg-amber-100 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-amber-900">{item.description}</p>
                      <p className="text-xs text-amber-700 mt-0.5">{item.hint}</p>
                    </div>
                    <Icon className="w-4 h-4 text-amber-400 shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Done items: compact green rows ── */}
        {doneItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-0.5">
              Completado · {doneItems.length}
            </p>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
              {doneItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onEdit(
                    item.section === 'property-docs' ? `property-docs:${item.id}` : item.section
                  )}
                    disabled={hasBlockingDocumentProcessing}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700">{item.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.hint}</p>
                    </div>
                    <Icon className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Processing ── */}
        {hasBlockingDocumentProcessing && (
          <div className="flex items-center justify-center gap-3 py-4 bg-blue-50 rounded-2xl border border-blue-100">
            <Loader2 className="w-5 h-5 text-eltex-blue animate-spin" />
            <p className="text-sm font-medium text-eltex-blue">Procesando documentos...</p>
          </div>
        )}

        {/* ── Error ── */}
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

        {/* ── Submit / nav ── */}
        {!submitError && (
          <div className="pt-1 space-y-3">
            {followUpMode ? (
              <button
                type="button"
                onClick={submit}
                disabled={hasBlockingDocumentProcessing}
                className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 text-base transition-colors disabled:opacity-40 shadow-sm"
              >
                <Send className="w-5 h-5" /> {docsAllDone ? 'Confirmar documentación' : 'Confirmar por ahora'}
              </button>
            ) : docsAllDone ? (
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
