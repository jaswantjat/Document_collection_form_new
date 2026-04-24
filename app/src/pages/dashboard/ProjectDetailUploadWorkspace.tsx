import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertTriangle, CheckCircle, FileText, Loader2, Upload } from 'lucide-react';
import { adminUpdateFormData, extractDocument, extractDocumentBatch } from '@/services/api';
import { buildDashboardAdditionalBankDocumentPatch } from '@/lib/dashboardAdditionalBankDocuments';
import { mergeStoredDocumentFiles } from '@/lib/photoValidation';
import { type PreparedAdminPage, prepareAdminUploadPages } from '@/lib/dashboardHelpers';
import type { AIExtraction, FormData as AppFormData } from '@/types';

export type AdminDocType =
  | 'dni-front'
  | 'dni-back'
  | 'ibi'
  | 'electricity-bill'
  | 'additional-bank-document';

interface UploadTarget {
  key: AdminDocType;
  label: string;
  helper: string;
}

const UPLOAD_TARGETS: UploadTarget[] = [
  {
    key: 'dni-front',
    label: 'DNI frontal',
    helper: 'Foto o PDF de la cara frontal',
  },
  {
    key: 'dni-back',
    label: 'DNI trasera',
    helper: 'Foto o PDF de la cara trasera',
  },
  {
    key: 'ibi',
    label: 'IBI / Escritura',
    helper: 'Una o varias paginas del documento',
  },
  {
    key: 'electricity-bill',
    label: 'Factura de luz',
    helper: 'Una o varias paginas de la factura',
  },
  {
    key: 'additional-bank-document',
    label: 'Documento adicional',
    helper: 'Se guarda sin clasificacion IA',
  },
];

type UploadStatus = 'idle' | 'extracting' | 'uploading' | 'done' | 'error';
type ProjectDetail = {
  code: string;
  formData?: AppFormData | null;
};
type OriginalPdfs = Awaited<ReturnType<typeof prepareAdminUploadPages>>['originalPdfs'];
type SetUploadStatus = (status: UploadStatus) => void;
type SetStatusMessage = (message: string) => void;

const docTypeMap: Record<AdminDocType, Parameters<typeof extractDocument>[1]> = {
  'dni-front': 'dniFront',
  'dni-back': 'dniBack',
  ibi: 'ibi',
  'electricity-bill': 'electricity',
  'additional-bank-document': 'other',
};

function makePhoto(target: AdminDocType, page: PreparedAdminPage, index = 0) {
  return {
    id: `admin-${target}-${Date.now()}-${index}`,
    preview: page.preview,
    timestamp: Date.now(),
    sizeBytes: page.sizeBytes,
  };
}

function buildDniPatch(
  project: ProjectDetail,
  target: Extract<AdminDocType, 'dni-front' | 'dni-back'>,
  page: PreparedAdminPage,
  originalPdfs: OriginalPdfs,
  extraction: AIExtraction
) {
  const side = target === 'dni-front' ? 'front' : 'back';
  return {
    dni: {
      [side]: { photo: makePhoto(target, page), extraction },
      ...(originalPdfs.length > 0
        ? { originalPdfs: mergeStoredDocumentFiles(project.formData?.dni?.originalPdfs, originalPdfs) }
        : {}),
    },
  };
}

function buildIbiPatch(
  target: AdminDocType,
  pages: PreparedAdminPage[],
  originalPdfs: OriginalPdfs,
  extraction: AIExtraction
) {
  const storedPages = pages.map((page, index) => makePhoto(target, page, index));
  return {
    ibi: {
      photo: storedPages[0],
      pages: storedPages,
      originalPdfs,
      extraction,
    },
  };
}

function buildElectricityPatch(
  project: ProjectDetail,
  target: AdminDocType,
  pages: PreparedAdminPage[],
  originalPdfs: OriginalPdfs,
  extraction: AIExtraction
) {
  const existingPages = project.formData?.electricityBill?.pages ?? [];
  return {
    electricityBill: {
      pages: [
        ...existingPages,
        ...pages.map((page, index) => ({
          photo: makePhoto(target, page, index),
          extraction,
        })),
      ],
      originalPdfs: mergeStoredDocumentFiles(
        project.formData?.electricityBill?.originalPdfs,
        originalPdfs
      ),
    },
  };
}

function buildStructuredPatch(
  project: ProjectDetail,
  target: AdminDocType,
  pages: PreparedAdminPage[],
  originalPdfs: OriginalPdfs,
  extraction: AIExtraction
) {
  if (target === 'dni-front' || target === 'dni-back') {
    return buildDniPatch(project, target, pages[0], originalPdfs, extraction);
  }
  if (target === 'ibi') {
    return buildIbiPatch(target, pages, originalPdfs, extraction);
  }
  return buildElectricityPatch(project, target, pages, originalPdfs, extraction);
}

function getPreparingMessage(files: File[]) {
  if (files.some((file) => file.type === 'application/pdf')) {
    return 'Convirtiendo PDF en imagenes...';
  }
  return files.length > 1 ? 'Preparando imagenes...' : 'Preparando imagen...';
}

async function finishUpload({
  message,
  onRefresh,
  setStatus,
  setStatusMsg,
}: {
  message: string;
  onRefresh: () => Promise<void> | void;
  setStatus: SetUploadStatus;
  setStatusMsg: SetStatusMessage;
}) {
  await onRefresh();
  setStatus('done');
  setStatusMsg(message);
}

async function saveAdditionalDocument({
  project,
  token,
  onRefresh,
  files,
  setStatus,
  setStatusMsg,
}: {
  project: ProjectDetail;
  token: string;
  onRefresh: () => Promise<void> | void;
  files: File[];
  setStatus: SetUploadStatus;
  setStatusMsg: SetStatusMessage;
}) {
  setStatus('uploading');
  setStatusMsg(files.length > 1 ? 'Guardando documentos adicionales...' : 'Guardando documento adicional...');
  const patch = await buildDashboardAdditionalBankDocumentPatch(
    project.formData?.additionalBankDocuments,
    files
  );
  const saveRes = await adminUpdateFormData(project.code, patch, token);
  if (!saveRes.success) throw new Error(saveRes.message || 'Error al guardar.');
  await finishUpload({
    message: files.length > 1
      ? 'Documentos adicionales guardados correctamente.'
      : 'Documento adicional guardado correctamente.',
    onRefresh,
    setStatus,
    setStatusMsg,
  });
}

async function saveStructuredDocument({
  project,
  token,
  onRefresh,
  target,
  files,
  setStatus,
  setStatusMsg,
}: {
  project: ProjectDetail;
  token: string;
  onRefresh: () => Promise<void> | void;
  target: AdminDocType;
  files: File[];
  setStatus: SetUploadStatus;
  setStatusMsg: SetStatusMessage;
}) {
  setStatus('extracting');
  setStatusMsg(getPreparingMessage(files));
  const { pages, originalPdfs } = await prepareAdminUploadPages(files);
  setStatusMsg('Extrayendo datos con IA...');
  const extractionRes = target === 'electricity-bill'
    ? await extractDocumentBatch(pages.map((page) => page.aiDataUrl), 'electricity')
    : await extractDocument(pages.length === 1 ? pages[0].aiDataUrl : pages.map((page) => page.aiDataUrl), docTypeMap[target]);
  if (!extractionRes.success || !extractionRes.extraction) {
    throw new Error(extractionRes.message || 'No se pudo extraer el documento.');
  }
  const extraction: AIExtraction = {
    ...extractionRes.extraction,
    needsManualReview: extractionRes.needsManualReview
      ?? extractionRes.extraction.needsManualReview
      ?? false,
    confirmedByUser: true,
  };
  setStatus('uploading');
  setStatusMsg('Guardando en el expediente...');
  const patch = buildStructuredPatch(project, target, pages, originalPdfs, extraction);
  const saveRes = await adminUpdateFormData(project.code, patch, token);
  if (!saveRes.success) throw new Error(saveRes.message || 'Error al guardar.');
  await finishUpload({ message: 'Documento guardado correctamente.', onRefresh, setStatus, setStatusMsg });
}

function useProjectDetailUploader({
  project,
  token,
  onRefresh,
}: {
  project: ProjectDetail;
  token: string;
  onRefresh: () => Promise<void> | void;
}) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [activeTarget, setActiveTarget] = useState<AdminDocType | null>(null);
  const [dragTarget, setDragTarget] = useState<AdminDocType | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const isBusy = status === 'extracting' || status === 'uploading';

  const resetInput = (target: AdminDocType) => {
    const input = inputRefs.current[target];
    if (input) input.value = '';
  };
  const setInputRef = (target: AdminDocType, node: HTMLInputElement | null) => {
    inputRefs.current[target] = node;
  };

  const handleFiles = async (target: AdminDocType, files: File[]) => {
    if (!files.length || isBusy) return;
    setActiveTarget(target);
    setStatus('idle');
    setStatusMsg('');
    try {
      if (target === 'additional-bank-document') {
        await saveAdditionalDocument({ project, token, onRefresh, files, setStatus, setStatusMsg });
      } else {
        await saveStructuredDocument({ project, token, onRefresh, target, files, setStatus, setStatusMsg });
      }
    } catch (err) {
      console.error('Admin upload failed:', err);
      setStatus('error');
      setStatusMsg(err instanceof Error ? err.message : 'Error inesperado. Intentalo de nuevo.');
    } finally {
      resetInput(target);
    }
  };

  return {
    activeTarget,
    dragTarget,
    isBusy,
    setDragTarget,
    setInputRef,
    status,
    statusMsg,
    handleFiles,
  };
}

function UploadStatusMessage({
  status,
  message,
}: {
  status: UploadStatus;
  message: string;
}) {
  return (
    <span className={`mt-auto flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs ${
      status === 'done'
        ? 'bg-emerald-50 text-emerald-800'
        : status === 'error'
          ? 'bg-red-50 text-red-800'
          : 'bg-blue-50 text-blue-800'
    }`}>
      {status === 'done' && <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {status === 'error' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {(status === 'extracting' || status === 'uploading') && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}
      <span>{message}</span>
    </span>
  );
}

function UploadZone({
  target,
  activeTarget,
  dragTarget,
  isBusy,
  status,
  statusMsg,
  setDragTarget,
  setInputRef,
  handleFiles,
}: {
  target: UploadTarget;
  activeTarget: AdminDocType | null;
  dragTarget: AdminDocType | null;
  isBusy: boolean;
  status: UploadStatus;
  statusMsg: string;
  setDragTarget: (target: AdminDocType | null) => void;
  setInputRef: (target: AdminDocType, node: HTMLInputElement | null) => void;
  handleFiles: (target: AdminDocType, files: File[]) => Promise<void>;
}) {
  const handleInput = (target: AdminDocType, event: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(target, Array.from(event.target.files || []));
  };

  const handleDrop = (target: AdminDocType, event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragTarget(null);
    void handleFiles(target, Array.from(event.dataTransfer.files || []));
  };
  const isActive = activeTarget === target.key;
  const showStatus = isActive && status !== 'idle';
  const isDragging = dragTarget === target.key;

  return (
    <label
      data-testid={`detail-upload-zone-${target.key}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isBusy) setDragTarget(target.key);
      }}
      onDragLeave={() => setDragTarget(null)}
      onDrop={(event) => handleDrop(target.key, event)}
      className={`min-h-[132px] rounded-lg border-2 border-dashed bg-white p-3 transition-colors ${
        isDragging ? 'border-eltex-blue bg-blue-50' : 'border-gray-200 hover:border-eltex-blue hover:bg-blue-50'
      } ${isBusy && !isActive ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span className="flex h-full flex-col gap-2">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-eltex-blue-light">
            {target.key === 'additional-bank-document'
              ? <FileText className="h-4 w-4 text-eltex-blue" />
              : <Upload className="h-4 w-4 text-eltex-blue" />}
          </span>
          <span className="text-sm font-semibold text-gray-900">{target.label}</span>
        </span>
        <span className="text-xs leading-5 text-gray-500">{target.helper}</span>
        {showStatus && <UploadStatusMessage status={status} message={statusMsg} />}
      </span>
      <input
        ref={(node) => setInputRef(target.key, node)}
        data-testid={`detail-upload-input-${target.key}`}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        multiple
        disabled={isBusy}
        className="hidden"
        onChange={(event) => handleInput(target.key, event)}
      />
    </label>
  );
}

export function ProjectDetailUploadWorkspace(props: {
  project: ProjectDetail;
  token: string;
  onRefresh: () => Promise<void> | void;
}) {
  const uploader = useProjectDetailUploader(props);

  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4" data-testid="detail-upload-workspace">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Subir documentos</p>
          <p className="text-xs text-gray-500">Arrastra archivos o elige un documento desde el detalle del expediente.</p>
        </div>
        {uploader.isBusy && <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-eltex-blue" />}
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {UPLOAD_TARGETS.map((target) => (
          <UploadZone
            key={target.key}
            target={target}
            activeTarget={uploader.activeTarget}
            dragTarget={uploader.dragTarget}
            isBusy={uploader.isBusy}
            status={uploader.status}
            statusMsg={uploader.statusMsg}
            setDragTarget={uploader.setDragTarget}
            setInputRef={uploader.setInputRef}
            handleFiles={uploader.handleFiles}
          />
        ))}
      </div>
    </section>
  );
}
