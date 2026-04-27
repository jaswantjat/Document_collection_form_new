import { useEffect, useRef, useState, type RefObject } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Camera, CreditCard, Zap } from 'lucide-react';
import {
  getPropertyDocsProgress,
  isElectricityRequired,
} from '@/lib/propertyDocsProgress';
import { isIdentityDocumentComplete } from '@/lib/identityDocument';
import { AdditionalBankDocumentsCard } from '@/sections/property-docs/AdditionalBankDocumentsCard';
import { DNICard } from '@/sections/property-docs/DNICard';
import { ElectricityCard } from '@/sections/property-docs/ElectricityCard';
import { IBIDocCard } from '@/sections/property-docs/IBIDocCard';
import {
  CompactRow,
  DocProgressStrip,
} from '@/sections/property-docs/shared';
import { computeValidationWarnings } from '@/sections/property-docs/utils';
import type {
  AdditionalBankDocumentEntry,
  DocumentProcessingState,
  DocumentSlotKey,
  ElectricityBillData,
  FormErrors,
  IBIData,
  DNIData,
  AIExtraction,
  UploadedPhoto,
  StoredDocumentFile,
  ProductType,
} from '@/types';

interface Props {
  productType: ProductType;
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
  onIBIDocumentChange: (
    pages: UploadedPhoto[],
    extraction: AIExtraction | null,
    originalPdfs: StoredDocumentFile[]
  ) => void;
  onIBIIssueChange: (issue: IBIData['issue']) => void;
  onAddElectricityPages: (
    photos: UploadedPhoto[],
    extraction: AIExtraction | null,
    originalPdfs: StoredDocumentFile[]
  ) => void;
  onRemoveElectricityPage: (index: number) => void;
  onElectricityIssueChange: (issue: ElectricityBillData['issue']) => void;
  onAddAdditionalBankDocuments: (entries: AdditionalBankDocumentEntry[]) => void;
  onReplaceAdditionalBankDocument: (
    entryId: string,
    replacement: AdditionalBankDocumentEntry
  ) => void;
  onRemoveAdditionalBankDocument: (entryId: string) => void;
  onDocumentProcessingChange: (
    slot: DocumentSlotKey,
    state: DocumentProcessingState
  ) => void;
  scrollToDoc?: string;
  onBack?: () => void;
  onContinue: () => void;
}

function useResumeSnapshot(dni: DNIData, ibi: IBIData, electricityBill: ElectricityBillData) {
  return useState(() => ({
    dni: isIdentityDocumentComplete(dni),
    ibi: !!ibi.photo || ibi.pages.length > 0,
    electricity: electricityBill.pages.length > 0,
  }))[0];
}

export function PropertyDocsSection({
  productType,
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => (
    scrollToDoc ? { [scrollToDoc]: true } : {}
  ));

  const dniRef = useRef<HTMLDivElement>(null);
  const ibiRef = useRef<HTMLDivElement>(null);
  const electricityRef = useRef<HTMLDivElement>(null);

  const resumeSnapshot = useResumeSnapshot(dni, ibi, electricityBill);
  const isResuming = resumeSnapshot.dni || resumeSnapshot.ibi || resumeSnapshot.electricity;
  const isAnyBusy =
    hasBlockingDocumentProcessing
    || dniIsBusy
    || electricityIsBusy
    || additionalDocumentsBusy;

  const hasAnyDoc = !!(dni.front.photo || ibi.photo || electricityBill.pages.length > 0);
  const validationWarnings = hasAnyDoc ? computeValidationWarnings(dni, electricityBill) : [];

  const dniDone = isIdentityDocumentComplete(dni);
  const ibiDone = !!ibi.photo || ibi.pages.length > 0;
  const electricityDone = electricityBill.pages.length > 0;
  const electricityRequired = isElectricityRequired(productType);

  const dniSubtitle = dni.front.extraction?.extractedData?.fullName ?? undefined;
  const ibiSubtitle =
    ibi.extraction?.extractedData?.referenciaCatastral
    ?? ibi.extraction?.extractedData?.titular
    ?? undefined;
  const electricitySubtitle =
    electricityBill.pages[0]?.extraction?.extractedData?.cups
    ?? electricityBill.pages[0]?.extraction?.extractedData?.titular
    ?? `${electricityBill.pages.length} imagen${electricityBill.pages.length !== 1 ? 'es' : ''}`;

  const { missingCount, slots } = getPropertyDocsProgress({
    productType,
    dniDone,
    ibiDone,
    electricityDone,
  });

  const expand = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: true }));
  };

  useEffect(() => {
    if (!scrollToDoc) return;
    const refMap: Record<string, RefObject<HTMLDivElement | null>> = {
      dni: dniRef,
      ibi: ibiRef,
      electricity: electricityRef,
    };
    const target = refMap[scrollToDoc];
    if (!target) return;

    const timeoutId = setTimeout(() => {
      if (!target.current) return;
      const top = target.current.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [scrollToDoc]);

  const showDniCompact = isResuming && dniDone && !expanded.dni;
  const showIbiCompact = isResuming && ibiDone && !expanded.ibi;
  const showElectricityCompact = isResuming && electricityDone && !expanded.electricity;

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

        <DocProgressStrip slots={slots} />

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

        <div ref={ibiRef}>
          {showIbiCompact ? (
            <CompactRow
              icon={<Camera className="w-3.5 h-3.5" />}
              title="IBI o escritura"
              subtitle={ibiSubtitle}
              onExpand={() => expand('ibi')}
            />
          ) : (
            <IBIDocCard
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

        {(electricityRequired || electricityDone) && (
          <div ref={electricityRef}>
            {showElectricityCompact ? (
              <CompactRow
                icon={<Zap className="w-3.5 h-3.5" />}
                title="Factura de luz"
                subtitle={electricitySubtitle}
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
        )}

        {validationWarnings.map((warning) => (
          <div key={warning} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
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
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl transition-all hover:bg-gray-50 active:scale-[0.97]"
            >
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
