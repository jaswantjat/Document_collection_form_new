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

export type AdminDocType =
  | 'dni-front'
  | 'dni-back'
  | 'ibi'
  | 'electricity-bill'
  | 'additional-bank-document';

export type AdminUploadStage = 'extracting' | 'uploading';

export interface AdminUploadProgress {
  stage: AdminUploadStage;
  message: string;
}

export interface AdminUploadSuccess {
  ok: true;
  message: string;
}

export interface AdminUploadFailure {
  ok: false;
  message: string;
}

export type AdminUploadResult = AdminUploadSuccess | AdminUploadFailure;

function buildAdminPhoto(
  docType: AdminDocType,
  page: PreparedAdminPage,
  index = 0,
): UploadedPhoto {
  return {
    id: `admin-${docType}-${Date.now()}-${index}`,
    preview: page.preview,
    timestamp: Date.now(),
    sizeBytes: page.sizeBytes,
  };
}

function buildRegularDocumentPatch({
  docType,
  extraction,
  originalPdfs,
  preparedPages,
  project,
}: {
  docType: Exclude<AdminDocType, 'additional-bank-document'>;
  extraction: NonNullable<Awaited<ReturnType<typeof extractDocument>>['extraction']>;
  originalPdfs: StoredDocumentFile[];
  preparedPages: PreparedAdminPage[];
  project: DashboardProjectRecord;
}) {
  if (docType === 'dni-front') {
    return {
      dni: {
        front: { photo: buildAdminPhoto(docType, preparedPages[0]), extraction },
        ...(originalPdfs.length > 0
          ? {
              originalPdfs: mergeStoredDocumentFiles(
                project.formData?.dni?.originalPdfs,
                originalPdfs,
              ),
            }
          : {}),
      },
    };
  }

  if (docType === 'dni-back') {
    return {
      dni: {
        back: { photo: buildAdminPhoto(docType, preparedPages[0]), extraction },
        ...(originalPdfs.length > 0
          ? {
              originalPdfs: mergeStoredDocumentFiles(
                project.formData?.dni?.originalPdfs,
                originalPdfs,
              ),
            }
          : {}),
      },
    };
  }

  if (docType === 'ibi') {
    const storedPages = preparedPages.map((page, index) =>
      buildAdminPhoto(docType, page, index),
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
          photo: buildAdminPhoto(docType, page, index),
          extraction,
        })),
      ],
      originalPdfs: mergeStoredDocumentFiles(
        project.formData?.electricityBill?.originalPdfs,
        originalPdfs,
      ),
    },
  };
}

async function extractAdminDocument(
  docType: Exclude<AdminDocType, 'additional-bank-document'>,
  preparedPages: PreparedAdminPage[],
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
    docType === 'electricity-bill'
      ? await extractDocumentBatch(
          preparedPages.map((page) => page.aiDataUrl),
          'electricity',
        )
      : await extractDocument(
          preparedPages.length === 1
            ? preparedPages[0].aiDataUrl
            : preparedPages.map((page) => page.aiDataUrl),
          docTypeMap[docType],
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

export async function uploadAdminDocument({
  docType,
  files,
  project,
  token,
  onProgress,
}: {
  docType: AdminDocType;
  files: File[];
  project: DashboardProjectRecord;
  token: string;
  onProgress?: (progress: AdminUploadProgress) => void;
}): Promise<AdminUploadResult> {
  if (files.length === 0) {
    return { ok: false, message: 'Selecciona al menos un archivo.' };
  }

  try {
    if (docType === 'additional-bank-document') {
      onProgress?.({
        stage: 'uploading',
        message:
          files.length > 1
            ? 'Guardando documentos adicionales...'
            : 'Guardando documento adicional...',
      });

      const formDataPatch = await buildDashboardAdditionalBankDocumentPatch(
        project.formData?.additionalBankDocuments,
        files,
      );
      const saveRes = await adminUpdateFormData(project.code, formDataPatch, token);

      if (!saveRes.success) {
        return { ok: false, message: saveRes.message || 'Error al guardar.' };
      }

      return {
        ok: true,
        message:
          files.length > 1
            ? 'Documentos adicionales guardados correctamente.'
            : 'Documento adicional guardado correctamente.',
      };
    }

    const hasPdf = files.some((file) => file.type === 'application/pdf');
    onProgress?.({
      stage: 'extracting',
      message: hasPdf
        ? 'Convirtiendo PDF en imágenes...'
        : files.length > 1
          ? 'Preparando imágenes...'
          : 'Preparando imagen...',
    });

    const { pages: preparedPages, originalPdfs } = await prepareAdminUploadPages(files);
    onProgress?.({ stage: 'extracting', message: 'Extrayendo datos con IA...' });

    const extracted = await extractAdminDocument(docType, preparedPages);
    if (!extracted.success || !extracted.extraction) {
      return {
        ok: false,
        message: extracted.message || 'No se pudo extraer el documento.',
      };
    }

    const formDataPatch = buildRegularDocumentPatch({
      docType,
      extraction: extracted.extraction,
      originalPdfs,
      preparedPages,
      project,
    });

    onProgress?.({ stage: 'uploading', message: 'Guardando en el expediente...' });
    const saveRes = await adminUpdateFormData(project.code, formDataPatch, token);

    if (!saveRes.success) {
      return { ok: false, message: saveRes.message || 'Error al guardar.' };
    }

    return { ok: true, message: 'Documento guardado correctamente.' };
  } catch (err) {
    console.error('Admin upload failed:', err);
    return { ok: false, message: 'Error inesperado. Inténtalo de nuevo.' };
  }
}
