import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle, AlertTriangle, RotateCcw, Loader2, Camera, Plus, X, Zap, CreditCard, FileText, ChevronDown } from 'lucide-react';
import { pdfToImageFiles } from '@/lib/pdfToImages';
import { getPropertyDocsProgress } from '@/lib/propertyDocsProgress';
import { AdditionalBankDocumentsCard } from '@/sections/property-docs/AdditionalBankDocumentsCard';
import type {
  AdditionalBankDocumentEntry,
  IBIData,
  ElectricityBillData,
  DNIData,
  UploadedPhoto,
  StoredDocumentFile,
  AIExtraction,
  DocSlot,
  FormErrors,
  DocumentSlotKey,
  DocumentProcessingState,
} from '@/types';
import {
  getIdentityDocumentPendingLabel,
  isIdentityDocumentComplete,
  isDNIBackRequired,
  shouldStoreAsAdditionalIdentityDocument,
} from '@/lib/identityDocument';
import {
  normalizeSingleDniExtractionResponse,
  type DniBatchLikeResponse,
} from '@/lib/dniExtraction';
import { createDocumentIssue } from '@/lib/documentIssues';
import { validatePhoto, createStoredDocumentFile, createUploadedPhoto, preparePhotoAssets, expandUploadFiles, splitDocumentImageIfNeeded } from '@/lib/photoValidation';
import { extractDocument, extractDocumentBatch, extractDniBatch } from '@/services/api';

interface Props {
  dni: DNIData;
  ibi: IBIData;
  electricityBill: ElectricityBillData;
  additionalBankDocuments: AdditionalBankDocumentEntry[];
  followUpMode?: boolean;
  errors: FormErrors;
  documentProcessing: Record<DocumentSlotKey, DocumentProcessingState>;
  hasBlockingDocumentProcessing: boolean;
  customerPhone?: string;
  onDNIFrontPhotoChange: (photo: UploadedPhoto | null) => void;
  onDNIFrontExtractionChange: (extraction: AIExtraction | null) => void;
  onDNIBackPhotoChange: (photo: UploadedPhoto | null) => void;
  onDNIBackExtractionChange: (extraction: AIExtraction | null) => void;
  onDNIIssueChange: (issue: DNIData['issue']) => void;
  onDNIOriginalPdfsMerge: (pdfs: StoredDocumentFile[]) => void;
  onIBIDocumentChange: (pages: UploadedPhoto[], extraction: AIExtraction | null, originalPdfs: StoredDocumentFile[]) => void;
  onIBIIssueChange: (issue: IBIData['issue']) => void;
  onAddElectricityPages: (photos: UploadedPhoto[], extraction: AIExtraction | null, originalPdfs: StoredDocumentFile[]) => void;
  onRemoveElectricityPage: (index: number) => void;
  onElectricityIssueChange: (issue: ElectricityBillData['issue']) => void;
  onAddAdditionalBankDocuments: (entries: AdditionalBankDocumentEntry[]) => void;
  onReplaceAdditionalBankDocument: (entryId: string, replacement: AdditionalBankDocumentEntry) => void;
  onRemoveAdditionalBankDocument: (entryId: string) => void;
  onDocumentProcessingChange: (slot: DocumentSlotKey, state: DocumentProcessingState) => void;
  scrollToDoc?: string;
  onBack?: () => void;
  onContinue: () => void;
}

interface DocCardProps {
  title: string;
  hint: string;
  data: IBIData;
  slotKey: DocumentSlotKey;
  processing: DocumentProcessingState;
  onDocumentChange: (pages: UploadedPhoto[], extraction: AIExtraction | null, originalPdfs: StoredDocumentFile[]) => void;
  onIssueChange: (issue: IBIData['issue']) => void;
  onProcessingChange: (slot: DocumentSlotKey, state: DocumentProcessingState) => void;
}

const IBI_FIELDS = [
  { key: 'referenciaCatastral', label: 'Ref. Catastral' },
  { key: 'titular', label: 'Titular' },
  { key: 'titularNif', label: 'NIF titular' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'codigoPostal', label: 'Código postal' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'ejercicio', label: 'Ejercicio' },
  { key: 'importe', label: 'Importe' },
];

const ELECTRICITY_FIELDS = [
  { key: 'titular', label: 'Titular' },
  { key: 'nifTitular', label: 'NIF titular' },
  { key: 'cups', label: 'CUPS' },
  { key: 'potenciaContratada', label: 'Potencia (kW)' },
  { key: 'tipoFase', label: 'Instalación' },
  { key: 'tarifaAcceso', label: 'Tarifa' },
  { key: 'direccionSuministro', label: 'Dirección' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'provincia', label: 'Provincia' },
  { key: 'codigoPostal', label: 'C. Postal' },
  { key: 'fechaFactura', label: 'Fecha factura' },
  { key: 'periodoFacturacion', label: 'Periodo' },
  { key: 'importe', label: 'Importe' },
];

interface PendingItem {
  id: string;
  file: File;
  preview: string | null;
  status: 'validating' | 'extracting' | 'failed';
  error?: string;
  reason?: 'blurry' | 'other';
}

// ── Blur warning card ──────────────────────────────────────────────────────────
const BLUR_TIPS = [
  '📱 Mantén el móvil completamente fijo mientras fotografías',
  '💡 Busca una zona bien iluminada, sin reflejos ni sombras',
  '📄 Coloca el documento sobre una superficie plana y lisa',
  '📏 Sitúate a 20–30 cm del documento',
];

function BlurWarningCard({ preview, onRetry, onForce }: { preview: string | null; onRetry: () => void; onForce?: () => void }) {
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

function PersistentIssueNotice({
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

interface PreparedDniItem {
  id: string;
  file: File;
  preview: string;
  base64: string;
  width: number | undefined;
  height: number | undefined;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function buildStoredDocumentFromPreparedItem(prepared: PreparedDniItem): StoredDocumentFile {
  const baseName = prepared.file.name.replace(/\.[^.]+$/, '') || 'documento-identidad';
  return {
    id: genId(),
    filename: `${baseName}.jpg`,
    mimeType: 'image/jpeg',
    dataUrl: prepared.preview,
    timestamp: Date.now(),
    sizeBytes: prepared.file.size,
  };
}

function getStoredIdentityFilesMessage(files: StoredDocumentFile[]): string {
  const count = files.length;
  return `Archivos del documento guardados: ${count} archivo${count !== 1 ? 's' : ''}.`;
}

async function extractPreparedDniFiles(preparedFiles: PreparedDniItem[]): Promise<DniBatchLikeResponse> {
  if (preparedFiles.length !== 1) {
    const response = await extractDniBatch(preparedFiles.map((item) => item.base64));
    return {
      success: response.success,
      message: response.message,
      results: response.results?.map((result) => ({
        ...result,
        extraction: result.extraction as AIExtraction | undefined,
      })),
    };
  }

  const response = await extractDocument(preparedFiles[0].base64, 'dniAuto');
  return normalizeSingleDniExtractionResponse(response);
}

// ── Document progress strip ────────────────────────────────────────────────────
interface DocSlotStatus {
  label: string;
  done: boolean;
}

function DocProgressStrip({ slots }: { slots: DocSlotStatus[] }) {
  const doneCount = slots.filter(s => s.done).length;
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
              slot.done
                ? 'bg-green-50 border border-green-100'
                : 'bg-white border border-gray-200'
            }`}
          >
            {slot.done
              ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
              : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />
            }
            <span className={`text-xs font-medium truncate ${slot.done ? 'text-green-700' : 'text-gray-600'}`}>
              {slot.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compact accepted row (frictionless resume) ─────────────────────────────────
function CompactRow({ icon, title, subtitle, onExpand }: {
  icon: React.ReactNode;
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

// ── Cross-document validation warnings ────────────────────────────────────────
function computeValidationWarnings(
  dni: DNIData,
  electricityBill: ElectricityBillData
): string[] {
  const warnings: string[] = [];

  const dniName: string | null = dni.front.extraction?.extractedData?.fullName ?? null;
  const ebTitular: string | null = electricityBill.pages[0]?.extraction?.extractedData?.titular ?? null;

  if (dniName && ebTitular) {
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    const dniWords = dniName.split(/\s+/).filter(w => w.length > 2).map(normalize);
    const ebWords = ebTitular.split(/\s+/).filter(w => w.length > 2).map(normalize);
    const hasCommonWord = dniWords.some(w => ebWords.includes(w));
    if (!hasCommonWord) {
      warnings.push(`El nombre del DNI («${dniName}») no coincide con el titular de la factura de luz («${ebTitular}»). Comprueba que el documento pertenezca al mismo titular.`);
    }
  }

  return warnings;
}

// ── IBI DocCard ────────────────────────────────────────────────────────────────
function DocCard({ title, hint, data, slotKey, processing, onDocumentChange, onIssueChange, onProcessingChange }: DocCardProps) {
  const processFiles = useCallback(async (files: File[]) => {
    const hadAcceptedDocument = !!data.photo || data.pages.length > 0;
    let storedPages: UploadedPhoto[] = [];
    let nextOriginalPdfs = data.originalPdfs;
    onProcessingChange(slotKey, { status: 'validating', pendingPreview: null });

    try {
      const { files: expandedFiles, originalPdfs, errors } = await expandUploadFiles(files);
      nextOriginalPdfs = originalPdfs;
      if (errors.length > 0) {
        onProcessingChange(slotKey, {
          status: hadAcceptedDocument ? 'accepted' : 'rejected',
          errorCode: 'temporary-error',
          errorMessage: errors[0].message,
          pendingPreview: null,
        });
        return;
      }

      if (expandedFiles.length === 0) {
        onProcessingChange(slotKey, {
          status: hadAcceptedDocument ? 'accepted' : 'rejected',
          errorCode: 'validation',
          errorMessage: 'No se encontró ninguna imagen utilizable.',
          pendingPreview: null,
        });
        return;
      }

      const preparedPages: Array<{ file: File; preview: string; base64: string; width?: number; height?: number }> = [];
      for (const { file, skipBlurCheck } of expandedFiles) {
        // Generate a quick object URL preview BEFORE validation so it can be shown on blur rejection
        const tempPreviewUrl = URL.createObjectURL(file);
        const check = await validatePhoto(file, { skipBlurCheck });
        if (!check.valid) {
          onProcessingChange(slotKey, {
            status: hadAcceptedDocument ? 'accepted' : 'rejected',
            errorCode: check.reason === 'blurry' ? 'blurry' : 'validation',
            errorMessage: check.error || 'Imagen no válida.',
            pendingPreview: check.reason === 'blurry' ? tempPreviewUrl : null,
          });
          return;
        }
        URL.revokeObjectURL(tempPreviewUrl);

        const { preview, aiBase64 } = await preparePhotoAssets(file);
        preparedPages.push({
          file,
          preview,
          base64: aiBase64,
          width: check.width,
          height: check.height,
        });
      }

      const firstPage = preparedPages[0];
      onProcessingChange(slotKey, {
        status: 'extracting',
        errorCode: undefined,
        errorMessage: undefined,
        pendingPreview: firstPage.preview,
      });

      const res = preparedPages.length > 1
        ? await extractDocumentBatch(preparedPages.map((page) => page.base64), 'ibi')
        : await extractDocument(firstPage.base64, slotKey as 'ibi');

      if (!res.success || !res.extraction) {
        const errorCode = res.reason === 'unreadable'
          || res.reason === 'wrong-document'
          || res.reason === 'wrong-side'
          || res.reason === 'temporary-error'
          ? res.reason
          : (res.isUnreadable ? 'unreadable' : res.isWrongDocument ? 'wrong-document' : 'temporary-error');
        storedPages = preparedPages.map((page) => createUploadedPhoto(
          page.file,
          page.preview,
          page.width,
          page.height
        ));
        onDocumentChange(storedPages, null, originalPdfs);
        onIssueChange(createDocumentIssue(
          errorCode,
          res.message || 'Hemos guardado el documento, pero la lectura automática no pudo completarse.'
        ));
        onProcessingChange(slotKey, {
          status: 'accepted',
          errorCode,
          errorMessage: res.message || 'No se pudo procesar el documento.',
          pendingPreview: null,
        });
        return;
      }

      storedPages = preparedPages.map((page) => createUploadedPhoto(
        page.file,
        page.preview,
        page.width,
        page.height
      ));
      onDocumentChange(storedPages, {
        ...res.extraction,
        needsManualReview: res.needsManualReview ?? res.extraction.needsManualReview ?? false,
        confirmedByUser: true,
      }, originalPdfs);
      onIssueChange(
        (res.needsManualReview ?? res.extraction.needsManualReview ?? false)
          ? createDocumentIssue('manual-review', 'Hemos guardado el documento, pero conviene revisarlo antes de tramitarlo.')
          : null
      );
      onProcessingChange(slotKey, { status: 'accepted', pendingPreview: null });
    } catch (err) {
      console.error('extractDocument error:', err);
      if (storedPages.length > 0) {
        onDocumentChange(storedPages, null, nextOriginalPdfs);
        onIssueChange(createDocumentIssue(
          'temporary-error',
          'Hemos guardado el documento, pero la lectura automática falló por conexión. Puedes continuar y revisarlo más tarde.'
        ));
      }
      onProcessingChange(slotKey, {
        status: storedPages.length > 0 || hadAcceptedDocument ? 'accepted' : 'rejected',
        errorCode: 'temporary-error',
        errorMessage: 'Error de conexión. Comprueba tu conexión a internet y vuelve a intentarlo.',
        pendingPreview: null,
      });
    }
  }, [data.originalPdfs, data.pages.length, data.photo, onDocumentChange, onIssueChange, onProcessingChange, slotKey]);

  const reset = useCallback(() => {
    onDocumentChange([], null, []);
    onIssueChange(null);
    onProcessingChange(slotKey, { status: 'idle', pendingPreview: null });
  }, [onDocumentChange, onIssueChange, onProcessingChange, slotKey]);

  const extractedData = data.extraction?.extractedData || {};
  const pageCount = data.pages.length;
  const accepted = pageCount > 0;
  const persistentIssue = data.issue ?? null;
  const isBusy = processing.status === 'validating' || processing.status === 'extracting';
  // Only show red error when there is NO accepted doc (fresh failure, not a replacement failure)
  const showError = !!processing.errorMessage && !isBusy && !accepted;
  // Show amber note inside accepted card when a replacement attempt failed
  const showReplacementNote = !!processing.errorMessage && !isBusy && accepted && !persistentIssue?.message;

  return (
    <div className={`rounded-2xl border-2 transition-colors ${accepted ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <p className={`font-semibold ${accepted ? 'text-gray-500' : 'text-gray-900'}`}>{title}</p>
        {accepted && (
          <div className="flex items-center gap-2">
            {pageCount > 1 && (
              <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {pageCount} páginas
              </span>
            )}
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
        )}
      </div>

      {!accepted && !isBusy && (
        <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-eltex-blue hover:bg-blue-50/30 transition-colors">
          <input
            type="file"
            data-testid={`${slotKey}-input`}
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length) processFiles(files);
            }}
          />
          <Camera className="w-7 h-7 text-gray-300" />
          <span className="text-sm font-medium text-gray-500">Fotos o PDF</span>
          <span className="text-xs text-gray-400 text-center px-4">{hint}</span>
        </label>
      )}

      {isBusy && (
        <div className="space-y-3">
          {processing.pendingPreview && <img src={processing.pendingPreview} alt={`${title} en proceso`} className="w-full h-28 object-cover rounded-xl opacity-80" />}
          <div className="flex items-center gap-3 py-1">
            <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
            <p className="text-sm text-gray-500">{processing.status === 'validating' ? 'Verificando calidad...' : 'Extrayendo datos...'}</p>
          </div>
        </div>
      )}

      {showError && processing.errorCode === 'blurry' && (
        <BlurWarningCard
          preview={processing.pendingPreview ?? null}
          onRetry={() => {
            onDocumentChange([], null, []);
            onProcessingChange(slotKey, { status: 'idle', pendingPreview: null });
          }}
        />
      )}
      {showError && processing.errorCode !== 'blurry' && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm text-red-700">{processing.errorMessage}</p>
            {processing.errorCode === 'unreadable' && (
              <p className="text-xs text-red-500">
                Consejo: asegúrate de que el texto esté bien enfocado y con buena iluminación.
              </p>
            )}
          </div>
        </div>
      )}

      {!isBusy && persistentIssue?.message && (
        <PersistentIssueNotice
          message={persistentIssue.message}
          tone={accepted ? 'amber' : 'red'}
        />
      )}

      {accepted && (
        <div className="space-y-3">
          {data.photo?.preview && <img src={data.photo.preview} alt={title} className="w-full h-28 object-cover rounded-xl opacity-80" />}
          {pageCount > 1 && (
            <p className="text-xs text-gray-500">
              Se han guardado {pageCount} páginas para este documento.
            </p>
          )}
          {data.originalPdfs.length > 0 && (
            <p className="text-xs text-gray-500">
              PDF original guardado: {data.originalPdfs.length} archivo{data.originalPdfs.length !== 1 ? 's' : ''}.
            </p>
          )}
          {showReplacementNote && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              {processing.errorCode === 'blurry' ? (
                <div className="space-y-1">
                  <p className="text-sm text-amber-800 font-medium">La imagen estaba desenfocada — se mantiene el anterior.</p>
                  <p className="text-xs text-amber-700">Mantén el móvil fijo, busca buena luz y sitúate a 20-30 cm del documento.</p>
                </div>
              ) : (
                <p className="text-sm text-amber-700">El documento se ha guardado, pero la lectura automática no pudo completarse. Puedes continuar o volver a intentarlo si quieres sustituirlo.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            {IBI_FIELDS.map(({ key, label }) => {
              const value = data.extraction?.manualCorrections?.[key] ?? extractedData[key];
              if (!value) return null;
              return (
                <div key={key} className="flex gap-2 text-sm">
                  <span className="text-gray-400 shrink-0 w-28">{label}</span>
                  <span className="font-medium text-gray-700">{String(value)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <label className="flex-1 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 transition-colors justify-center cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (files.length) processFiles(files);
                }}
              />
              <Camera className="w-3.5 h-3.5" /> Sustituir
            </label>
            <button type="button" onClick={reset} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 transition-colors justify-center">
              <RotateCcw className="w-3.5 h-3.5" /> Quitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DNI Combined Card ──────────────────────────────────────────────────────────
interface DNICardProps {
  front: DocSlot;
  back: DocSlot;
  originalPdfs: StoredDocumentFile[];
  issue: DNIData['issue'];
  onFrontPhotoChange: (p: UploadedPhoto | null) => void;
  onFrontExtractionChange: (e: AIExtraction | null) => void;
  onBackPhotoChange: (p: UploadedPhoto | null) => void;
  onBackExtractionChange: (e: AIExtraction | null) => void;
  onIssueChange: (issue: DNIData['issue']) => void;
  onOriginalPdfsMerge: (pdfs: StoredDocumentFile[]) => void;
  onBusyChange: (busy: boolean) => void;
}

function DNICard({
  front,
  back,
  originalPdfs,
  issue,
  onFrontPhotoChange,
  onFrontExtractionChange,
  onBackPhotoChange,
  onBackExtractionChange,
  onIssueChange,
  onOriginalPdfsMerge,
  onBusyChange,
}: DNICardProps) {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);

  const hasFront = !!front.photo;
  const hasBack = !!back.photo;
  const hasAny = hasFront || hasBack;
  const isComplete = isIdentityDocumentComplete({ front, back });
  const pendingLabel = getIdentityDocumentPendingLabel(front, back);
  const backRequired = isDNIBackRequired(front);
  const isBusy = isPreparing || pendingItems.some(p => p.status !== 'failed');

  useEffect(() => { onBusyChange(isBusy); }, [isBusy, onBusyChange]);

  const commitWithoutExtraction = useCallback((
    preparedFiles: PreparedDniItem[],
    uploadedOriginalPdfs: StoredDocumentFile[],
    issueCode: 'temporary-error' | 'wrong-document' | 'unreadable' | 'wrong-side',
    issueMessage: string,
    options?: { assignedFront?: boolean; assignedBack?: boolean }
  ) => {
    let nextFrontAssigned = options?.assignedFront ?? !!front.photo;
    let nextBackAssigned = options?.assignedBack ?? !!back.photo;
    let savedAny = false;

    preparedFiles.forEach((prepared) => {
      const photo = createUploadedPhoto(prepared.file, prepared.preview, prepared.width, prepared.height);
      if (!nextFrontAssigned) {
        nextFrontAssigned = true;
        savedAny = true;
        onFrontPhotoChange(photo);
        onFrontExtractionChange(null);
        return;
      }
      if (!nextBackAssigned) {
        nextBackAssigned = true;
        savedAny = true;
        onBackPhotoChange(photo);
        onBackExtractionChange(null);
      }
    });

    if (savedAny) {
      if (uploadedOriginalPdfs.length > 0) onOriginalPdfsMerge(uploadedOriginalPdfs);
      onIssueChange(createDocumentIssue(issueCode, issueMessage));
    }

    setPendingItems((prev) => prev.filter((item) => !preparedFiles.some((prepared) => prepared.id === item.id)));
    return {
      savedAny,
      assignedFront: nextFrontAssigned,
      assignedBack: nextBackAssigned,
    };
  }, [
    back.photo,
    front.photo,
    onBackExtractionChange,
    onBackPhotoChange,
    onFrontExtractionChange,
    onFrontPhotoChange,
    onIssueChange,
    onOriginalPdfsMerge,
  ]);

  const processFiles = useCallback(async (files: File[], opts?: { forceSkipBlur?: boolean }) => {
    const forceSkipBlur = opts?.forceSkipBlur ?? false;
    setIsPreparing(true);
    const { files: expandedFiles, originalPdfs: uploadedOriginalPdfs, errors } = await expandUploadFiles(files).finally(() => setIsPreparing(false));
    if (errors.length > 0) {
      setPendingItems(prev => [
        ...prev,
        ...errors.map(({ file, message }) => ({
          id: genId(),
          file,
          preview: null,
          status: 'failed' as const,
          error: message,
        })),
      ]);
    }

    if (expandedFiles.length === 0) return;

    // For images that came from a PDF (skipBlurCheck=true), check whether the
    // page is much wider than it is tall, or much taller than wide — this indicates
    // both DNI sides were scanned on a single page. Split those into two halves
    // so each side can be extracted independently.
    // forceSkipBlur: used when the user clicks "Usar igualmente" on a blurry camera photo —
    // bypasses the blur check for that specific file while preserving PDF split logic.
    const splitFiles: { file: File; skipBlurCheck: boolean }[] = [];
    for (const entry of expandedFiles) {
      if (entry.skipBlurCheck) {
        // PDF page — split if combined, always skip blur (digital PDFs are sharp)
        const halves = await splitDocumentImageIfNeeded(entry.file, entry.file.name);
        for (const half of halves) {
          splitFiles.push({ file: half, skipBlurCheck: true });
        }
      } else {
        // Camera photo — never split by aspect ratio (camera dimensions ≠ document layout),
        // but respect forceSkipBlur if user explicitly chose to proceed despite blur warning.
        splitFiles.push({ file: entry.file, skipBlurCheck: forceSkipBlur });
      }
    }

    const newItems: PendingItem[] = splitFiles.map(({ file }) => ({ id: genId(), file, preview: null, status: 'validating' }));
    setPendingItems(prev => [...prev, ...newItems]);
    let assignedFront = !!front.photo;
    let assignedBack = !!back.photo;
    let currentFront = front;
    let currentBack = back;

    const preparedFileResults = await Promise.all(splitFiles.map(async ({ file, skipBlurCheck }, index) => {
      const id = newItems[index].id;
      try {
        // Generate preview immediately so it can be shown even if blur check fails
        const tempPreviewUrl = URL.createObjectURL(file);
        setPendingItems(prev => prev.map(p => p.id === id ? { ...p, preview: tempPreviewUrl } : p));

        const check = await validatePhoto(file, { skipBlurCheck });
        if (!check.valid) {
          setPendingItems(prev => prev.map(p => p.id === id ? {
            ...p,
            status: 'failed' as const,
            error: check.error || 'Imagen no válida.',
            reason: check.reason === 'blurry' ? 'blurry' : 'other',
          } : p));
          return null;
        }

        // Convert to persistent base64 preview and revoke the temp object URL
        const { preview, aiBase64 } = await preparePhotoAssets(file);
        URL.revokeObjectURL(tempPreviewUrl);
        setPendingItems(prev => prev.map(p => p.id === id ? { ...p, preview, status: 'extracting' } : p));

        return {
          id,
          file,
          preview,
          base64: aiBase64,
          width: check.width,
          height: check.height,
        };
      } catch {
        // Any unexpected error during validation/preview — mark as failed so isBusy resets
        setPendingItems(prev => prev.map(p => p.id === id ? {
          ...p,
          status: 'failed' as const,
          error: 'Error al procesar el archivo.',
        } : p));
        return null;
      }
    }));

    const preparedFiles: PreparedDniItem[] = preparedFileResults.filter(
      (item): item is PreparedDniItem => item !== null
    );

    if (preparedFiles.length === 0) return;

    try {
      const res = await extractPreparedDniFiles(preparedFiles);
      let acceptedCount = 0;
      let fallbackCount = 0;
      let nextIssue: DNIData['issue'] = null;

      if (!res.success || !Array.isArray(res.results) || res.results.length !== preparedFiles.length) {
        commitWithoutExtraction(
          preparedFiles,
          uploadedOriginalPdfs,
          'temporary-error',
          res.message || 'Hemos guardado las imágenes, pero la lectura automática del DNI falló. Puedes continuar y revisarlo más tarde.'
        );
        return;
      }

      preparedFiles.forEach((prepared, index) => {
        const result = res.results?.[index];
        if (!result?.extraction) {
          const fallbackResult = commitWithoutExtraction(
            [prepared],
            [],
            'temporary-error',
            result?.message || 'Hemos guardado la imagen, pero la lectura automática del DNI no pudo completarse.',
            { assignedFront, assignedBack }
          );
          assignedFront = fallbackResult.assignedFront;
          assignedBack = fallbackResult.assignedBack;
          if (!fallbackResult.savedAny) {
            setPendingItems(prev => prev.map(p => p.id === prepared.id ? {
              ...p,
              status: 'failed' as const,
              error: result?.message || 'No se pudo procesar el DNI.',
            } : p));
            return;
          }
          fallbackCount += 1;
          nextIssue = createDocumentIssue(
            'temporary-error',
            result?.message || 'Hemos guardado la imagen, pero la lectura automática del DNI no pudo completarse.'
          );
          return;
        }

        const photo = createUploadedPhoto(prepared.file, prepared.preview, prepared.width, prepared.height);
        const extracted = result.extraction as Omit<AIExtraction, 'needsManualReview' | 'confirmedByUser'>;
        const extraction: AIExtraction = {
          ...extracted,
          needsManualReview: result.needsManualReview ?? false,
          confirmedByUser: true,
        };

        if (result.side === 'back') {
          if (assignedBack) {
            setPendingItems(prev => prev.map(p => p.id === prepared.id ? {
              ...p,
              status: 'failed' as const,
              error: 'El sistema detectó que esta imagen también corresponde a la página complementaria. Sube la página principal del DNI/NIE con los datos del titular.'
            } : p));
            return;
          }
          assignedBack = true;
          currentBack = { photo, extraction };
          onBackPhotoChange(photo);
          onBackExtractionChange(extraction);
          acceptedCount += 1;
        } else {
          if (assignedFront) {
            if (shouldStoreAsAdditionalIdentityDocument({ front: currentFront, back: currentBack }, result.side)) {
              onOriginalPdfsMerge([buildStoredDocumentFromPreparedItem(prepared)]);
              acceptedCount += 1;
            } else {
              setPendingItems(prev => prev.map(p => p.id === prepared.id ? {
                ...p,
                status: 'failed' as const,
                error: 'El sistema detectó que esta imagen también corresponde a la página principal. Si tu documento tiene reverso útil, sube ahora la otra cara.'
              } : p));
              return;
            }
          } else {
            assignedFront = true;
            currentFront = { photo, extraction };
            onFrontPhotoChange(photo);
            onFrontExtractionChange(extraction);
            acceptedCount += 1;
          }
        }

        if ((result.needsManualReview ?? false) && !nextIssue) {
          nextIssue = createDocumentIssue(
            'manual-review',
            'Hemos guardado el DNI, pero conviene revisarlo antes de tramitarlo.'
          );
        }

        setPendingItems(prev => prev.filter(p => p.id !== prepared.id));
      });

      if ((acceptedCount > 0 || fallbackCount > 0) && uploadedOriginalPdfs.length > 0) {
        onOriginalPdfsMerge(uploadedOriginalPdfs);
      }
      if (acceptedCount > 0 || fallbackCount > 0) {
        onIssueChange(nextIssue);
      }
    } catch {
      commitWithoutExtraction(
        preparedFiles,
        uploadedOriginalPdfs,
        'temporary-error',
        'Hemos guardado las imágenes, pero la lectura automática del DNI falló por conexión. Puedes continuar y revisarlo más tarde.'
      );
    }
  }, [
    back,
    commitWithoutExtraction,
    front,
    onBackExtractionChange,
    onBackPhotoChange,
    onFrontExtractionChange,
    onFrontPhotoChange,
    onIssueChange,
    onOriginalPdfsMerge,
  ]);

  const dismissError = (id: string) => {
    setPendingItems(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className={`rounded-2xl border-2 transition-colors ${hasAny ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-400" />
          <p className={`font-semibold ${hasAny ? 'text-gray-500' : 'text-gray-900'}`}>DNI / NIE</p>
        </div>
        {isComplete && <CheckCircle className="w-5 h-5 text-green-500" />}
        {hasAny && !isComplete && pendingLabel && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
            {pendingLabel}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Para DNI sube las dos caras. Para NIE certificado, NIE tarjeta o pasaporte, una foto es suficiente.
      </p>

      {originalPdfs.length > 0 && (
        <p className="text-xs text-gray-500">
          {getStoredIdentityFilesMessage(originalPdfs)}
        </p>
      )}

      {issue?.message && !isBusy && (
        <PersistentIssueNotice
          message={issue.message}
          tone={hasAny ? 'amber' : 'red'}
        />
      )}

      {/* Front + Back slots */}
      {hasAny && (
        <div className="grid grid-cols-2 gap-3">
          {/* Front */}
          <div className={`rounded-xl border overflow-hidden ${hasFront ? 'border-green-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
            {hasFront && front.photo?.preview ? (
              <>
                <div className="relative">
                  <img src={front.photo.preview} alt="DNI frontal" className="w-full h-24 object-cover" />
                  <button
                    type="button"
                    onClick={() => { onFrontPhotoChange(null); onFrontExtractionChange(null); onIssueChange(null); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">FRONTAL</span>
                </div>
                <div className="px-2 py-1.5 space-y-0.5">
                  {['fullName', 'dniNumber'].map(k => {
                    const v = front.extraction?.extractedData?.[k];
                    if (!v) return null;
                    return <p key={k} className="text-[10px] text-gray-700 font-medium truncate">{String(v)}</p>;
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-3 min-h-[96px]">
                <p className="text-[10px] text-gray-400 text-center">Página principal</p>
                <p className="text-[9px] text-gray-300 text-center mt-1">Datos identificativos</p>
              </div>
            )}
          </div>

          {/* Back */}
          <div className={`rounded-xl border overflow-hidden ${hasBack ? 'border-green-200 bg-white' : backRequired ? 'border-dashed border-amber-300 bg-amber-50/40' : 'border-dashed border-gray-200 bg-gray-50/60'}`}>
            {hasBack && back.photo?.preview ? (
              <>
                <div className="relative">
                  <img src={back.photo.preview} alt="DNI trasera" className="w-full h-24 object-cover" />
                  <button
                    type="button"
                    onClick={() => { onBackPhotoChange(null); onBackExtractionChange(null); onIssueChange(null); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">TRASERA</span>
                </div>
                <div className="px-2 py-1.5 space-y-0.5">
                  {['address', 'municipality'].map(k => {
                    const v = back.extraction?.extractedData?.[k];
                    if (!v) return null;
                    return <p key={k} className="text-[10px] text-gray-700 font-medium truncate">{String(v)}</p>;
                  })}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center p-3 min-h-[96px]">
                <p className={`text-[10px] text-center ${backRequired ? 'text-amber-600' : 'text-gray-400'}`}>Reverso</p>
                <p className={`text-[9px] text-center mt-1 ${backRequired ? 'text-amber-500 font-medium' : 'text-gray-300'}`}>
                  {backRequired ? '(obligatorio)' : '(opcional)'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Immediate feedback while PDF is being read/converted (before split+validate begins) */}
      {isPreparing && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-eltex-blue animate-spin" />
            <p className="text-xs text-gray-500">Leyendo archivo...</p>
          </div>
        </div>
      )}

      {/* Pending items */}
      {pendingItems.map(item => (
        <div key={item.id}>
          {item.status === 'failed' && item.reason === 'blurry' ? (
            <div className="relative">
              <BlurWarningCard
                preview={item.preview}
                onRetry={() => dismissError(item.id)}
                onForce={() => { dismissError(item.id); processFiles([item.file], { forceSkipBlur: true }); }}
              />
              <button
                type="button"
                onClick={() => dismissError(item.id)}
                className="absolute top-2 right-2 text-amber-600 hover:text-amber-800 bg-white/70 rounded-full p-0.5"
                aria-label="Descartar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : item.status === 'failed' ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 space-y-2">
              {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-16 object-cover rounded-lg opacity-70" />}
              <div className="space-y-2">
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 flex-1">{item.error}</p>
                  <button type="button" onClick={() => dismissError(item.id)} className="text-red-400 hover:text-red-600 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { dismissError(item.id); processFiles([item.file]); }}
                  className="w-full text-xs text-eltex-blue hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 space-y-2">
              {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-16 object-cover rounded-lg opacity-70" />}
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-eltex-blue animate-spin" />
                <p className="text-xs text-gray-500">{item.status === 'validating' ? 'Verificando calidad...' : 'Detectando cara y extrayendo datos...'}</p>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Upload button */}
      {!isBusy && (
        <label className={`flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          hasAny ? 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/20 text-gray-400 hover:text-eltex-blue' : 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/30 text-gray-500'
        }`}>
          <input
            type="file"
            data-testid="dni-input"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length) processFiles(files);
            }}
          />
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">{hasAny ? 'Añadir más fotos del documento' : 'Añadir fotos del documento'}</span>
        </label>
      )}
    </div>
  );
}

// ── Electricity Card (parallel processing) ────────────────────────────────────
interface ElectricityCardProps {
  pages: ElectricityBillData['pages'];
  originalPdfs: StoredDocumentFile[];
  issue: ElectricityBillData['issue'];
  onAddPages: (photos: UploadedPhoto[], extraction: AIExtraction | null, originalPdfs: StoredDocumentFile[]) => void;
  onRemovePage: (index: number) => void;
  onIssueChange: (issue: ElectricityBillData['issue']) => void;
  onBusyChange: (busy: boolean) => void;
}

function ElectricityCard({ pages, originalPdfs, issue, onAddPages, onRemovePage, onIssueChange, onBusyChange }: ElectricityCardProps) {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [pdfExpanding, setPdfExpanding] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const isBusy = pdfExpanding || pendingItems.some(p => p.status !== 'failed');
  const hasPages = pages.length > 0;

  useEffect(() => { onBusyChange(isBusy); }, [isBusy, onBusyChange]);

  // Safety timeout: force-fail any item stuck in processing for > 30 s.
  // Prevents a permanent disabled button if a network request hangs silently.
  useEffect(() => {
    const processingIds = pendingItems
      .filter(p => p.status === 'validating' || p.status === 'extracting')
      .map(p => p.id);
    if (processingIds.length === 0) return;
    const timer = setTimeout(() => {
      setPendingItems(prev => prev.map(p =>
        processingIds.includes(p.id) && (p.status === 'validating' || p.status === 'extracting')
          ? { ...p, status: 'failed' as const, error: 'Tiempo de espera agotado. Inténtalo de nuevo.' }
          : p
      ));
    }, 30_000);
    return () => clearTimeout(timer);
  }, [pendingItems]);

  const processFiles = useCallback(async (files: File[], uploadedOriginalPdfs: StoredDocumentFile[] = [], skipBlurCheck = false) => {
    const newItems: PendingItem[] = files.map(file => ({ id: genId(), file, preview: null, status: 'validating' }));
    setPendingItems(prev => [...prev, ...newItems]);

    // Step 1: validate + get previews + compress all files in parallel
    type ValidFile = { file: File; id: string; preview: string; base64: string; width: number | undefined; height: number | undefined };

    const validFileResults: Array<ValidFile | null> = await Promise.all(files.map(async (file, i) => {
      const id = newItems[i].id;
      try {
        // Generate preview immediately so it can be shown even if blur check fails
        const tempPreviewUrl = URL.createObjectURL(file);
        setPendingItems(prev => prev.map(p => p.id === id ? { ...p, preview: tempPreviewUrl } : p));

        const check = await validatePhoto(file, { skipBlurCheck });
        if (!check.valid) {
          setPendingItems(prev => prev.map(p => p.id === id ? {
            ...p,
            status: 'failed' as const,
            error: check.error || 'Imagen no válida.',
            reason: check.reason === 'blurry' ? 'blurry' : 'other',
          } : p));
          return null;
        }

        // Convert to persistent base64 preview and revoke the temp object URL
        const { preview, aiBase64 } = await preparePhotoAssets(file);
        URL.revokeObjectURL(tempPreviewUrl);
        setPendingItems(prev => prev.map(p => p.id === id ? { ...p, preview, status: 'extracting' } : p));
        return { file, id, preview, base64: aiBase64, width: check.width, height: check.height };
      } catch {
        // Any unexpected error during validation/preview — mark as failed so isBusy resets
        setPendingItems(prev => prev.map(p => p.id === id ? {
          ...p,
          status: 'failed' as const,
          error: 'Error al procesar el archivo.',
        } : p));
        return null;
      }
    }));

    const validFiles = validFileResults.filter((item): item is ValidFile => item !== null);

    if (validFiles.length === 0) return;

    // Step 2: send ALL valid images in a single AI call
    try {
      const res = await extractDocumentBatch(validFiles.map(f => f.base64), 'electricity');

      if (!res.success || !res.extraction) {
        const fallbackPhotos = validFiles.map(({ file, preview, width, height }) =>
          createUploadedPhoto(file, preview, width, height)
        );
        onAddPages(fallbackPhotos, null, uploadedOriginalPdfs);
        onIssueChange(createDocumentIssue(
          'temporary-error',
          'Hemos guardado la factura, pero la lectura automática no pudo completarse. Puedes continuar y revisarla más tarde.'
        ));
        setPendingItems(prev => prev.filter((item) => !validFiles.find((file) => file.id === item.id)));
        return;
      }

      const extraction: AIExtraction = {
        ...res.extraction,
        needsManualReview: res.needsManualReview ?? false,
        confirmedByUser: true,
      };

      const newPhotos: UploadedPhoto[] = [];
      const processedIds: string[] = [];

      for (const { file, id, preview, width, height } of validFiles) {
        const photo = createUploadedPhoto(file, preview, width, height);
        const isDuplicate = pages.some(p => p.photo?.preview === photo.preview);
        if (!isDuplicate) {
          newPhotos.push(photo);
        }
        processedIds.push(id);
      }

      if (newPhotos.length > 0 || uploadedOriginalPdfs.length > 0) {
        onAddPages(newPhotos, extraction, uploadedOriginalPdfs);
      }
      onIssueChange(
        (res.needsManualReview ?? false)
          ? createDocumentIssue('manual-review', 'Hemos guardado la factura, pero conviene revisarla antes de tramitarla.')
          : null
      );

      // Remove from pending only after onAddPages is called
      setPendingItems(prev => prev.filter(p => !processedIds.includes(p.id)));
    } catch {
      const fallbackPhotos = validFiles.map(({ file, preview, width, height }) =>
        createUploadedPhoto(file, preview, width, height)
      );
      onAddPages(fallbackPhotos, null, uploadedOriginalPdfs);
      onIssueChange(createDocumentIssue(
        'temporary-error',
        'Hemos guardado la factura, pero la lectura automática falló por conexión. Puedes continuar y revisarla más tarde.'
      ));
      setPendingItems(prev => prev.filter((item) => !validFiles.find((file) => file.id === item.id)));
    }
  }, [onAddPages, onIssueChange, pages]);

  const dismissError = (id: string) => {
    setPendingItems(prev => prev.filter(p => p.id !== id));
  };

  const handleFileSelect = useCallback(async (selectedFiles: File[]) => {
    const pdfs = selectedFiles.filter(f => f.type === 'application/pdf');
    const images = selectedFiles.filter(f => f.type !== 'application/pdf');

    setPdfError(null);

    if (images.length > 0) {
      await processFiles(images, [], false);
    }

    if (pdfs.length > 0) {
      setPdfExpanding(true);
      try {
        for (const pdf of pdfs) {
          const converted = await pdfToImageFiles(pdf);
          if (converted.length === 0) {
            setPdfError('El PDF no pudo convertirse. Prueba a exportarlo de nuevo o sube una imagen directamente.');
          } else {
            const storedPdf = await createStoredDocumentFile(pdf);
            await processFiles(converted, [storedPdf], true);
          }
        }
      } catch (err) {
        const message = err instanceof Error && err.message
          ? err.message
          : 'No se pudo leer el PDF. Comprueba que no esté protegido con contraseña y vuelve a intentarlo.';
        setPdfError(message);
      } finally {
        setPdfExpanding(false);
      }
    }
  }, [processFiles]);

  return (
    <div className={`rounded-2xl border-2 transition-colors ${hasPages ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-4`}>
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-eltex-blue" />
        <p className="font-semibold text-gray-900">Factura de luz</p>
        {hasPages && (
          <span className="ml-auto bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {pages.length} {pages.length === 1 ? 'imagen' : 'imágenes'}
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Sube las páginas de tu factura de luz como imágenes o en PDF — puedes seleccionar varios archivos a la vez.
      </p>

      {originalPdfs.length > 0 && (
        <p className="text-xs text-gray-500">
          PDF original guardado: {originalPdfs.length} archivo{originalPdfs.length !== 1 ? 's' : ''}.
        </p>
      )}

      {issue?.message && !isBusy && (
        <PersistentIssueNotice
          message={issue.message}
          tone={hasPages ? 'amber' : 'red'}
        />
      )}

      {/* Uploaded pages grid */}
      {hasPages && (
        <div className="grid grid-cols-2 gap-3">
          {pages.map((page, index) => {
            const pageData = page.extraction?.extractedData || {};
            const keyFields = ELECTRICITY_FIELDS.filter(f => pageData[f.key]);
            return (
              <div key={index} className="rounded-xl border border-green-200 bg-white overflow-hidden">
                {page.photo?.preview && (
                  <div className="relative">
                    <img src={page.photo.preview} alt={`Página ${index + 1}`} className="w-full h-24 object-cover" />
                    <button
                      type="button"
                      onClick={() => onRemovePage(index)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <span className="absolute bottom-1.5 left-1.5 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">Pág. {index + 1}</span>
                  </div>
                )}
                {keyFields.length > 0 && (
                  <div className="px-2 py-2 space-y-0.5">
                    {keyFields.slice(0, 4).map(({ key, label }) => (
                      <div key={key} className="flex gap-1 text-[10px]">
                        <span className="text-gray-400 shrink-0">{label}:</span>
                        <span className="font-medium text-gray-700 truncate">{String(pageData[key])}</span>
                      </div>
                    ))}
                    {keyFields.length > 4 && <p className="text-[10px] text-gray-400">+{keyFields.length - 4} más</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending items (parallel) */}
      {pendingItems.map(item => (
        <div key={item.id}>
          {item.status === 'failed' && item.reason === 'blurry' ? (
            <div className="relative">
              <BlurWarningCard
                preview={item.preview}
                onRetry={() => dismissError(item.id)}
                onForce={() => { dismissError(item.id); processFiles([item.file], [], true); }}
              />
              <button
                type="button"
                onClick={() => dismissError(item.id)}
                className="absolute top-2 right-2 text-amber-600 hover:text-amber-800 bg-white/70 rounded-full p-0.5"
                aria-label="Descartar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : item.status === 'failed' ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 space-y-2">
              {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-20 object-cover rounded-lg opacity-70" />}
              <div className="space-y-2">
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 flex-1">{item.error}</p>
                  <button type="button" onClick={() => dismissError(item.id)} className="text-red-400 hover:text-red-600 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => { dismissError(item.id); processFiles([item.file]); }}
                  className="w-full text-xs text-eltex-blue hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg py-1.5 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 space-y-2">
              {item.preview && <img src={item.preview} alt="Procesando" className="w-full h-20 object-cover rounded-lg opacity-70" />}
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
                <p className="text-sm text-gray-500">
                  {item.status === 'validating' ? 'Verificando calidad...' : 'Extrayendo datos...'}
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* PDF expanding indicator */}
      {pdfExpanding && (
        <div className="flex items-center gap-3 py-3 px-4 bg-blue-50 border border-eltex-blue/20 rounded-xl">
          <FileText className="w-5 h-5 text-eltex-blue shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-eltex-blue">Convirtiendo PDF en páginas...</p>
            <p className="text-xs text-blue-400">Esto puede tardar unos segundos</p>
          </div>
          <Loader2 className="w-4 h-4 text-eltex-blue animate-spin shrink-0" />
        </div>
      )}

      {/* PDF conversion error */}
      {pdfError && !pdfExpanding && (
        <div className="flex items-start gap-3 py-3 px-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">Error al procesar el PDF</p>
            <p className="text-xs text-red-500 mt-0.5">{pdfError}</p>
          </div>
          <button type="button" onClick={() => setPdfError(null)} className="shrink-0 text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add images/PDF button */}
      {!isBusy && (
        <label className={`flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          hasPages
            ? 'border-eltex-blue/40 hover:border-eltex-blue hover:bg-blue-50/40 text-eltex-blue'
            : 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50/30 text-gray-500'
        }`}>
          <input
            type="file"
            data-testid="electricity-input"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              e.target.value = '';
              if (files.length) handleFileSelect(files);
            }}
          />
          <Plus className="w-5 h-5" />
          <span className="text-sm font-medium">{hasPages ? 'Añadir más páginas o PDF' : 'Añadir imágenes o PDF'}</span>
        </label>
      )}
    </div>
  );
}

// ── Main Section ───────────────────────────────────────────────────────────────
export function PropertyDocsSection({
  dni,
  ibi,
  electricityBill,
  additionalBankDocuments,
  followUpMode = false,
  errors,
  documentProcessing,
  hasBlockingDocumentProcessing,
  onDNIFrontPhotoChange,
  onDNIFrontExtractionChange,
  onDNIBackPhotoChange,
  onDNIBackExtractionChange,
  onDNIIssueChange,
  onDNIOriginalPdfsMerge,
  onIBIDocumentChange,
  onIBIIssueChange,
  onAddElectricityPages,
  onRemoveElectricityPage,
  onElectricityIssueChange,
  onAddAdditionalBankDocuments,
  onReplaceAdditionalBankDocument,
  onRemoveAdditionalBankDocument,
  onDocumentProcessingChange,
  scrollToDoc,
  onBack,
  onContinue,
}: Props) {
  const [dniIsBusy, setDniIsBusy] = useState(false);
  const [electricityIsBusy, setElectricityIsBusy] = useState(false);
  const [additionalDocumentsBusy, setAdditionalDocumentsBusy] = useState(false);

  // Refs for each doc card so we can scroll to the right one when arriving from review
  const dniRef = useRef<HTMLDivElement>(null);
  const ibiRef = useRef<HTMLDivElement>(null);
  const electricityRef = useRef<HTMLDivElement>(null);

  // Frictionless resume: detect which docs were already done on first mount
  const [resumeSnapshot] = useState(() => ({
    dni: isIdentityDocumentComplete(dni),
    ibi: !!ibi.photo,
    electricity: electricityBill.pages.length > 0,
  }));
  const isResuming = resumeSnapshot.dni || resumeSnapshot.ibi || resumeSnapshot.electricity;

  // Track which compact rows have been expanded by the user
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // If arriving from review with a specific doc target, pre-expand it so the
    // card is already rendered at full height before we scroll to it.
    if (!scrollToDoc) return {};
    return { [scrollToDoc]: true };
  });
  const expand = (key: string) => setExpanded(prev => ({ ...prev, [key]: true }));

  // On mount: scroll to the specific doc card requested by the review screen.
  useEffect(() => {
    if (!scrollToDoc) return;
    const refMap: Record<string, RefObject<HTMLDivElement | null>> = {
      dni: dniRef,
      ibi: ibiRef,
      electricity: electricityRef,
    };
    const target = refMap[scrollToDoc];
    if (!target) return;
    const id = setTimeout(() => {
      if (!target.current) return;
      const top = target.current.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    }, 250);
    return () => clearTimeout(id);
  // Intentionally only on mount — scrollToDoc won't change while section is active
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAnyBusy = hasBlockingDocumentProcessing || dniIsBusy || electricityIsBusy || additionalDocumentsBusy;

  // Validation warnings (only shown when at least one doc exists)
  const hasAnyDoc = !!(dni.front.photo || ibi.photo || electricityBill.pages.length > 0);
  const validationWarnings = hasAnyDoc ? computeValidationWarnings(dni, electricityBill) : [];

  // Whether each card should show compact
  const dniDone = isIdentityDocumentComplete(dni);
  const ibiDone = !!ibi.photo;
  const elecDone = electricityBill.pages.length > 0;

  const showDniCompact = isResuming && dniDone && !expanded.dni;
  const showIbiCompact = isResuming && ibiDone && !expanded.ibi;
  const showElecCompact = isResuming && elecDone && !expanded.electricity;

  // Summary subtitle for compact rows
  const dniSubtitle = dni.front.extraction?.extractedData?.fullName ?? undefined;
  const ibiSubtitle = ibi.extraction?.extractedData?.referenciaCatastral ?? ibi.extraction?.extractedData?.titular ?? undefined;
  const elecSubtitle = electricityBill.pages[0]?.extraction?.extractedData?.cups
    ?? electricityBill.pages[0]?.extraction?.extractedData?.titular
    ?? `${electricityBill.pages.length} imagen${electricityBill.pages.length !== 1 ? 'es' : ''}`;

  const { missingCount, slots } = getPropertyDocsProgress({
    dniDone,
    ibiDone,
    electricityDone: elecDone,
  });

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 px-5 pt-5 pb-28 max-w-sm mx-auto w-full space-y-5">
        <div className="pt-2 pb-2">
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-gray-400 text-sm mt-1">
            {followUpMode
              ? 'Sube solo la documentación pendiente y confirma cuando termines.'
              : isResuming && missingCount > 0
              ? `Falta${missingCount > 1 ? 'n' : ''} ${missingCount} documento${missingCount > 1 ? 's' : ''} por completar.`
              : 'Sube cada documento con buena luz. Los documentos adicionales se guardan tal cual para ir más rápido.'}
          </p>
        </div>

        {/* Progress strip — shows the initial required documents above the fold */}
        <DocProgressStrip slots={slots} />

        {/* DNI card or compact row */}
        <div ref={dniRef}>
          {showDniCompact ? (
            <CompactRow
              icon={<CreditCard className="w-3.5 h-3.5" />}
              title="DNI / NIE"
              subtitle={dniSubtitle}
              onExpand={() => expand('dni')}
            />
          ) : (
            <DNICard
              front={dni.front}
              back={dni.back}
              originalPdfs={dni.originalPdfs}
              issue={dni.issue ?? null}
              onFrontPhotoChange={onDNIFrontPhotoChange}
              onFrontExtractionChange={onDNIFrontExtractionChange}
              onBackPhotoChange={onDNIBackPhotoChange}
              onBackExtractionChange={onDNIBackExtractionChange}
              onIssueChange={onDNIIssueChange}
              onOriginalPdfsMerge={onDNIOriginalPdfsMerge}
              onBusyChange={setDniIsBusy}
            />
          )}
        </div>

        {/* IBI card or compact row */}
        <div ref={ibiRef}>
          {showIbiCompact ? (
            <CompactRow
              icon={<Camera className="w-3.5 h-3.5" />}
              title="IBI o escritura"
              subtitle={ibiSubtitle}
              onExpand={() => expand('ibi')}
            />
          ) : (
            <DocCard
              title="IBI o escritura"
              hint="Recibo del Impuesto de Bienes Inmuebles. La Referencia Catastral debe ser legible."
              data={ibi}
              slotKey="ibi"
              processing={documentProcessing.ibi}
              onDocumentChange={onIBIDocumentChange}
              onIssueChange={onIBIIssueChange}
              onProcessingChange={onDocumentProcessingChange}
            />
          )}
        </div>

        {/* Electricity card or compact row */}
        <div ref={electricityRef}>
          {showElecCompact ? (
            <CompactRow
              icon={<Zap className="w-3.5 h-3.5" />}
              title="Factura de luz"
              subtitle={elecSubtitle}
              onExpand={() => expand('electricity')}
            />
          ) : (
            <ElectricityCard
              pages={electricityBill.pages}
              originalPdfs={electricityBill.originalPdfs}
              issue={electricityBill.issue ?? null}
              onAddPages={onAddElectricityPages}
              onRemovePage={onRemoveElectricityPage}
              onIssueChange={onElectricityIssueChange}
              onBusyChange={setElectricityIsBusy}
            />
          )}
        </div>

        {/* Cross-document validation warnings */}
        {validationWarnings.map((warning, i) => (
          <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">{warning}</p>
          </div>
        ))}

        <AdditionalBankDocumentsCard
          documents={additionalBankDocuments}
          onAddDocuments={onAddAdditionalBankDocuments}
          onRemoveDocument={onRemoveAdditionalBankDocument}
          onReplaceDocument={onReplaceAdditionalBankDocument}
          onBusyChange={setAdditionalDocumentsBusy}
        />

        <p className="text-xs text-gray-400 text-center pt-1">
          {followUpMode
            ? 'Puedes confirmar lo que hayas subido, pero no mientras haya una carga o verificación en curso.'
            : 'Puedes continuar sin tenerlos todos, pero no mientras haya una carga o verificación en curso.'}
        </p>

        {errors['propertyDocs.blocking'] && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">{errors['propertyDocs.blocking']}</p>
          </div>
        )}

      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-100 px-4 py-3 safe-area-bottom sm:static sm:border-0 sm:bg-transparent sm:px-5 sm:pb-5">
        <div className="max-w-sm mx-auto flex gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl transition-all hover:bg-gray-50 active:scale-[0.97]">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            data-testid="property-docs-continue-btn"
            onClick={onContinue}
            disabled={isAnyBusy}
            className="btn-primary flex-1 inline-flex items-center justify-center gap-2 py-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {followUpMode ? 'Revisar y confirmar' : 'Continuar'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
