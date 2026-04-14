import type { ProjectData, StoredDocumentFile } from '@/types';
import type { DashboardAssetGroup, DashboardSignedPdfItem } from '@/lib/dashboardProject';
import {
  getDashboardAdditionalBankDocumentAssets,
  getDashboardProjectSummary,
} from '@/lib/dashboardProject';
import {
  buildEnergyCertificatePdfFactory,
  buildSignedPdfFactory,
  downloadBlob,
  extensionFromMimeType,
  getDocumentAssetsFromProject,
  getElectricityAssetsFromProject,
  sanitizeFilename,
} from '@/lib/dashboardHelpers';

type DashboardExportCategory =
  | 'documents'
  | 'signed-pdfs'
  | 'energy-certificate'
  | 'final-signatures'
  | 'property-photos';

type StoredDocumentLike = Partial<StoredDocumentFile> | null | undefined;

export interface DashboardProjectExportSource extends ProjectData {
  assetFiles?: Record<string, string>;
  submissionCount?: number;
  summary?: Record<string, unknown>;
}

export interface DashboardExportEntry {
  key: string;
  category: DashboardExportCategory;
  folder: string;
  filename: string;
  archivePath: string;
  createBlob: () => Promise<Blob>;
}

interface DownloadProjectZipOptions {
  loadProjectDetail?: (projectCode: string) => Promise<DashboardProjectExportSource>;
  token?: string;
}

const EXPORT_FOLDERS: Record<DashboardExportCategory, string> = {
  documents: '1_documentos',
  'signed-pdfs': '2_pdfs_firmados',
  'energy-certificate': '3_certificado_energetico',
  'final-signatures': '4_firmas_finales',
  'property-photos': '5_fotos_inmueble',
};

interface UzipModule {
  encode: (files: Record<string, Uint8Array>) => ArrayBuffer;
}

function buildArchivePath(folder: string, filename: string) {
  return `${folder}/${filename}`;
}

function buildLabelFilenameStem(label: string) {
  return sanitizeFilename(label).replace(/\.+/g, '_').replace(/_+/g, '_');
}

function buildZipFilename(project: Pick<ProjectData, 'code' | 'customerName'>) {
  const safeName = (project.customerName || project.code).replace(/[^a-zA-Z0-9]/g, '_');
  return `${project.code}_${safeName}.zip`;
}

function blobFromDataUrl(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header?.match(/:(.*?);/);
  if (!mimeMatch || !base64) throw new Error('INVALID_DATA_URL');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeMatch[1] });
}

function createSourceBlobFactory(source: string, mimeType: string | null | undefined) {
  return async () => {
    if (source.startsWith('data:')) {
      return blobFromDataUrl(source);
    }

    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`ASSET_FETCH_FAILED:${response.status}`);
    }

    const blob = await response.blob();
    if (blob.type || !mimeType) return blob;
    return new Blob([await blob.arrayBuffer()], { type: mimeType });
  };
}

function createAssetEntry(
  category: DashboardExportCategory,
  key: string,
  filename: string,
  source: string,
  mimeType: string | null | undefined,
): DashboardExportEntry {
  const folder = EXPORT_FOLDERS[category];

  return {
    key,
    category,
    folder,
    filename,
    archivePath: buildArchivePath(folder, filename),
    createBlob: createSourceBlobFactory(source, mimeType),
  };
}

function assetEntriesFromGroup(category: DashboardExportCategory, group: DashboardAssetGroup) {
  return group.items.map((asset) => {
    const ext = extensionFromMimeType(asset.mimeType, asset.dataUrl);
    const filename = `${buildLabelFilenameStem(asset.label)}.${ext}`;
    return createAssetEntry(category, asset.key, filename, asset.dataUrl, asset.mimeType);
  });
}

function storedPdfEntries(
  project: DashboardProjectExportSource,
  label: string,
  assetKeyPrefix: string,
  files: StoredDocumentLike[] | undefined,
) {
  const assetFiles = project.assetFiles || {};
  const storedKeys = Object.keys(assetFiles)
    .filter((key) => key.startsWith(`${assetKeyPrefix}_`))
    .sort();

  if (storedKeys.length > 0) {
    return storedKeys.map((key, index) => {
      const filename = storedKeys.length === 1
        ? `${buildLabelFilenameStem(label)}.pdf`
        : `${buildLabelFilenameStem(label)}_${index + 1}.pdf`;
      return createAssetEntry('documents', key, filename, assetFiles[key], 'application/pdf');
    });
  }

  return (files || [])
    .filter((file): file is StoredDocumentFile => Boolean(file?.dataUrl))
    .map((file, index, all) => {
      const filename = all.length === 1
        ? `${buildLabelFilenameStem(label)}.pdf`
        : `${buildLabelFilenameStem(label)}_${index + 1}.pdf`;
      return createAssetEntry('documents', `${assetKeyPrefix}-${index}`, filename, file.dataUrl, file.mimeType);
    });
}

function documentEntries(project: DashboardProjectExportSource) {
  const formData = project.formData;
  const documentGroups = [
    ...getDocumentAssetsFromProject(project, 'dniFront'),
    ...getDocumentAssetsFromProject(project, 'dniBack'),
    ...getDocumentAssetsFromProject(project, 'ibi'),
    ...getElectricityAssetsFromProject(project),
    ...getDashboardAdditionalBankDocumentAssets(project),
  ].map((asset) => {
    const ext = extensionFromMimeType(asset.mimeType, asset.dataUrl);
    const filename = `${buildLabelFilenameStem(asset.label)}.${ext}`;
    return createAssetEntry('documents', asset.key, filename, asset.dataUrl, asset.mimeType);
  });

  return [
    ...documentGroups,
    ...storedPdfEntries(project, 'DNI_original_pdf', 'dniOriginal', formData?.dni?.originalPdfs),
    ...storedPdfEntries(project, 'IBI_original_pdf', 'ibiOriginal', formData?.ibi?.originalPdfs),
    ...storedPdfEntries(project, 'Factura_luz_original_pdf', 'electricityOriginal', formData?.electricityBill?.originalPdfs),
  ];
}

function signedPdfEntries(project: DashboardProjectExportSource, items: DashboardSignedPdfItem[]) {
  return items
    .filter((item) => item.present)
    .map((item) => ({
      key: item.key,
      category: 'signed-pdfs' as const,
      folder: EXPORT_FOLDERS['signed-pdfs'],
      filename: item.filename,
      archivePath: buildArchivePath(EXPORT_FOLDERS['signed-pdfs'], item.filename),
      createBlob: async () => {
        const pdfFactory = await buildSignedPdfFactory(project, item);
        return pdfFactory();
      },
    }));
}

function energyCertificateEntries(project: DashboardProjectExportSource, status: string) {
  if (status !== 'completed') return [];

  const filename = `${project.code}_certificado-energetico.pdf`;
  return [{
    key: 'energy-certificate',
    category: 'energy-certificate' as const,
    folder: EXPORT_FOLDERS['energy-certificate'],
    filename,
    archivePath: buildArchivePath(EXPORT_FOLDERS['energy-certificate'], filename),
    createBlob: async () => {
      const pdfFactory = await buildEnergyCertificatePdfFactory(project);
      return pdfFactory();
    },
  }];
}

function hasDetailData(project: DashboardProjectExportSource) {
  return Boolean(project.formData) || Object.keys(project.assetFiles || {}).length > 0;
}

async function resolveProjectDetail(
  project: DashboardProjectExportSource,
  loadProjectDetail?: (projectCode: string) => Promise<DashboardProjectExportSource>,
) {
  if (hasDetailData(project) || !loadProjectDetail) return project;
  return loadProjectDetail(project.code);
}

async function loadUzip(): Promise<UzipModule> {
  const imported = await import('uzip');
  return (imported.default ?? imported) as UzipModule;
}

export function listDashboardExportEntries(project: DashboardProjectExportSource): DashboardExportEntry[] {
  const summary = getDashboardProjectSummary(project);
  const finalSignatureGroup: DashboardAssetGroup = {
    key: 'final-signatures',
    label: 'Firmas finales',
    items: summary.finalSignatures,
  };

  return [
    ...documentEntries(project),
    ...signedPdfEntries(project, summary.signedDocuments),
    ...energyCertificateEntries(project, summary.energyCertificate.status),
    ...assetEntriesFromGroup('final-signatures', finalSignatureGroup),
    ...summary.photoGroups.flatMap((group) => assetEntriesFromGroup('property-photos', group)),
  ];
}

export async function buildProjectZipBlob(project: DashboardProjectExportSource): Promise<Blob> {
  const entries = listDashboardExportEntries(project);
  const zipFiles: Record<string, Uint8Array> = {};

  for (const entry of entries) {
    const blob = await entry.createBlob();
    zipFiles[entry.archivePath] = new Uint8Array(await blob.arrayBuffer());
  }

  const UZIP = await loadUzip();
  return new Blob([UZIP.encode(zipFiles)], { type: 'application/zip' });
}

async function downloadLegacyProjectZip(
  project: Pick<ProjectData, 'code' | 'customerName'>,
  token: string,
) {
  const response = await fetch(`/api/project/${project.code}/download-zip`, {
    headers: { 'x-dashboard-token': token },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message || `HTTP ${response.status}`);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    alert('Este expediente no tiene archivos descargables aún.');
    return;
  }

  downloadBlob(blob, buildZipFilename(project));
}

export async function downloadProjectZip(
  project: DashboardProjectExportSource,
  options: DownloadProjectZipOptions = {},
) {
  const detailProject = await resolveProjectDetail(project, options.loadProjectDetail);
  const entries = listDashboardExportEntries(detailProject);

  if (entries.length === 0) {
    if (options.token && !hasDetailData(detailProject)) {
      await downloadLegacyProjectZip(project, options.token);
      return;
    }

    alert('Este expediente no tiene archivos descargables aún.');
    return;
  }

  const zipBlob = await buildProjectZipBlob(detailProject);
  downloadBlob(zipBlob, buildZipFilename(detailProject));
}
