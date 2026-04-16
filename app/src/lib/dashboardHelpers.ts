import type { ProjectData, StoredDocumentFile } from '@/types';
import type { DashboardAssetItem, DashboardSignedPdfItem } from '@/lib/dashboardProject';
import { getDashboardProjectSummary } from '@/lib/dashboardProject';
import { generateImagePDF } from '@/services/api';
import { getStoredRenderedDocument, renderSignedDocumentOverlay, SIGNED_DOCUMENT_TEMPLATE_VERSION } from '@/lib/signedDocumentOverlays';
import { renderEnergyCertificateOverlay, ENERGY_CERTIFICATE_TEMPLATE_VERSION } from '@/lib/energyCertificateDocument';
import { pdfToImageFiles } from '@/lib/pdfToImages';
import { compressImageForAI, createStoredDocumentFile, fileToBase64 } from '@/lib/photoValidation';

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function locationLabel(location: string | null | undefined) {
  if (location === 'cataluna') return 'Cataluña';
  if (location === 'madrid') return 'Madrid';
  if (location === 'valencia') return 'Valencia';
  if (location === 'other') return 'Otra';
  return '—';
}

export function languageLabel(lang: string | null | undefined) {
  if (!lang) return '—';
  try {
    const base = lang.split('-')[0];
    const display = new Intl.DisplayNames(['es'], { type: 'language' }).of(base);
    return display ? `${display} (${lang})` : lang;
  } catch {
    return lang;
  }
}

export function extensionFromMimeType(mimeType: string | null | undefined, dataUrl?: string | null) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (dataUrl?.includes('application/pdf')) return 'pdf';
  if (dataUrl?.includes('image/png')) return 'png';
  if (dataUrl?.includes('image/webp')) return 'webp';
  return 'jpg';
}

export function sanitizeFilename(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildProjectUrl(code: string, source?: 'customer' | 'assessor', token?: string) {
  void token;
  const params = new URLSearchParams({ code });
  if (source === 'assessor') params.set('source', 'assessor');
  return `/?${params.toString()}`;
}

export function downloadDataUrlAsset(asset: DashboardAssetItem, projectCode: string) {
  const anchor = document.createElement('a');
  anchor.href = asset.dataUrl;
  const ext = extensionFromMimeType(asset.mimeType, asset.dataUrl);
  anchor.download = `${projectCode}_${sanitizeFilename(asset.label)}.${ext}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function openDataUrlInNewTab(dataUrl: string) {
  try {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export interface PreparedAdminPage {
  aiDataUrl: string;
  preview: string;
  sizeBytes: number;
}

export interface PreparedAdminUpload {
  pages: PreparedAdminPage[];
  originalPdfs: StoredDocumentFile[];
}

export function getIbiPages(ibi: { pages?: unknown[]; photo?: unknown } | null | undefined): unknown[] {
  if (Array.isArray(ibi?.pages) && ibi.pages.length > 0) return ibi.pages;
  return ibi?.photo ? [ibi.photo] : [];
}

export async function prepareAdminUploadPages(files: File[]): Promise<PreparedAdminUpload> {
  const preparedPages: PreparedAdminPage[] = [];
  const originalPdfs: StoredDocumentFile[] = [];

  for (const file of files) {
    const sourceFiles = file.type === 'application/pdf'
      ? await pdfToImageFiles(file)
      : [file];

    if (sourceFiles.length === 0) {
      throw new Error(`El archivo "${file.name}" no contenía ninguna página utilizable.`);
    }

    if (file.type === 'application/pdf') {
      originalPdfs.push(await createStoredDocumentFile(file));
    }

    const preparedFromFile = await Promise.all(sourceFiles.map(async (page) => {
      const preview = await fileToBase64(page);
      return {
        preview,
        aiDataUrl: await compressImageForAI(preview),
        sizeBytes: page.size,
      };
    }));

    preparedPages.push(...preparedFromFile);
  }

  if (preparedPages.length === 0) {
    throw new Error('No se encontró ninguna imagen utilizable.');
  }

  return { pages: preparedPages, originalPdfs };
}

export async function viewPDFInNewTab(pdfFactory: () => Promise<Blob>) {
  try {
    const blob = await pdfFactory();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error('View PDF failed:', err);
    alert('Error al visualizar el PDF.');
  }
}

export function downloadCSV(token: string) {
  fetch('/api/dashboard/export/csv', {
    headers: { 'x-dashboard-token': token },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error('CSV export failed');
      return response.blob();
    })
    .then((blob) => {
      downloadBlob(blob, `eltex_expedientes_${new Date().toISOString().slice(0, 10)}.csv`);
    })
    .catch((err) => {
      console.error('CSV export failed:', err);
      alert('No se pudo exportar el CSV.');
    });
}

export async function buildSignedPdfFactory(project: ProjectData, item: DashboardSignedPdfItem) {
  const stored = getStoredRenderedDocument(project, item.key);
  const overlay =
    stored?.imageDataUrl && stored.templateVersion === SIGNED_DOCUMENT_TEMPLATE_VERSION
      ? stored.imageDataUrl
      : await renderSignedDocumentOverlay(project, item.key);
  return () => generateImagePDF(overlay, item.filename);
}

export async function buildEnergyCertificatePdfFactory(project: ProjectData) {
  const storedDoc = project?.formData?.energyCertificate?.renderedDocument;
  const storedIsValid = storedDoc?.imageDataUrl && storedDoc.templateVersion === ENERGY_CERTIFICATE_TEMPLATE_VERSION;
  const imageDataUrl = storedIsValid
    ? storedDoc.imageDataUrl
    : await renderEnergyCertificateOverlay(project?.formData).catch(() => null);
  if (!imageDataUrl) throw new Error('ENERGY_CERTIFICATE_NOT_READY');
  return () => generateImagePDF(imageDataUrl, `${project.code}_certificado-energetico.pdf`);
}

export function assetFromPreview(key: string, label: string, preview: string | null | undefined): DashboardAssetItem | null {
  if (!preview) return null;
  return {
    key,
    label,
    dataUrl: preview,
    mimeType: extensionFromMimeType(undefined, preview).startsWith('p') ? 'image/png' : 'image/jpeg',
  };
}

export function getDocumentAssetsFromProject(project: { formData?: unknown; assetFiles?: Record<string, unknown>; code?: string }, key: string): DashboardAssetItem[] {
  const fd = project?.formData as Record<string, unknown> | null | undefined;
  if (key === 'ibi') {
    const fromPreview = getIbiPages(fd?.['ibi'] as Parameters<typeof getIbiPages>[0])
      .map((page, index) => assetFromPreview(
        `ibi-${index}`,
        `IBI / Escritura${index === 0 ? '' : ` ${index + 1}`}`,
        (page as { preview?: string } | null)?.preview,
      ))
      .filter(Boolean) as DashboardAssetItem[];
    if (fromPreview.length > 0) return fromPreview;

    const assetFiles = project?.assetFiles ?? {};
    const ibiKeys = Object.keys(assetFiles).filter((k) => k.startsWith('ibi_')).sort();
    return ibiKeys.map((k, index) => ({
      key: `ibi-${index}`,
      label: `IBI / Escritura${index === 0 ? '' : ` ${index + 1}`}`,
      dataUrl: assetFiles[k] as string,
      mimeType: 'image/jpeg' as const,
    }));
  }

  const summary = getDashboardProjectSummary(project);
  const item = summary.documents.find((document) => document.key === key);
  if (item?.dataUrl) {
    return [{ key: item.key, label: item.label, dataUrl: item.dataUrl, mimeType: item.mimeType }];
  }

  const assetPath = project?.assetFiles?.[key];
  if (assetPath) {
    const label = key === 'dniFront' ? 'DNI frontal' : key === 'dniBack' ? 'DNI trasera' : key;
    return [{ key, label, dataUrl: assetPath as string, mimeType: 'image/jpeg' as const }];
  }

  return [];
}

export function getElectricityAssetsFromProject(project: { formData?: unknown; assetFiles?: Record<string, unknown> }): DashboardAssetItem[] {
  const summary = getDashboardProjectSummary(project);
  const fromSummary = summary.electricityPages
    .filter((item) => item.present && item.dataUrl)
    .map((item) => ({
      key: item.key,
      label: item.label,
      dataUrl: item.dataUrl as string,
      mimeType: item.mimeType,
    }));
  if (fromSummary.length > 0) return fromSummary;

  const assetFiles = project?.assetFiles ?? {};
  const elecKeys = Object.keys(assetFiles).filter((k) => k.startsWith('electricity_')).sort();
  return elecKeys.map((k, index) => ({
    key: k,
    label: `Factura luz — pág. ${index + 1}`,
    dataUrl: assetFiles[k] as string,
    mimeType: 'image/jpeg' as const,
  }));
}
