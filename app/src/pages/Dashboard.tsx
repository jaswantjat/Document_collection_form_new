/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Archive,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  PenLine,
  Phone,
  RefreshCw,
  Search,
  Sun,
  Thermometer,
  User,
  Users,
  X,
  Upload,
  Zap,
  Scissors,
} from 'lucide-react';
import { dashboardLogout, fetchDashboard, fetchDashboardProject, generateImagePDF, extractDocument, extractDocumentBatch, adminUpdateFormData } from '@/services/api';
import {
  type DashboardAssetGroup,
  type DashboardAssetItem,
  type DashboardDocumentItem,
  type DashboardEnergyCertificateSummary,
  type DashboardSignedPdfItem,
  type DashboardProjectSummary,
  getDashboardProjectSummary,
} from '@/lib/dashboardProject';
import { getStoredRenderedDocument, renderSignedDocumentOverlay, SIGNED_DOCUMENT_TEMPLATE_VERSION } from '@/lib/signedDocumentOverlays';
import { renderEnergyCertificateOverlay } from '@/lib/energyCertificateDocument';
import { pdfToImageFiles } from '@/lib/pdfToImages';
import type { StoredDocumentFile } from '@/types';
import { compressImageForAI, createStoredDocumentFile, fileToBase64, mergeStoredDocumentFiles } from '@/lib/photoValidation';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';

  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function locationLabel(location: string | null | undefined) {
  if (location === 'cataluna') return 'Cataluña';
  if (location === 'madrid') return 'Madrid';
  if (location === 'valencia') return 'Valencia';
  if (location === 'other') return 'Otra';
  return '—';
}

function extensionFromMimeType(mimeType: string | null | undefined, dataUrl?: string | null) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (dataUrl?.includes('application/pdf')) return 'pdf';
  if (dataUrl?.includes('image/png')) return 'png';
  if (dataUrl?.includes('image/webp')) return 'webp';
  return 'jpg';
}

function sanitizeFilename(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildProjectUrl(code: string, token?: string | null, source?: 'customer' | 'assessor') {
  const params = new URLSearchParams({ code });
  if (token) params.set('token', token);
  if (source === 'assessor') params.set('source', 'assessor');
  return `/?${params.toString()}`;
}

function downloadDataUrlAsset(asset: DashboardAssetItem, projectCode: string) {
  const anchor = document.createElement('a');
  anchor.href = asset.dataUrl;
  const ext = extensionFromMimeType(asset.mimeType, asset.dataUrl);
  anchor.download = `${projectCode}_${sanitizeFilename(asset.label)}.${ext}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function openDataUrlInNewTab(dataUrl: string) {
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

interface PreparedAdminPage {
  aiDataUrl: string;
  preview: string;
  sizeBytes: number;
}

interface PreparedAdminUpload {
  pages: PreparedAdminPage[];
  originalPdfs: StoredDocumentFile[];
}

function getIbiPages(ibi: any): any[] {
  if (Array.isArray(ibi?.pages) && ibi.pages.length > 0) {
    return ibi.pages;
  }
  return ibi?.photo ? [ibi.photo] : [];
}

async function prepareAdminUploadPages(files: File[]): Promise<PreparedAdminUpload> {
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

async function viewPDFInNewTab(pdfFactory: () => Promise<Blob>) {
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

function downloadCSV(token: string) {
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

async function buildSignedPdfFactory(project: any, item: DashboardSignedPdfItem) {
  const stored = getStoredRenderedDocument(project, item.key);
  const overlay =
    stored?.imageDataUrl && stored.templateVersion === SIGNED_DOCUMENT_TEMPLATE_VERSION
      ? stored.imageDataUrl
      : await renderSignedDocumentOverlay(project, item.key);
  return () => generateImagePDF(overlay, item.filename);
}

async function buildEnergyCertificatePdfFactory(project: any) {
  const stored = project?.formData?.energyCertificate?.renderedDocument?.imageDataUrl;
  const imageDataUrl = stored ?? await renderEnergyCertificateOverlay(project?.formData).catch(() => null);
  if (!imageDataUrl) {
    throw new Error('ENERGY_CERTIFICATE_NOT_READY');
  }
  return () => generateImagePDF(imageDataUrl, `${project.code}_certificado-energetico.pdf`);
}

async function downloadProjectZip(project: any, token: string) {
  const response = await fetch(`/api/project/${project.code}/download-zip`, {
    headers: { 'x-dashboard-token': token },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    alert('Este expediente no tiene archivos descargables aún.');
    return;
  }
  const safeName = (project.customerName || project.code).replace(/[^a-zA-Z0-9]/g, '_');
  downloadBlob(blob, `${project.code}_${safeName}.zip`);
}

function ProductBadge({ type }: { type: string }) {
  const isSolar = type?.toLowerCase() === 'solar';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
      isSolar
        ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
        : 'bg-cyan-50 text-cyan-700 border-cyan-200'
    }`}>
      {isSolar ? <Sun className="w-3 h-3" /> : <Thermometer className="w-3 h-3" />}
      {isSolar ? 'Solar' : 'Aerotermia'}
    </span>
  );
}

function SectionHeading({ icon: Icon, label, actions }: { icon: any; label: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-eltex-blue-light flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-eltex-blue" />
        </div>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">{label}</p>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: any }) {
  if (!value && value !== 0) return null;

  return (
    <div className="flex gap-2 text-xs py-0.5">
      <span className="text-gray-400 shrink-0 w-36">{label}</span>
      <span className="text-gray-800 font-medium break-all">{String(value)}</span>
    </div>
  );
}

export function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-900 break-words">{value || '—'}</p>
    </div>
  );
}

export function QuickStat({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: string;
  tone?: 'gray' | 'blue' | 'green' | 'orange';
}) {
  const tones = {
    gray: 'border-gray-200 bg-gray-50 text-gray-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
  } as const;

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${tones[tone]}`}>
      <p className="text-sm font-bold leading-none">{value}</p>
      <p className="text-[11px] mt-1 opacity-80">{label}</p>
    </div>
  );
}

function DocImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in object-cover rounded-xl border border-gray-200 hover:opacity-90 transition-opacity ${className}`}
      />
      {open && (
        <div
          className="fixed inset-0 z-[999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={alt} className="max-w-full max-h-full rounded-xl shadow-2xl" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

function AssetButtons({
  asset,
  projectCode,
  compact = false,
}: {
  asset: DashboardAssetItem;
  projectCode: string;
  compact?: boolean;
}) {
  const baseClasses = compact
    ? 'h-7 w-7 rounded-md'
    : 'h-8 rounded-lg px-2.5';

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openDataUrlInNewTab(asset.dataUrl);
        }}
        className={`${baseClasses} inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors`}
        title={`Ver ${asset.label}`}
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          downloadDataUrlAsset(asset, projectCode);
        }}
        className={`${baseClasses} inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors`}
        title={`Descargar ${asset.label}`}
      >
        <Download className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function assetFromPreview(key: string, label: string, preview: string | null | undefined): DashboardAssetItem | null {
  if (!preview) return null;

  return {
    key,
    label,
    dataUrl: preview,
    mimeType: extensionFromMimeType(undefined, preview).startsWith('p') ? 'image/png' : 'image/jpeg',
  };
}

function getDocumentAssetsFromProject(project: any, key: string): DashboardAssetItem[] {
  if (key === 'ibi') {
    return getIbiPages(project?.formData?.ibi)
      .map((page: any, index: number) => assetFromPreview(
        `ibi-${index}`,
        `IBI / Escritura${index === 0 ? '' : ` ${index + 1}`}`,
        page?.preview,
      ))
      .filter(Boolean) as DashboardAssetItem[];
  }

  const summary = getDashboardProjectSummary(project);
  const item = summary.documents.find((document) => document.key === key);
  if (!item?.dataUrl) return [];

  return [{
    key: item.key,
    label: item.label,
    dataUrl: item.dataUrl,
    mimeType: item.mimeType,
  }];
}

function getElectricityAssetsFromProject(project: any): DashboardAssetItem[] {
  const summary = getDashboardProjectSummary(project);

  return summary.electricityPages
    .filter((item) => item.present && item.dataUrl)
    .map((item) => ({
      key: item.key,
      label: item.label,
      dataUrl: item.dataUrl as string,
      mimeType: item.mimeType,
    }));
}

function DeferredAssetButtons({
  projectCode,
  loadProjectDetail,
  resolveAssets,
  onOpenDetail,
}: {
  projectCode: string;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  resolveAssets: (project: any) => DashboardAssetItem[];
  onOpenDetail?: () => void;
}) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);

  const run = async (mode: 'view' | 'download') => {
    setLoading(mode);
    try {
      const project = await loadProjectDetail(projectCode);
      const assets = resolveAssets(project);

      if (assets.length === 0) {
        alert('No se encontraron archivos descargables para este documento.');
        return;
      }

      if (mode === 'view') {
        if (assets.length === 1) {
          openDataUrlInNewTab(assets[0].dataUrl);
        } else if (onOpenDetail) {
          onOpenDetail();
        } else {
          openDataUrlInNewTab(assets[0].dataUrl);
        }
        return;
      }

      assets.forEach((asset) => downloadDataUrlAsset(asset, projectCode));
    } catch (err) {
      console.error('Deferred asset action failed:', err);
      alert('No se pudo acceder a los archivos del documento.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('view');
        }}
        className="h-7 w-7 rounded-md inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Ver archivo"
      >
        {loading === 'view' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('download');
        }}
        className="h-7 w-7 rounded-md inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Descargar archivo"
      >
        {loading === 'download' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function SignedPdfButtons({
  projectCode,
  item,
  loadProjectDetail,
  compact = false,
}: {
  projectCode: string;
  item: DashboardSignedPdfItem;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);
  const baseClasses = compact
    ? 'h-7 w-7 rounded-md'
    : 'h-8 rounded-lg px-2.5';

  const run = async (mode: 'view' | 'download') => {
    setLoading(mode);
    try {
      const project = await loadProjectDetail(projectCode);
      const pdfFactory = await buildSignedPdfFactory(project, item);
      if (mode === 'view') {
        await viewPDFInNewTab(pdfFactory);
      } else {
        const blob = await pdfFactory();
        downloadBlob(blob, item.filename);
      }
    } catch (err) {
      console.error('Signed PDF action failed:', err);
      alert('No se pudo generar el PDF firmado.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('view');
        }}
        className={`${baseClasses} inline-flex items-center justify-center border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50`}
        title={`Ver ${item.label}`}
      >
        {loading === 'view' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('download');
        }}
        className={`${baseClasses} inline-flex items-center justify-center border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50`}
        title={`Descargar ${item.label}`}
      >
        {loading === 'download' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

async function callAutocropper(documentType: string, images: string[]): Promise<{ success: boolean; cropped_images?: string[]; combined_pdf?: string }> {
  const response = await fetch('/api/autocropper/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentType, images }),
  });
  if (!response.ok) {
    throw new Error('Autocropper service error');
  }
  return response.json();
}

function AutocropperButton({
  documentType,
  images,
  onPDFReady,
  projectCode,
}: {
  documentType: 'dni' | 'ibi' | 'electricity';
  images: string[];
  onPDFReady?: (pdfDataUrl: string) => void;
  projectCode: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ cropped_images: string[]; combined_pdf: string } | null>(null);

  const handleAutocrop = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await callAutocropper(documentType, images);
      if (response.success && response.combined_pdf) {
        setResult({ cropped_images: response.cropped_images || [], combined_pdf: response.combined_pdf });
        onPDFReady?.(response.combined_pdf);
      } else {
        alert('No se pudo procesar el documento. Asegúrate de que el servicio autocropper está activo.');
      }
    } catch (err) {
      console.error('Autocropper error:', err);
      alert('Error al conectar con el servicio de recorte automático.');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (result?.combined_pdf) {
      const pdfData = result.combined_pdf.split(',')[1];
      const blob = new Blob([Uint8Array.from(atob(pdfData), (c) => c.charCodeAt(0))], { type: 'application/pdf' });
      downloadBlob(blob, `${projectCode}_${documentType}_recortado.pdf`);
    }
  };

  const downloadCroppedImages = () => {
    if (result?.cropped_images) {
      result.cropped_images.forEach((imgDataUrl, index) => {
        const imgData = imgDataUrl.split(',')[1];
        const blob = new Blob([Uint8Array.from(atob(imgData), (c) => c.charCodeAt(0))], { type: 'image/jpeg' });
        downloadBlob(blob, `${projectCode}_${documentType}_${index + 1}_recortado.jpg`);
      });
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={loading}
        onClick={handleAutocrop}
        className="h-8 rounded-lg px-2.5 inline-flex items-center justify-center border border-eltex-blue-200 bg-white text-eltex-blue-700 hover:bg-eltex-blue-50 transition-colors disabled:opacity-50"
        title="Recortar y generar PDF"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
        {!loading && <span className="text-xs font-medium">Recortar</span>}
      </button>
      {result?.combined_pdf && (
        <>
          <button
            type="button"
            onClick={downloadPDF}
            className="h-8 rounded-lg px-2.5 inline-flex items-center justify-center border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors"
            title="Descargar PDF recortado"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={downloadCroppedImages}
            className="h-8 rounded-lg px-2.5 inline-flex items-center justify-center border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 transition-colors"
            title="Descargar imágenes recortadas"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

function DocumentTableCell({
  item,
  projectCode,
  loadProjectDetail,
  onOpenDetail,
}: {
  item?: DashboardDocumentItem;
  projectCode: string;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  onOpenDetail: () => void;
}) {
  if (!item) {
    return <span className="text-sm text-gray-300">—</span>;
  }

  if (!item.present) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
        <Clock className="w-3 h-3" />
        Pendiente
      </span>
    );
  }

  return (
    <div className="space-y-1.5 min-w-[120px]">
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
        <CheckCircle className="w-3 h-3" />
        Recibido
      </div>
      {item.needsManualReview && (
        <div className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
          <AlertTriangle className="w-3 h-3" />
          Revisar
        </div>
      )}
      <DeferredAssetButtons
        projectCode={projectCode}
        loadProjectDetail={loadProjectDetail}
        resolveAssets={(project) => getDocumentAssetsFromProject(project, item.key)}
        onOpenDetail={onOpenDetail}
      />
    </div>
  );
}

function SignedPdfsTableCell({
  projectCode,
  items,
  loadProjectDetail,
}: {
  projectCode: string;
  items: DashboardSignedPdfItem[];
  loadProjectDetail: (projectCode: string) => Promise<any>;
}) {
  if (!items.length) {
    return <span className="text-sm text-gray-300">—</span>;
  }

  return (
    <div className="space-y-2 min-w-[170px]">
      {items.map((item) => (
        <div key={item.key} className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
          <p className="text-[11px] font-semibold text-gray-700 leading-tight">{item.label}</p>
          {item.present ? (
            <div className="mt-2">
              <SignedPdfButtons projectCode={projectCode} item={item} loadProjectDetail={loadProjectDetail} compact />
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-gray-400">Pendiente</p>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusCell({
  allDocs,
  submissionCount,
  energyCertificate,
  warnings,
}: {
  allDocs: DashboardDocumentItem[];
  submissionCount: number;
  energyCertificate?: DashboardEnergyCertificateSummary;
  warnings: import('@/lib/dashboardProject').DashboardWarning[];
}) {
  const pending = allDocs.filter(d => !d.present);
  const allDone = pending.length === 0;

  return (
    <div className="space-y-1.5 min-w-[160px]">
      {allDone ? (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
          <CheckCircle className="w-3.5 h-3.5" /> Completo
        </span>
      ) : (
        <ul className="space-y-1">
          {pending.map(d => (
            <li key={d.key} className="flex items-center gap-1.5 text-xs text-amber-700">
              <Clock className="w-3 h-3 shrink-0" />
              {d.shortLabel || d.label}
            </li>
          ))}
        </ul>
      )}
      {submissionCount > 0 && (
        <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
          <CheckCircle className="w-3 h-3" /> {submissionCount} envío{submissionCount !== 1 ? 's' : ''}
        </div>
      )}
      {energyCertificate && (
        <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
          energyCertificate.status === 'completed'
            ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
            : energyCertificate.status === 'skipped'
              ? 'text-gray-600 bg-gray-50 border-gray-200'
              : 'text-amber-700 bg-amber-50 border-amber-200'
        }`}>
          {energyCertificate.status === 'completed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {energyCertificate.status === 'completed'
            ? 'Certificado energético'
            : energyCertificate.status === 'skipped'
              ? 'Certificado energético omitido'
              : 'Certificado energético pendiente'}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map(w => (
            <li key={w.key} className="flex items-start gap-1 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 leading-snug">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-px text-red-500" />
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ElectricityTableCell({
  pages,
  projectCode,
  loadProjectDetail,
  onOpenDetail,
}: {
  pages: DashboardDocumentItem[];
  projectCode: string;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  onOpenDetail: () => void;
}) {
  const uploaded = pages.filter(p => p.present);
  if (uploaded.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
        <Clock className="w-3 h-3" />
        Pendiente
      </span>
    );
  }

  const manualReview = uploaded.filter((page) => page.needsManualReview).length;

  return (
    <div className="space-y-1.5 min-w-[130px]">
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
        <CheckCircle className="w-3 h-3" />
        {uploaded.length} página{uploaded.length !== 1 ? 's' : ''}
      </div>
      {manualReview > 0 && (
        <div className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
          <AlertTriangle className="w-3 h-3" />
          {manualReview} revisar
        </div>
      )}
      <DeferredAssetButtons
        projectCode={projectCode}
        loadProjectDetail={loadProjectDetail}
        resolveAssets={getElectricityAssetsFromProject}
        onOpenDetail={onOpenDetail}
      />
    </div>
  );
}

type AdminDocType = 'dni-front' | 'dni-back' | 'ibi' | 'electricity-bill';

const ADMIN_DOC_TABS: { key: AdminDocType; label: string }[] = [
  { key: 'dni-front', label: 'DNI frontal' },
  { key: 'dni-back', label: 'DNI trasera' },
  { key: 'ibi', label: 'IBI / Escritura' },
  { key: 'electricity-bill', label: 'Factura luz' },
];

function AdminUploadModal({
  projectCode,
  token,
  loadProjectDetail,
  onClose,
  onRefresh,
}: {
  projectCode: string;
  token: string;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AdminDocType>('dni-front');
  const [status, setStatus] = useState<'idle' | 'extracting' | 'uploading' | 'done' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [project, setProject] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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

  const handleFiles = async (files: File[]) => {
    if (!project) {
      setStatus('error');
      setStatusMsg('No se pudo cargar el expediente.');
      return;
    }

    const hasPdf = files.some((file) => file.type === 'application/pdf');
    setStatus('extracting');
    setStatusMsg(hasPdf
      ? 'Convirtiendo PDF en imágenes...'
      : files.length > 1
        ? 'Preparando imágenes...'
        : 'Preparando imagen...');

    try {
      const { pages: preparedPages, originalPdfs } = await prepareAdminUploadPages(files);
      setStatusMsg('Extrayendo datos con IA...');

      const docTypeMap: Record<AdminDocType, Parameters<typeof extractDocument>[1]> = {
        'dni-front': 'dniFront',
        'dni-back': 'dniBack',
        'ibi': 'ibi',
        'electricity-bill': 'electricity',
      };

      const res = activeTab === 'electricity-bill'
        ? await extractDocumentBatch(preparedPages.map((page) => page.aiDataUrl), 'electricity')
        : await extractDocument(
          preparedPages.length === 1
            ? preparedPages[0].aiDataUrl
            : preparedPages.map((page) => page.aiDataUrl),
          docTypeMap[activeTab]
        );

      if (!res.success || !res.extraction) {
        setStatus('error');
        setStatusMsg(res.message || 'No se pudo extraer el documento.');
        return;
      }

      const extraction = {
        ...res.extraction,
        needsManualReview: res.needsManualReview ?? res.extraction.needsManualReview ?? false,
        confirmedByUser: true,
      };

      const buildPhoto = (page: PreparedAdminPage, index = 0) => ({
        id: `admin-${activeTab}-${Date.now()}-${index}`,
        preview: page.preview,
        timestamp: Date.now(),
        sizeBytes: page.sizeBytes,
      });

      let formDataPatch: any;
      if (activeTab === 'dni-front') {
        formDataPatch = {
          dni: {
            front: { photo: buildPhoto(preparedPages[0]), extraction },
            ...(originalPdfs.length > 0
              ? { originalPdfs: mergeStoredDocumentFiles(project.formData?.dni?.originalPdfs, originalPdfs) }
              : {}),
          },
        };
      } else if (activeTab === 'dni-back') {
        formDataPatch = {
          dni: {
            back: { photo: buildPhoto(preparedPages[0]), extraction },
            ...(originalPdfs.length > 0
              ? { originalPdfs: mergeStoredDocumentFiles(project.formData?.dni?.originalPdfs, originalPdfs) }
              : {}),
          },
        };
      } else if (activeTab === 'ibi') {
        const storedPages = preparedPages.map((page, index) => buildPhoto(page, index));
        formDataPatch = { ibi: { photo: storedPages[0], pages: storedPages, originalPdfs, extraction } };
      } else {
        const existingPages = project.formData?.electricityBill?.pages ?? [];
        formDataPatch = {
          electricityBill: {
            pages: [
              ...existingPages,
              ...preparedPages.map((page, index) => ({
                photo: buildPhoto(page, index),
                extraction,
              })),
            ],
            originalPdfs: mergeStoredDocumentFiles(project.formData?.electricityBill?.originalPdfs, originalPdfs),
          },
        };
      }

      setStatus('uploading');
      setStatusMsg('Guardando en el expediente...');

      const saveRes = await adminUpdateFormData(project.code, formDataPatch, token);
      if (!saveRes.success) {
        setStatus('error');
        setStatusMsg(saveRes.message || 'Error al guardar.');
        return;
      }

      setStatus('done');
      setStatusMsg('Documento guardado correctamente.');
      onRefresh();
    } catch (err) {
      console.error('Admin upload failed:', err);
      setStatus('error');
      setStatusMsg('Error inesperado. Inténtalo de nuevo.');
    }
  };

  const reset = () => {
    setStatus('idle');
    setStatusMsg('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Subir documento — {projectCode}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {detailLoading && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
              <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
              <span className="text-sm text-blue-800">Cargando expediente...</span>
            </div>
          )}

          {!detailLoading && detailError && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <span className="text-sm text-red-800">{detailError}</span>
              </div>
              <button type="button" onClick={onClose} className="btn-secondary w-full text-sm">
                Cerrar
              </button>
            </div>
          )}

          {!detailLoading && !detailError && (
            <>
          <div className="flex gap-1.5 flex-wrap">
            {ADMIN_DOC_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setActiveTab(tab.key); reset(); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === tab.key
                    ? 'bg-eltex-blue text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {status === 'idle' && (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-8 cursor-pointer hover:border-eltex-blue hover:bg-blue-50 transition-colors">
              <Upload className="w-6 h-6 text-gray-400" />
              <span className="text-sm text-gray-500">Haz clic para seleccionar imagen o PDF</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (files.length) handleFiles(files);
                }}
              />
            </label>
          )}

          {(status === 'extracting' || status === 'uploading') && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
              <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
              <span className="text-sm text-blue-800">{statusMsg}</span>
            </div>
          )}

          {status === 'done' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-sm text-emerald-800">{statusMsg}</span>
              </div>
              <button type="button" onClick={reset} className="btn-secondary w-full text-sm">
                Subir otro
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <span className="text-sm text-red-800">{statusMsg}</span>
              </div>
              <button type="button" onClick={reset} className="btn-secondary w-full text-sm">
                Reintentar
              </button>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectDetailModal({
  projectCode,
  token,
  loadProjectDetail,
  onClose,
}: {
  projectCode: string;
  token: string;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  onClose: () => void;
}) {
  const [project, setProject] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const detail = await loadProjectDetail(projectCode);
        if (!cancelled) setProject(detail);
      } catch (err) {
        console.error('Project detail load failed:', err);
        if (!cancelled) setError('No se pudo cargar el expediente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadProjectDetail, projectCode]);

  const summary = useMemo(
    () => (project ? getDashboardProjectSummary(project) : null),
    [project]
  );

  return (
    <div className="fixed inset-0 z-[220] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] font-bold text-eltex-blue bg-eltex-blue-light px-2 py-1 rounded-lg">
                {projectCode}
              </span>
              {project?.productType && <ProductBadge type={project.productType} />}
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {summary?.customerDisplayName || project?.customerName || 'Expediente'}
            </h2>
            <p className="text-sm text-gray-500">
              {summary?.address || 'Sin dirección disponible'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {project && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await downloadProjectZip(project, token);
                  } catch (err) {
                    console.error('Project ZIP download failed:', err);
                    alert('No se pudo descargar el ZIP del expediente.');
                  }
                }}
                className="h-9 rounded-lg px-3 inline-flex items-center gap-2 border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-semibold">Descargar ZIP</span>
              </button>
            )}
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4">
              <Loader2 className="w-5 h-5 text-eltex-blue animate-spin shrink-0" />
              <span className="text-sm text-blue-800">Cargando detalle del expediente...</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span className="text-sm text-red-800">{error}</span>
            </div>
          )}

          {!loading && !error && project && summary && (
            <div className="space-y-6">
              {summary.warnings.length > 0 && (
                <div className="space-y-2">
                  {summary.warnings.map((warning) => (
                    <div
                      key={warning.key}
                      className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700">{warning.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid md:grid-cols-5 gap-3">
                <InfoCard icon={Clock} label="Última actividad" value={formatDate(summary.lastUpdated)} />
                <InfoCard icon={User} label="Asesor" value={project.assessor || '—'} />
                <InfoCard icon={LayoutDashboard} label="Ubicación" value={locationLabel(summary.location)} />
                <InfoCard icon={CheckCircle} label="Envíos" value={String(project.submissionCount || 0)} />
                <InfoCard icon={Phone} label="Teléfono" value={project.phone || '—'} />
              </div>

              <DNIDisplay dni={project.formData?.dni} projectCode={project.code} />
              <IBIDisplay ibi={project.formData?.ibi} projectCode={project.code} />
              <ElectricityDisplay bill={project.formData?.electricityBill} projectCode={project.code} />
              <SignedDocumentsSection project={project} items={summary.signedDocuments} energyCertificate={summary.energyCertificate} />
              <EnergyCertificatePanel project={project} energyCertificate={summary.energyCertificate} />
              <FinalSignaturesPanel signatures={summary.finalSignatures} projectCode={project.code} />
              <DownloadGroupsSection groups={summary.downloadGroups} projectCode={project.code} />
              {summary.photoGroups.map((group) => (
                <PhotoGallery key={group.key} group={group} projectCode={project.code} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectTableRow({
  project,
  summary,
  token,
  loadProjectDetail,
  onRefresh,
}: {
  project: any;
  summary: DashboardProjectSummary;
  token: string;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  onRefresh: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [openingForm, setOpeningForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const documents = summary?.documents ?? [];
  const byKey = new Map(documents.map((item) => [item.key, item]));
  const allDocs = [...documents, ...(summary?.electricityPages ?? [])];

  const handleOpenForm = async () => {
    const popup = window.open('', '_blank');
    setOpeningForm(true);

    try {
      const detail = await loadProjectDetail(project.code);
      if (!detail?.accessToken) {
        throw new Error('PROJECT_TOKEN_MISSING');
      }

      const formUrl = buildProjectUrl(project.code, detail.accessToken, 'assessor');
      if (popup) {
        popup.location.href = formUrl;
      } else {
        window.open(formUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Open project form failed:', err);
      if (popup) popup.close();
      alert('No se pudo abrir el formulario del expediente.');
    } finally {
      setOpeningForm(false);
    }
  };

  return (
    <>
    <tr className="bg-white hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 align-top border-b border-gray-100">
        <div className="space-y-1 text-sm">
          <p className="font-semibold text-gray-900">{formatDate(summary.lastUpdated)}</p>
          <p className="text-xs text-gray-400">Creado {formatDate(project.createdAt)}</p>
        </div>
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100 min-w-[220px]">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-eltex-blue bg-eltex-blue-light px-2 py-1 rounded-lg">
              {project.code}
            </span>
          </div>
          <p className="font-semibold text-gray-900">{summary.customerDisplayName}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <User className="w-3 h-3" />
            {project.assessor || '—'}
          </p>
        </div>
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100 min-w-[170px]">
        <div className="space-y-2">
          <ProductBadge type={project.productType} />
          <p className="text-sm font-medium text-gray-800">{locationLabel(summary.location)}</p>
        </div>
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100 min-w-[260px]">
        <p className="text-sm text-gray-800 leading-relaxed">{summary.address || '—'}</p>
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <DocumentTableCell
          item={byKey.get('dniFront') as DashboardDocumentItem}
          projectCode={project.code}
          loadProjectDetail={loadProjectDetail}
          onOpenDetail={() => setShowDetail(true)}
        />
      </td>
      <td className="px-4 py-3 align-top border-b border-gray-100">
        <DocumentTableCell
          item={byKey.get('dniBack') as DashboardDocumentItem}
          projectCode={project.code}
          loadProjectDetail={loadProjectDetail}
          onOpenDetail={() => setShowDetail(true)}
        />
      </td>
      <td className="px-4 py-3 align-top border-b border-gray-100">
        <DocumentTableCell
          item={byKey.get('ibi') as DashboardDocumentItem}
          projectCode={project.code}
          loadProjectDetail={loadProjectDetail}
          onOpenDetail={() => setShowDetail(true)}
        />
      </td>
      <td className="px-4 py-3 align-top border-b border-gray-100">
        <ElectricityTableCell
          pages={summary.electricityPages}
          projectCode={project.code}
          loadProjectDetail={loadProjectDetail}
          onOpenDetail={() => setShowDetail(true)}
        />
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <SignedPdfsTableCell projectCode={project.code} items={summary.signedDocuments} loadProjectDetail={loadProjectDetail} />
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <StatusCell
          allDocs={allDocs}
          submissionCount={project.submissionCount}
          energyCertificate={summary.energyCertificate}
          warnings={summary.warnings}
        />
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <div className="grid grid-cols-2 gap-1.5 min-w-[180px]">
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            className="col-span-2 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5"
          >
            <Eye className="w-3 h-3" />
            Ver expediente
          </button>
          <button
            type="button"
            onClick={() => { void handleOpenForm(); }}
            disabled={openingForm}
            className="px-2 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 text-center truncate"
          >
            {openingForm ? 'Abriendo...' : 'Formulario'}
          </button>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="px-2 py-2 rounded-lg text-xs font-semibold border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center justify-center gap-1"
          >
            <Upload className="w-3 h-3 shrink-0" />
            Subir docs
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try { await downloadProjectZip(project, token); }
              catch { alert('Error al descargar los archivos del expediente.'); }
              finally { setDownloading(false); }
            }}
            className="col-span-2 px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            {downloading ? 'Descargando...' : 'Descargar ZIP'}
          </button>
        </div>
      </td>
    </tr>
    {showUpload && createPortal(
      <AdminUploadModal
        projectCode={project.code}
        token={token}
        loadProjectDetail={loadProjectDetail}
        onClose={() => setShowUpload(false)}
        onRefresh={onRefresh}
      />,
      document.body
    )}
    {showDetail && createPortal(
      <ProjectDetailModal
        projectCode={project.code}
        token={token}
        loadProjectDetail={loadProjectDetail}
        onClose={() => setShowDetail(false)}
      />,
      document.body
    )}
    </>
  );
}

function ImagePreviewCard({
  title,
  asset,
  projectCode,
  children,
  warning,
}: {
  title: string;
  asset: DashboardAssetItem | null;
  projectCode: string;
  children?: ReactNode;
  warning?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-gray-500">{title}</p>
        {asset && <AssetButtons asset={asset} projectCode={projectCode} />}
      </div>
      {asset ? (
        <DocImage src={asset.dataUrl} alt={asset.label} className="w-full h-40" />
      ) : (
        <div className="w-full h-40 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
          <span className="text-sm text-gray-300">Sin archivo</span>
        </div>
      )}
      {children && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-1">
          {children}
          {warning && (
            <span className="text-orange-600 text-xs flex items-center gap-1 pt-1">
              <AlertTriangle className="w-3 h-3" />
              Revisar manualmente
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function DNIDisplay({ dni, projectCode }: { dni: any; projectCode: string }) {
  if (!dni?.front?.photo && !dni?.back?.photo) return null;

  const frontData = dni.front?.extraction?.extractedData;
  const backData = dni.back?.extraction?.extractedData;
  const frontAsset = dni.front?.photo?.preview ? {
    key: 'dni-front',
    label: 'DNI frontal',
    dataUrl: dni.front.photo.preview,
    mimeType: extensionFromMimeType(undefined, dni.front.photo.preview).startsWith('p') ? 'image/png' : 'image/jpeg',
  } : null;
  const backAsset = dni.back?.photo?.preview ? {
    key: 'dni-back',
    label: 'DNI trasera',
    dataUrl: dni.back.photo.preview,
    mimeType: extensionFromMimeType(undefined, dni.back.photo.preview).startsWith('p') ? 'image/png' : 'image/jpeg',
  } : null;

  // Collect images for autocropper
  const dniImages: string[] = [];
  if (dni.front?.photo?.preview) dniImages.push(dni.front.photo.preview);
  if (dni.back?.photo?.preview) dniImages.push(dni.back.photo.preview);

  return (
    <div className="space-y-3">
      <SectionHeading
        icon={CreditCard}
        label="DNI / NIE"
        actions={dniImages.length > 0 ? (
          <AutocropperButton
            documentType="dni"
            images={dniImages}
            projectCode={projectCode}
          />
        ) : undefined}
      />
      <div className="grid lg:grid-cols-2 gap-4">
        <ImagePreviewCard
          title="Cara frontal"
          asset={frontAsset}
          projectCode={projectCode}
          warning={dni.front?.extraction?.needsManualReview}
        >
          <FieldRow label="Nombre" value={frontData?.fullName} />
          <FieldRow label="DNI / NIE" value={frontData?.dniNumber} />
          <FieldRow label="Nacimiento" value={frontData?.dateOfBirth} />
          <FieldRow label="Válido hasta" value={frontData?.expiryDate} />
          <FieldRow label="Sexo" value={frontData?.sex} />
        </ImagePreviewCard>

        <ImagePreviewCard
          title="Cara trasera"
          asset={backAsset}
          projectCode={projectCode}
          warning={dni.back?.extraction?.needsManualReview}
        >
          <FieldRow label="Domicilio" value={backData?.address} />
          <FieldRow label="Municipio" value={backData?.municipality} />
          <FieldRow label="Provincia" value={backData?.province} />
          <FieldRow label="Lugar de nacimiento" value={backData?.placeOfBirth} />
        </ImagePreviewCard>
      </div>
    </div>
  );
}

export function IBIDisplay({ ibi, projectCode }: { ibi: any; projectCode: string }) {
  const pages = getIbiPages(ibi);
  if (pages.length === 0) return null;

  const data = ibi.extraction?.extractedData;
  const assets = pages
    .filter((page: any) => page?.preview)
    .map((page: any, index: number) => ({
      key: `ibi-${index}`,
      label: `IBI / Escritura${index === 0 ? '' : ` ${index + 1}`}`,
      dataUrl: page.preview,
      mimeType: extensionFromMimeType(undefined, page.preview).startsWith('p') ? 'image/png' : 'image/jpeg',
    }));
  const primaryAsset = assets[0] || null;

  // Collect images for autocropper
  const ibiImages: string[] = assets.map(a => a.dataUrl);

  return (
    <div className="space-y-3">
      <SectionHeading
        icon={FileText}
        label="IBI / Escritura"
        actions={ibiImages.length > 0 ? (
          <AutocropperButton
            documentType="ibi"
            images={ibiImages}
            projectCode={projectCode}
          />
        ) : undefined}
      />
      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
        <div className="space-y-2">
          {assets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {assets.map((asset, index) => (
                <div key={asset.key} className="flex items-center gap-2">
                  {assets.length > 1 && (
                    <span className="text-[11px] font-semibold text-gray-500 min-w-12">
                      {`Pág. ${index + 1}`}
                    </span>
                  )}
                  <AssetButtons asset={asset} projectCode={projectCode} />
                </div>
              ))}
            </div>
          )}
          {primaryAsset ? (
            <DocImage src={primaryAsset.dataUrl} alt={primaryAsset.label} className="w-full h-56" />
          ) : (
            <div className="w-full h-56 rounded-xl border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
              <span className="text-sm text-gray-300">Sin archivo</span>
            </div>
          )}
        </div>
        <div className="bg-gray-50 rounded-xl p-3 space-y-1">
          <FieldRow label="Referencia Catastral" value={data?.referenciaCatastral} />
          <FieldRow label="Titular" value={data?.titular} />
          <FieldRow label="NIF titular" value={data?.titularNif} />
          <FieldRow label="Dirección" value={data?.direccion} />
          <FieldRow label="Código postal" value={data?.codigoPostal} />
          <FieldRow label="Municipio" value={data?.municipio} />
          <FieldRow label="Provincia" value={data?.provincia} />
          <FieldRow label="Ejercicio" value={data?.ejercicio} />
          <FieldRow label="Importe" value={data?.importe} />
          {ibi.extraction?.needsManualReview && (
            <span className="text-orange-600 text-xs flex items-center gap-1 pt-1">
              <AlertTriangle className="w-3 h-3" />
              Revisar manualmente
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ElectricityDisplay({ bill, projectCode }: { bill: any; projectCode: string }) {
  const pages: any[] = bill?.pages ?? [];
  // backward compat: migrate old front/back into pages if needed
  const normalised = pages.length === 0
    ? [bill?.front, bill?.back].filter(Boolean)
    : pages;

  const uploadedPages = normalised.filter((p: any) => p?.photo);
  if (uploadedPages.length === 0) return null;

  // Collect images for autocropper
  const electricityImages: string[] = [];
  uploadedPages.forEach((page: any) => {
    if (page?.photo?.preview) {
      electricityImages.push(page.photo.preview);
    }
  });

  return (
    <div className="space-y-3">
      <SectionHeading
        icon={Zap}
        label={`Factura de electricidad — ${uploadedPages.length} imagen${uploadedPages.length !== 1 ? 'es' : ''}`}
        actions={electricityImages.length > 0 ? (
          <AutocropperButton
            documentType="electricity"
            images={electricityImages}
            projectCode={projectCode}
          />
        ) : undefined}
      />
      <div className="grid lg:grid-cols-2 gap-4">
        {uploadedPages.map((page: any, i: number) => {
          const asset = page?.photo?.preview ? {
            key: `electricity-${i}`,
            label: `Factura luz — pág. ${i + 1}`,
            dataUrl: page.photo.preview,
            mimeType: 'image/jpeg',
          } : null;
          const data = page?.extraction?.extractedData;
          return (
            <ImagePreviewCard
              key={i}
              title={`Imagen ${i + 1}`}
              asset={asset}
              projectCode={projectCode}
              warning={page?.extraction?.needsManualReview}
            >
              <FieldRow label="Titular" value={data?.titular} />
              <FieldRow label="NIF titular" value={data?.nifTitular} />
              <FieldRow label="CUPS" value={data?.cups} />
              {data?.cupsWarning && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-800">{data.cupsWarning}</span>
                </div>
              )}
              <FieldRow label="Potencia (kW)" value={data?.potenciaContratada} />
              <FieldRow label="Tipo fase" value={data?.tipoFase} />
              <FieldRow label="Tarifa" value={data?.tarifaAcceso} />
              <FieldRow label="Comercializadora" value={data?.comercializadora} />
              <FieldRow label="Distribuidora" value={data?.distribuidora} />
              <FieldRow label="Dirección suministro" value={data?.direccionSuministro} />
              <FieldRow label="Código postal" value={data?.codigoPostal} />
              <FieldRow label="Municipio" value={data?.municipio} />
              <FieldRow label="Provincia" value={data?.provincia} />
              <FieldRow label="Fecha factura" value={data?.fechaFactura} />
              <FieldRow label="Periodo facturación" value={data?.periodoFacturacion} />
              <FieldRow label="Importe" value={data?.importe} />
            </ImagePreviewCard>
          );
        })}
      </div>
    </div>
  );
}

export function PhotoGallery({
  group,
  projectCode,
}: {
  group: DashboardAssetGroup;
  projectCode: string;
}) {
  if (!group.items.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500">{group.label}</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {group.items.map((asset) => (
          <div key={asset.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <DocImage src={asset.dataUrl} alt={asset.label} className="w-full h-40" />
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-gray-600 truncate">{asset.label}</p>
              <AssetButtons asset={asset} projectCode={projectCode} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinalSignaturesPanel({
  signatures,
  projectCode,
}: {
  signatures: DashboardAssetItem[];
  projectCode: string;
}) {
  if (!signatures.length) return null;

  return (
    <div className="space-y-3">
      <SectionHeading icon={PenLine} label="Firmas finales" />
      <div className="grid lg:grid-cols-2 gap-4">
        {signatures.map((asset) => (
          <div key={asset.key} className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">{asset.label}</p>
              <AssetButtons asset={asset} projectCode={projectCode} />
            </div>
            <DocImage src={asset.dataUrl} alt={asset.label} className="w-full h-40 bg-white" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SignedDocumentsSection({
  project,
  items,
  energyCertificate,
}: {
  project: any;
  items: DashboardSignedPdfItem[];
  energyCertificate?: DashboardEnergyCertificateSummary;
}) {
  const [ecViewing, setEcViewing] = useState(false);
  const [ecDownloading, setEcDownloading] = useState(false);

  const ecAsset = energyCertificate?.asset ?? null;
  const hasEc = energyCertificate?.status === 'completed';

  if (!items.length && !hasEc) return null;

  return (
    <div className="space-y-3">
      <SectionHeading icon={FileText} label="PDFs firmados" />
      <div className="grid lg:grid-cols-2 gap-4">
        {items.map((item) => (
          <div
            key={item.key}
            className={`rounded-xl border p-4 space-y-3 ${
              item.present
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {item.present
                    ? 'Generado desde la imagen firmada actual'
                    : 'Aún no firmado'}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                item.present
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {item.present ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {item.present ? 'Listo' : 'Pendiente'}
              </span>
            </div>
            {item.present ? (
              <SignedPdfButtons projectCode={project.code} item={item} loadProjectDetail={async () => project} />
            ) : (
              <p className="text-xs text-gray-400">Se habilitará cuando la firma correspondiente exista.</p>
            )}
          </div>
        ))}

        {hasEc && (
          <div className="rounded-xl border p-4 space-y-3 border-emerald-200 bg-emerald-50/70">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">Certificado energético</p>
                <p className="text-xs text-gray-500 mt-1">Generado al completar el cuestionario</p>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                <CheckCircle className="w-3 h-3" />
                Listo
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={ecViewing}
                onClick={async () => {
                  setEcViewing(true);
                  try {
                    const pdfFactory = await buildEnergyCertificatePdfFactory(project);
                    await viewPDFInNewTab(pdfFactory);
                  } catch {
                    alert('No se pudo visualizar el certificado energético.');
                  } finally {
                    setEcViewing(false);
                  }
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Eye className="w-3 h-3" />
                {ecViewing ? 'Abriendo...' : 'Ver PDF'}
              </button>
              <button
                type="button"
                disabled={ecDownloading}
                onClick={async () => {
                  setEcDownloading(true);
                  try {
                    const pdfFactory = await buildEnergyCertificatePdfFactory(project);
                    const blob = await pdfFactory();
                    downloadBlob(blob, `${project.code}_certificado-energetico.pdf`);
                  } catch {
                    alert('No se pudo descargar el certificado energético.');
                  } finally {
                    setEcDownloading(false);
                  }
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-3 h-3" />
                {ecDownloading ? 'Descargando...' : 'Descargar PDF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EnergyCertificatePanel({
  project,
  energyCertificate,
}: {
  project: any;
  energyCertificate: DashboardEnergyCertificateSummary;
}) {
  if (!energyCertificate) return null;

  const asset = energyCertificate.asset || null;

  return (
    <div className="space-y-3">
      <SectionHeading icon={Sun} label="Certificado energético" />
      <div className={`rounded-xl border p-4 space-y-3 ${
        energyCertificate.status === 'completed'
          ? 'border-emerald-200 bg-emerald-50/70'
          : energyCertificate.status === 'skipped'
            ? 'border-gray-200 bg-gray-50'
            : 'border-amber-200 bg-amber-50/70'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">Estado</p>
            <p className="text-xs text-gray-500 mt-1">
              {energyCertificate.status === 'completed'
                ? 'Documento completado y disponible como PDF'
                : energyCertificate.status === 'skipped'
                  ? 'El cliente lo omitió'
                  : 'Pendiente de completar'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
            energyCertificate.status === 'completed'
              ? 'bg-emerald-100 text-emerald-700'
              : energyCertificate.status === 'skipped'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-amber-100 text-amber-700'
          }`}>
            {energyCertificate.status === 'completed' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {energyCertificate.label}
          </span>
        </div>

        {asset ? (
          <>
            <DocImage src={asset.dataUrl} alt={asset.label} className="w-full h-auto rounded-xl border border-gray-200 bg-white" />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const pdfFactory = await buildEnergyCertificatePdfFactory(project);
                    await viewPDFInNewTab(pdfFactory);
                  } catch (err) {
                    console.error('Energy certificate view failed:', err);
                    alert('No se pudo visualizar el certificado energético.');
                  }
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5"
              >
                <Eye className="w-3 h-3" />
                Ver PDF
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const pdfFactory = await buildEnergyCertificatePdfFactory(project);
                    const blob = await pdfFactory();
                    downloadBlob(blob, `${project.code}_certificado-energetico.pdf`);
                  } catch (err) {
                    console.error('Energy certificate download failed:', err);
                    alert('No se pudo descargar el certificado energético.');
                  }
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center justify-center gap-1.5"
              >
                <Download className="w-3 h-3" />
                Descargar PDF
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500">No hay PDF generado todavía.</p>
        )}
      </div>
    </div>
  );
}

export function DownloadGroupsSection({
  groups,
  projectCode,
}: {
  groups: DashboardAssetGroup[];
  projectCode: string;
}) {
  if (!groups.length) return null;

  return (
    <div className="space-y-3">
      <SectionHeading icon={Download} label="Descargas rápidas" />
      <div className="grid xl:grid-cols-3 gap-4">
        {groups.map((group) => (
          <div key={group.key} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-800">{group.label}</p>
            <div className="mt-3 space-y-2">
              {group.items.map((asset) => (
                <div key={asset.key} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <span className="text-xs text-gray-700 truncate">{asset.label}</span>
                  <AssetButtons asset={asset} projectCode={projectCode} compact />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'submitted' | 'pending'>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const detailCacheRef = useRef<Map<string, any>>(new Map());

  const handleLogout = useCallback(async () => {
    await dashboardLogout(token);
    sessionStorage.removeItem('dashboard_token');
    onLogout();
  }, [onLogout, token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      detailCacheRef.current.clear();
      const response = await fetchDashboard(token);
      if (response.success && response.projects) {
        setProjects(response.projects);
      } else if (response.error === 'UNAUTHORIZED') {
        await handleLogout();
      } else {
        setError('No se pudieron cargar los datos.');
      }
    } catch (err) {
      console.error('Dashboard load failed:', err);
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }, [handleLogout, token]);

  const loadProjectDetail = useCallback(async (projectCode: string) => {
    const cached = detailCacheRef.current.get(projectCode);
    if (cached) return cached;

    const response = await fetchDashboardProject(projectCode, token);
    if (response.success && response.project) {
      detailCacheRef.current.set(projectCode, response.project);
      return response.project;
    }

    if (response.error === 'UNAUTHORIZED') {
      await handleLogout();
      throw new Error('UNAUTHORIZED');
    }

    throw new Error(response.message || response.error || 'PROJECT_LOAD_FAILED');
  }, [handleLogout, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectsWithSummary = useMemo(
    () => projects.map((project) => ({ project, summary: project.summary as DashboardProjectSummary })),
    [projects]
  );

  const filtered = useMemo(() => projectsWithSummary
    .filter(({ project, summary }) => {
      if (filter === 'submitted' && project.submissionCount === 0) return false;
      if (filter === 'pending' && project.submissionCount > 0) return false;

      if (!deferredSearch.trim()) return true;

      const query = deferredSearch.toLowerCase();

      return (
        project.customerName?.toLowerCase().includes(query)
        || (summary?.customerDisplayName ?? '').toLowerCase().includes(query)
        || project.code?.toLowerCase().includes(query)
        || project.phone?.includes(query)
        || project.assessor?.toLowerCase().includes(query)
        || (summary?.address || '').toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      const leftDate = new Date(left.summary?.lastUpdated || 0).getTime();
      const rightDate = new Date(right.summary?.lastUpdated || 0).getTime();
      return rightDate - leftDate;
    }), [deferredSearch, filter, projectsWithSummary]);

  const totalSubmitted = projects.filter((project) => project.submissionCount > 0).length;
  const totalPending = projects.length - totalSubmitted;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/eltex-logo.png" alt="Eltex" className="h-7 object-contain" />
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-4 h-4 text-eltex-blue" />
              <h1 className="font-bold text-gray-900">Dashboard</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              title="Actualizar"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => downloadCSV(token)}
              className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex items-center gap-1.5 text-xs text-gray-500 font-medium px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-5">
        <div className="grid md:grid-cols-3 gap-3">
          {[
            { label: 'Total proyectos', value: projects.length, icon: Users, color: 'text-eltex-blue', bg: 'bg-eltex-blue-light' },
            { label: 'Enviados', value: totalSubmitted, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Pendientes', value: totalPending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nombre, código, teléfono, asesor o dirección..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="form-input pl-10 py-2.5 text-sm w-full"
            />
          </div>

          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shrink-0">
            {(['all', 'submitted', 'pending'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === item
                    ? 'bg-eltex-blue text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item === 'all' ? 'Todos' : item === 'submitted' ? 'Enviados' : 'Pendientes'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 rounded-xl p-4 text-sm text-red-600 border border-red-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-eltex-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <ImageIcon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No hay proyectos que coincidan.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
                  <table className="min-w-[1900px] w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3 font-semibold">Last updated</th>
                        <th className="px-4 py-3 font-semibold">Project / customer</th>
                        <th className="px-4 py-3 font-semibold">Product / region</th>
                        <th className="px-4 py-3 font-semibold">Address</th>
                        <th className="px-4 py-3 font-semibold">DNI front</th>
                        <th className="px-4 py-3 font-semibold">DNI back</th>
                        <th className="px-4 py-3 font-semibold">IBI / escritura</th>
                        <th className="px-4 py-3 font-semibold">Factura luz</th>
                        <th className="px-4 py-3 font-semibold">Signed PDFs</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(({ project, summary }) => (
                        <ProjectTableRow
                          key={project.code}
                          project={project}
                          summary={summary}
                          token={token}
                          loadProjectDetail={loadProjectDetail}
                          onRefresh={load}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

              </>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p className="text-center text-xs text-gray-400 pb-4">
            Mostrando {filtered.length} de {projects.length} proyectos
          </p>
        )}
      </div>
    </div>
  );
}
