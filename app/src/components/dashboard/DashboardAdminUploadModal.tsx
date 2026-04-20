import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {
  adminUpdateFormData,
  extractDocument,
  extractDocumentBatch,
  type DashboardProjectRecord,
} from '@/services/api';
import { buildDashboardAdditionalBankDocumentPatch } from '@/lib/dashboardAdditionalBankDocuments';
import {
  prepareAdminUploadPages,
  type PreparedAdminPage,
} from '@/lib/dashboardHelpers';
import { mergeStoredDocumentFiles } from '@/lib/photoValidation';
import type { StoredDocumentFile, UploadedPhoto } from '@/types';
import type { LoadProjectDetail } from './DashboardDocumentActions';

type AdminDocType =
  | 'dni-front'
  | 'dni-back'
  | 'ibi'
  | 'electricity-bill'
  | 'additional-bank-document';

const ADMIN_DOC_TABS: { key: AdminDocType; label: string }[] = [
  { key: 'dni-front', label: 'DNI frontal' },
  { key: 'dni-back', label: 'DNI trasera' },
  { key: 'ibi', label: 'IBI / Escritura' },
  { key: 'electricity-bill', label: 'Factura luz' },
  { key: 'additional-bank-document', label: 'Documento adicional' },
];

function buildAdminPhoto(
  activeTab: AdminDocType,
  page: PreparedAdminPage,
  index = 0
): UploadedPhoto {
  return {
    id: `admin-${activeTab}-${Date.now()}-${index}`,
    preview: page.preview,
    timestamp: Date.now(),
    sizeBytes: page.sizeBytes,
  };
}

function buildRegularDocumentPatch({
  activeTab,
  extraction,
  originalPdfs,
  preparedPages,
  project,
}: {
  activeTab: Exclude<AdminDocType, 'additional-bank-document'>;
  extraction: Awaited<ReturnType<typeof extractDocument>>['extraction'];
  originalPdfs: StoredDocumentFile[];
  preparedPages: PreparedAdminPage[];
  project: DashboardProjectRecord;
}) {
  if (activeTab === 'dni-front') {
    return {
      dni: {
        front: { photo: buildAdminPhoto(activeTab, preparedPages[0]), extraction },
        ...(originalPdfs.length > 0
          ? {
              originalPdfs: mergeStoredDocumentFiles(
                project.formData?.dni?.originalPdfs,
                originalPdfs
              ),
            }
          : {}),
      },
    };
  }

  if (activeTab === 'dni-back') {
    return {
      dni: {
        back: { photo: buildAdminPhoto(activeTab, preparedPages[0]), extraction },
        ...(originalPdfs.length > 0
          ? {
              originalPdfs: mergeStoredDocumentFiles(
                project.formData?.dni?.originalPdfs,
                originalPdfs
              ),
            }
          : {}),
      },
    };
  }

  if (activeTab === 'ibi') {
    const storedPages = preparedPages.map((page, index) =>
      buildAdminPhoto(activeTab, page, index)
    );
    return {
      ibi: {
        photo: storedPages[0],
        pages: storedPages,
        originalPdfs,
        extraction,
      },
    };
  }

  const existingPages = project.formData?.electricityBill?.pages ?? [];
  return {
    electricityBill: {
      pages: [
        ...existingPages,
        ...preparedPages.map((page, index) => ({
          photo: buildAdminPhoto(activeTab, page, index),
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

async function extractAdminDocument(
  activeTab: Exclude<AdminDocType, 'additional-bank-document'>,
  preparedPages: PreparedAdminPage[]
) {
  const docTypeMap: Record<
    Exclude<AdminDocType, 'additional-bank-document'>,
    Parameters<typeof extractDocument>[1]
  > = {
    'dni-front': 'dniFront',
    'dni-back': 'dniBack',
    ibi: 'ibi',
    'electricity-bill': 'electricity',
  };

  const extractionResponse =
    activeTab === 'electricity-bill'
      ? await extractDocumentBatch(
          preparedPages.map((page) => page.aiDataUrl),
          'electricity'
        )
      : await extractDocument(
          preparedPages.length === 1
            ? preparedPages[0].aiDataUrl
            : preparedPages.map((page) => page.aiDataUrl),
          docTypeMap[activeTab]
        );

  if (!extractionResponse.success || !extractionResponse.extraction) {
    return extractionResponse;
  }

  return {
    ...extractionResponse,
    extraction: {
      ...extractionResponse.extraction,
      needsManualReview:
        extractionResponse.needsManualReview
        ?? extractionResponse.extraction.needsManualReview
        ?? false,
      confirmedByUser: true,
    },
  };
}

export function DashboardAdminUploadModal({
  projectCode,
  token,
  loadProjectDetail,
  onClose,
  onRefresh,
}: {
  projectCode: string;
  token: string;
  loadProjectDetail: LoadProjectDetail;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [activeTab, setActiveTab] = useState<AdminDocType>('dni-front');
  const [status, setStatus] = useState<
    'idle' | 'extracting' | 'uploading' | 'done' | 'error'
  >('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [project, setProject] = useState<DashboardProjectRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const isBusy = status === 'extracting' || status === 'uploading';

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setDetailLoading(true);
      setDetailError('');
      try {
        const detail = await loadProjectDetail(projectCode);
        if (!cancelled) {
          setProject(detail);
        }
      } catch (err) {
        console.error('Dashboard detail load failed:', err);
        if (!cancelled) {
          setDetailError('No se pudo cargar el expediente.');
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadProjectDetail, projectCode]);

  const reset = () => {
    setStatus('idle');
    setStatusMsg('');
    if (fileRef.current) {
      fileRef.current.value = '';
    }
  };

  const handleFiles = async (files: File[]) => {
    if (!project) {
      setStatus('error');
      setStatusMsg('No se pudo cargar el expediente.');
      return;
    }

    try {
      if (activeTab === 'additional-bank-document') {
        setStatus('uploading');
        setStatusMsg(
          files.length > 1
            ? 'Guardando documentos adicionales...'
            : 'Guardando documento adicional...'
        );

        const formDataPatch = await buildDashboardAdditionalBankDocumentPatch(
          project.formData?.additionalBankDocuments,
          files
        );
        const saveRes = await adminUpdateFormData(project.code, formDataPatch, token);

        if (!saveRes.success) {
          setStatus('error');
          setStatusMsg(saveRes.message || 'Error al guardar.');
          return;
        }

        await onRefresh();
        setProject(await loadProjectDetail(project.code));
        setStatus('done');
        setStatusMsg(
          files.length > 1
            ? 'Documentos adicionales guardados correctamente.'
            : 'Documento adicional guardado correctamente.'
        );
        return;
      }

      const hasPdf = files.some((file) => file.type === 'application/pdf');
      setStatus('extracting');
      setStatusMsg(
        hasPdf
          ? 'Convirtiendo PDF en imágenes...'
          : files.length > 1
            ? 'Preparando imágenes...'
            : 'Preparando imagen...'
      );

      const { pages: preparedPages, originalPdfs } = await prepareAdminUploadPages(files);
      setStatusMsg('Extrayendo datos con IA...');

      const extracted = await extractAdminDocument(activeTab, preparedPages);
      if (!extracted.success || !extracted.extraction) {
        setStatus('error');
        setStatusMsg(extracted.message || 'No se pudo extraer el documento.');
        return;
      }

      const formDataPatch = buildRegularDocumentPatch({
        activeTab,
        extraction: extracted.extraction,
        originalPdfs,
        preparedPages,
        project,
      });

      setStatus('uploading');
      setStatusMsg('Guardando en el expediente...');
      const saveRes = await adminUpdateFormData(project.code, formDataPatch, token);

      if (!saveRes.success) {
        setStatus('error');
        setStatusMsg(saveRes.message || 'Error al guardar.');
        return;
      }

      await onRefresh();
      setProject(await loadProjectDetail(project.code));
      setStatus('done');
      setStatusMsg('Documento guardado correctamente.');
    } catch (err) {
      console.error('Admin upload failed:', err);
      setStatus('error');
      setStatusMsg('Error inesperado. Inténtalo de nuevo.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/60 p-4"
      data-testid="admin-upload-modal"
      onClick={() => {
        if (!isBusy) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 pb-3 pt-5">
          <h2 className="text-base font-bold text-gray-900">
            Subir documento — {projectCode}
          </h2>
          <button
            type="button"
            data-testid="admin-upload-close-btn"
            onClick={() => {
              if (!isBusy) {
                onClose();
              }
            }}
            disabled={isBusy}
            className="text-gray-400 transition-colors hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {detailLoading ? (
            <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-eltex-blue" />
              <span className="text-sm text-blue-800">Cargando expediente...</span>
            </div>
          ) : null}

          {!detailLoading && detailError ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm text-red-800">{detailError}</span>
              </div>
              <button type="button" onClick={onClose} className="btn-secondary w-full text-sm">
                Cerrar
              </button>
            </div>
          ) : null}

          {!detailLoading && !detailError ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {ADMIN_DOC_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.key);
                      reset();
                    }}
                    disabled={isBusy}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      activeTab === tab.key
                        ? 'bg-eltex-blue text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {status === 'idle' ? (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 p-8 transition-colors hover:border-eltex-blue hover:bg-blue-50">
                  <Upload className="h-6 w-6 text-gray-400" />
                  <span className="text-sm text-gray-500">
                    Haz clic para seleccionar imagen o PDF
                  </span>
                  <input
                    ref={fileRef}
                    data-testid="admin-upload-file-input"
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      event.target.value = '';
                      if (files.length > 0) {
                        void handleFiles(files);
                      }
                    }}
                  />
                </label>
              ) : null}

              {status === 'extracting' || status === 'uploading' ? (
                <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-eltex-blue" />
                  <span className="text-sm text-blue-800">{statusMsg}</span>
                </div>
              ) : null}

              {status === 'done' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                    <span className="text-sm text-emerald-800">{statusMsg}</span>
                  </div>
                  <button type="button" onClick={reset} className="btn-secondary w-full text-sm">
                    Subir otro
                  </button>
                </div>
              ) : null}

              {status === 'error' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
                    <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                    <span className="text-sm text-red-800">{statusMsg}</span>
                  </div>
                  <button type="button" onClick={reset} className="btn-secondary w-full text-sm">
                    Reintentar
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
