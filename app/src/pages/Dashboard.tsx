/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Archive,
  Building2,
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
  Trash2,
  X,
  Zap,
  Scissors,
} from 'lucide-react';
import {
  dashboardLogout,
  deleteProject,
  fetchDashboard,
  fetchDashboardProject,
  updateDashboardProjectAssessor,
  type DashboardProjectActionResult,
} from '@/services/api';
import {
  type DashboardAssetGroup,
  type DashboardAssetItem,
  type DashboardEnergyCertificateSummary,
  type DashboardSignedPdfItem,
  type DashboardProjectSummary,
  type DashboardStatusItem,
  getDashboardProjectSummary,
} from '@/lib/dashboardProject';
import { approvedAssessors } from '@/lib/approvedAssessors';
import {
  formatDate, locationLabel, languageLabel,
  downloadBlob, buildProjectUrl,
  downloadDataUrlAsset, openDataUrlInNewTab,
  getDocumentAssetsFromProject,
  getElectricityAssetsFromProject,
  getIbiPages,
  viewPDFInNewTab, downloadCSV,
  buildSignedPdfFactory, buildEnergyCertificatePdfFactory,
} from '@/lib/dashboardHelpers';
import { downloadDashboardStatusGroup, downloadProjectZip } from '@/lib/dashboardExport';
import { DashboardProjectManagementCard } from '@/components/dashboard/DashboardProjectManagementCard';
import { ProjectDetailUploadWorkspace } from '@/pages/dashboard/ProjectDetailUploadWorkspace';

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

function isDashboardAuthError(error: string | undefined) {
  return error === 'UNAUTHORIZED' || error === 'SESSION_EXPIRED';
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

export const DeferredAssetButtons = React.memo(function DeferredAssetButtons({
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
  const loadProjectDetailRef = useRef(loadProjectDetail);
  const resolveAssetsRef = useRef(resolveAssets);

  useEffect(() => {
    loadProjectDetailRef.current = loadProjectDetail;
  }, [loadProjectDetail]);

  useEffect(() => {
    resolveAssetsRef.current = resolveAssets;
  }, [resolveAssets]);

  const run = useCallback(async (mode: 'view' | 'download') => {
    setLoading(mode);
    try {
      const project = await loadProjectDetailRef.current(projectCode);
      const assets = resolveAssetsRef.current(project);
      const primaryAsset = assets[0];

      if (!primaryAsset) {
        onOpenDetail?.();
        return;
      }

      if (mode === 'view') {
        openDataUrlInNewTab(primaryAsset.dataUrl);
      } else if (assets.length === 1) {
        downloadDataUrlAsset(primaryAsset, projectCode);
      } else {
        onOpenDetail?.();
      }
    } finally {
      setLoading(null);
    }
  }, [onOpenDetail, projectCode]);

  return (
    <div data-testid="asset-action-buttons" className="flex items-center gap-1.5">
      <button
        type="button"
        data-testid="view-asset-btn"
        aria-busy={loading === 'view'}
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('view');
        }}
        className="h-7 w-7 rounded-md inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Ver archivo"
      >
        {loading === 'view'
          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        data-testid="download-asset-btn"
        aria-busy={loading === 'download'}
        disabled={loading !== null}
        onClick={(event) => {
          event.stopPropagation();
          void run('download');
        }}
        className="h-7 w-7 rounded-md inline-flex items-center justify-center border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Descargar archivo"
      >
        {loading === 'download'
          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          : <Download className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
});

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

function StatusDownloadButton({
  item,
  project,
  loadProjectDetail,
}: {
  item: Pick<DashboardStatusItem, 'key' | 'label' | 'downloadCount'>;
  project: any;
  loadProjectDetail: (projectCode: string) => Promise<any>;
}) {
  const [downloading, setDownloading] = useState(false);
  const canDownload = (item.downloadCount ?? 0) > 0;
  const Icon = (item.downloadCount ?? 0) > 1 ? Archive : Download;

  if (!canDownload) return null;

  return (
    <button
      type="button"
      data-testid={`status-download-${item.key}`}
      title={`Descargar ${item.label}`}
      disabled={downloading}
      onClick={async () => {
        setDownloading(true);
        try {
          await downloadDashboardStatusGroup(project, item.key, { loadProjectDetail });
        } catch (err) {
          console.error('Status document download failed:', err);
          alert('No se pudo descargar este documento.');
        } finally {
          setDownloading(false);
        }
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/70 bg-white/85 text-gray-700 shadow-sm hover:bg-white disabled:opacity-50"
    >
      {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}

function EnergyCertificateStatusBadge({
  energyCertificate,
  project,
  loadProjectDetail,
}: {
  energyCertificate: DashboardEnergyCertificateSummary;
  project: any;
  loadProjectDetail: (projectCode: string) => Promise<any>;
}) {
  const [downloading, setDownloading] = useState(false);
  const completed = energyCertificate.status === 'completed';

  return (
    <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
      completed
        ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
        : energyCertificate.status === 'skipped'
          ? 'text-gray-600 bg-gray-50 border-gray-200'
          : 'text-amber-700 bg-amber-50 border-amber-200'
    }`}>
      {completed ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {completed
        ? 'Certificado energético'
        : energyCertificate.status === 'skipped'
          ? 'Certificado energético omitido'
          : 'Certificado energético pendiente'}
      {completed && (
        <button
          type="button"
          data-testid="status-download-energy-certificate"
          title="Descargar Certificado energético"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            try {
              await downloadDashboardStatusGroup(project, 'energy-certificate', { loadProjectDetail });
            } catch (err) {
              console.error('Energy certificate status download failed:', err);
              alert('No se pudo descargar el certificado energético.');
            } finally {
              setDownloading(false);
            }
          }}
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-700 disabled:opacity-50"
        >
          {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

function StatusCell({
  items,
  submissionCount,
  energyCertificate,
  warnings,
  project,
  loadProjectDetail,
}: {
  items: DashboardStatusItem[];
  submissionCount: number;
  energyCertificate?: DashboardEnergyCertificateSummary;
  warnings: import('@/lib/dashboardProject').DashboardWarning[];
  project: any;
  loadProjectDetail: (projectCode: string) => Promise<any>;
}) {
  const toneClasses: Record<DashboardStatusItem['tone'], string> = {
    success: 'border-emerald-200 bg-emerald-50/80 text-emerald-800',
    pending: 'border-amber-200 bg-amber-50/80 text-amber-800',
    warning: 'border-orange-200 bg-orange-50/80 text-orange-800',
    muted: 'border-gray-200 bg-gray-50 text-gray-700',
  };

  return (
    <div className="space-y-2 min-w-[280px]">
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.key}
            className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-xs ${toneClasses[item.tone]}`}
          >
            <span className="font-medium text-gray-800">{item.label}</span>
            <span className="flex items-center gap-1.5">
              <span className="font-semibold whitespace-nowrap">{item.stateLabel}</span>
              <StatusDownloadButton item={item} project={project} loadProjectDetail={loadProjectDetail} />
            </span>
          </li>
        ))}
      </ul>
      {submissionCount > 0 && (
        <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
          <CheckCircle className="w-3 h-3" /> {submissionCount} envío{submissionCount !== 1 ? 's' : ''}
        </div>
      )}
      {energyCertificate && (
        <EnergyCertificateStatusBadge
          energyCertificate={energyCertificate}
          project={project}
          loadProjectDetail={loadProjectDetail}
        />
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

function ProjectDetailModal({
  projectCode,
  token,
  loadProjectDetail,
  onRefresh,
  onClose,
}: {
  projectCode: string;
  token: string;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  onRefresh: () => Promise<void> | void;
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

  const refreshProject = useCallback(async () => {
    await onRefresh();
    const detail = await loadProjectDetail(projectCode);
    setProject(detail);
  }, [loadProjectDetail, onRefresh, projectCode]);

  return (
    <>
    <div className="fixed inset-0 z-[220] bg-black/60 flex items-center justify-center p-4" data-testid="project-detail-modal" onClick={onClose}>
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
                data-testid="download-zip-btn"
                onClick={async () => {
                  try {
                    await downloadProjectZip(project, { loadProjectDetail, token });
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

              <div className="grid md:grid-cols-3 gap-3">
                <InfoCard icon={User} label="Nombre" value={summary.firstName || '—'} />
                <InfoCard icon={Users} label="Apellidos" value={summary.lastName || '—'} />
                <InfoCard icon={Zap} label="Idioma del navegador" value={languageLabel(summary.customerLanguage)} />
              </div>

              <CompanyDisplay representation={project.formData?.representation} />
              <ProjectDetailUploadWorkspace
                project={project}
                token={token}
                onRefresh={refreshProject}
              />
              <DNIDisplay project={project} />
              <IBIDisplay project={project} />
              <ElectricityDisplay project={project} />
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
    </>
  );
}

function AssessorCell({
  project,
  token,
  onSaved,
}: {
  project: any;
  token: string;
  onSaved: (project: any) => void;
}) {
  const [value, setValue] = useState(project.assessor || '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setValue(project.assessor || '');
  }, [project.assessor]);

  const saveAssessor = async (nextAssessor: string) => {
    const previous = value;
    setValue(nextAssessor);
    setStatus('saving');
    try {
      const response = await updateDashboardProjectAssessor(project.code, nextAssessor, token);
      if (!response.success) throw new Error(response.message || 'No se pudo guardar el asesor.');
      onSaved(response.project ?? { code: project.code, assessor: nextAssessor, assessorId: nextAssessor });
      setStatus('saved');
    } catch (err) {
      console.error('Assessor reassignment failed:', err);
      setValue(previous);
      setStatus('error');
    }
  };

  return (
    <div className="space-y-1 min-w-[170px]">
      <select
        data-testid="dashboard-assessor-select"
        value={value}
        disabled={status === 'saving'}
        onChange={(event) => { void saveAssessor(event.target.value); }}
        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-semibold text-gray-900 shadow-sm focus:border-eltex-blue focus:outline-none"
      >
        {approvedAssessors.map((assessor) => (
          <option key={assessor} value={assessor}>
            {assessor}
          </option>
        ))}
      </select>
      <p data-testid="dashboard-assessor-save-status" className="text-[11px] text-gray-500">
        {status === 'saving'
          ? 'Guardando...'
          : status === 'saved'
            ? 'Guardado'
            : status === 'error'
              ? 'No se pudo guardar'
              : 'Asesor asignado'}
      </p>
    </div>
  );
}

const stickyActionsCellClass =
  'sticky right-[110px] z-20 border-b border-l border-gray-100 bg-white px-4 py-3 align-top shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.45)] transition-colors group-hover:bg-gray-50';
const stickyZipCellClass =
  'sticky right-0 z-20 border-b border-l border-gray-100 bg-white px-4 py-3 align-top transition-colors group-hover:bg-gray-50';

function ProjectTableRow({
  project,
  summary,
  token,
  loadProjectDetail,
  onRefresh,
  onAssessorUpdated,
  onDelete,
}: {
  project: any;
  summary: DashboardProjectSummary;
  token: string;
  loadProjectDetail: (projectCode: string) => Promise<any>;
  onRefresh: () => Promise<void> | void;
  onAssessorUpdated: (project: any) => void;
  onDelete: (code: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [openingForm, setOpeningForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [deleteState, setDeleteState] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenForm = async () => {
    const popup = window.open('', '_blank');
    setOpeningForm(true);

    try {
      const detailProject = await loadProjectDetail(project.code);
      const formUrl = buildProjectUrl(project.code, 'assessor', detailProject?.accessToken ?? project.accessToken);
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

  const handleDeleteClick = () => {
    if (deleteState === 'idle') {
      setDeleteState('confirm');
      confirmTimeoutRef.current = setTimeout(() => setDeleteState('idle'), 4000);
    }
  };

  const handleDeleteCancel = () => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setDeleteState('idle');
  };

  const handleDeleteConfirm = async () => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setDeleteState('deleting');
    try {
      const res = await deleteProject(project.code, token);
      if (res.success) {
        onDelete(project.code);
      } else {
        setDeleteState('idle');
        alert(res.message || 'No se pudo eliminar el expediente.');
      }
    } catch {
      setDeleteState('idle');
      alert('Error de conexión al intentar eliminar el expediente.');
    }
  };

  return (
    <>
    <tr className="group bg-white hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 align-top border-b border-gray-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-eltex-blue bg-eltex-blue-light px-2 py-1 rounded-lg">
              {project.code}
            </span>
            <ProductBadge type={project.productType} />
            {summary.isCompany && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-md">
                <Building2 className="w-3 h-3" />
                Empresa
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 truncate">{summary.customerDisplayName}</p>
          {summary.isCompany && summary.companyName && (
            <p className="text-xs text-blue-700 font-medium truncate">{summary.companyName}</p>
          )}
          <p className="text-xs text-gray-500 truncate">{locationLabel(summary.location)}</p>
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{summary.address || 'Sin dirección cargada'}</p>
          <p className="text-[11px] text-gray-400">
            Actualizado {formatDate(summary.lastUpdated)} · Creado {formatDate(project.createdAt)}
          </p>
        </div>
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <AssessorCell project={project} token={token} onSaved={onAssessorUpdated} />
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <StatusCell
          items={summary.statusItems}
          submissionCount={project.submissionCount}
          energyCertificate={summary.energyCertificate}
          warnings={summary.warnings}
          project={project}
          loadProjectDetail={loadProjectDetail}
        />
      </td>

      <td className={stickyActionsCellClass}>
        <div className="grid gap-1.5 min-w-[180px]">
          <button
            type="button"
            data-testid="ver-expediente-btn"
            onClick={() => setShowDetail(true)}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-eltex-blue/15 bg-eltex-blue text-white hover:bg-eltex-blue/90 flex items-center justify-center gap-1.5"
          >
            <Eye className="w-3 h-3" />
            Abrir expediente
          </button>
          <button
            type="button"
            onClick={() => { void handleOpenForm(); }}
            disabled={openingForm}
            className="px-2 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 text-center truncate"
          >
            {openingForm ? 'Abriendo...' : 'Formulario'}
          </button>
          {deleteState === 'idle' && (
            <button
              type="button"
              onClick={handleDeleteClick}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              Eliminar expediente
            </button>
          )}
          {deleteState === 'confirm' && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => { void handleDeleteConfirm(); }}
                className="flex-1 px-2 py-2 rounded-lg text-xs font-bold border border-red-400 bg-red-600 text-white hover:bg-red-700 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Confirmar
              </button>
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="flex-1 px-2 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center"
              >
                Cancelar
              </button>
            </div>
          )}
          {deleteState === 'deleting' && (
            <div className="px-3 py-2 rounded-lg text-xs text-red-500 flex items-center justify-center gap-1.5 border border-red-100 bg-red-50">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Eliminando...
            </div>
          )}
        </div>
      </td>

      <td className={stickyZipCellClass}>
        <button
          type="button"
          data-testid="dashboard-row-download-zip-btn"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            try { await downloadProjectZip(project, { loadProjectDetail, token }); }
            catch { alert('Error al descargar los archivos del expediente.'); }
            finally { setDownloading(false); }
          }}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Download className="w-3 h-3" />
          {downloading ? 'Descargando...' : 'ZIP'}
        </button>
      </td>
    </tr>
    {showDetail && createPortal(
      <ProjectDetailModal
        projectCode={project.code}
        token={token}
        loadProjectDetail={loadProjectDetail}
        onRefresh={onRefresh}
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

export function DNIDisplay({ project }: { project: any }) {
  const dni = project?.formData?.dni;
  const projectCode = project?.code ?? '';
  const frontAsset = getDocumentAssetsFromProject(project || {}, 'dniFront')[0] || null;
  const backAsset = getDocumentAssetsFromProject(project || {}, 'dniBack')[0] || null;

  if (!dni || (!frontAsset && !backAsset)) return null;

  const frontData = dni.front?.extraction?.extractedData;
  const backData = dni.back?.extraction?.extractedData;
  const dniImages = [frontAsset, backAsset]
    .filter((asset): asset is DashboardAssetItem => Boolean(asset?.dataUrl?.startsWith('data:image/')))
    .map((asset) => asset.dataUrl);

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

export function IBIDisplay({ project }: { project: any }) {
  const ibi = project?.formData?.ibi;
  const projectCode = project?.code ?? '';
  const pages = getIbiPages(ibi);
  const assets = getDocumentAssetsFromProject(project || {}, 'ibi');

  if (pages.length === 0 && assets.length === 0) return null;

  const data = ibi?.extraction?.extractedData;
  const primaryAsset = assets[0] || null;
  const ibiImages = assets
    .filter((asset) => asset.dataUrl.startsWith('data:image/'))
    .map((asset) => asset.dataUrl);

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
          {ibi?.extraction?.needsManualReview && (
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

export function CompanyDisplay({ representation }: { representation: any }) {
  if (!representation?.isCompany) return null;

  return (
    <div className="space-y-3">
      <SectionHeading icon={Building2} label="Datos de la empresa" />
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
        <FieldRow label="Nombre empresa" value={representation.companyName} />
        <FieldRow label="NIF empresa" value={representation.companyNIF} />
        <FieldRow label="Dirección" value={representation.companyAddress} />
        <FieldRow label="Municipio" value={representation.companyMunicipality} />
        <FieldRow label="Código postal" value={representation.companyPostalCode} />
      </div>
    </div>
  );
}

export function ElectricityDisplay({ project }: { project: any }) {
  const bill = project?.formData?.electricityBill;
  const projectCode = project?.code ?? '';
  const pages: any[] = bill?.pages ?? [];
  // backward compat: migrate old front/back into pages if needed
  const normalised = pages.length === 0
    ? [bill?.front, bill?.back].filter(Boolean)
    : pages;

  const uploadedPages = normalised.filter((p: any) => p?.photo);
  const assets = getElectricityAssetsFromProject(project || {});
  if (assets.length === 0) return null;

  const electricityImages = assets
    .filter((asset) => asset.dataUrl.startsWith('data:image/'))
    .map((asset) => asset.dataUrl);

  return (
    <div className="space-y-3">
      <SectionHeading
        icon={Zap}
        label={`Factura de electricidad — ${assets.length} imagen${assets.length !== 1 ? 'es' : ''}`}
        actions={electricityImages.length > 0 ? (
          <AutocropperButton
            documentType="electricity"
            images={electricityImages}
            projectCode={projectCode}
          />
        ) : undefined}
      />
      <div className="grid lg:grid-cols-2 gap-4">
        {assets.map((asset, i: number) => {
          const page = uploadedPages[i];
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

  const hasEc = energyCertificate?.status === 'completed';

  if (!items.length && !hasEc) return null;

  return (
    <div className="space-y-3">
      <SectionHeading icon={FileText} label="PDFs firmados" />
      <div className="grid lg:grid-cols-2 gap-4">
        {items.map((item) => {
          const status = item.status ?? (item.present ? 'complete' : 'pending');
          const cardClass =
            status === 'complete' ? 'border-emerald-200 bg-emerald-50/70'
            : status === 'deferred' ? 'border-amber-200 bg-amber-50/60'
            : 'border-gray-200 bg-gray-50';
          const badgeClass =
            status === 'complete' ? 'bg-emerald-100 text-emerald-700'
            : status === 'deferred' ? 'bg-amber-100 text-amber-700'
            : 'bg-gray-100 text-gray-500';
          const badgeIcon =
            status === 'complete' ? <CheckCircle className="w-3 h-3" />
            : status === 'deferred' ? <AlertTriangle className="w-3 h-3" />
            : <Clock className="w-3 h-3" />;
          const badgeLabel =
            status === 'complete' ? 'Listo'
            : status === 'deferred' ? 'Firma diferida'
            : 'Pendiente';
          const subtitle =
            status === 'complete' ? 'Generado desde la imagen firmada actual'
            : status === 'deferred' ? 'El cliente eligió firmar más tarde'
            : 'Aún no firmado';

          return (
            <div key={item.key} className={`rounded-xl border p-4 space-y-3 ${cardClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold shrink-0 ${badgeClass}`}>
                  {badgeIcon}
                  {badgeLabel}
                </span>
              </div>
              {item.present ? (
                <SignedPdfButtons projectCode={project.code} item={item} loadProjectDetail={async () => project} />
              ) : (
                <p className="text-xs text-gray-400">
                  {status === 'deferred'
                    ? 'Disponible cuando el cliente complete la firma pendiente.'
                    : 'Se habilitará cuando la firma correspondiente exista.'}
                </p>
              )}
            </div>
          );
        })}

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
  const [viewing, setViewing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  if (!energyCertificate || energyCertificate.status === 'pending') return null;

  const asset = energyCertificate.asset || null;
  const isCompleted = energyCertificate.status === 'completed';

  return (
    <div className="space-y-3">
      <SectionHeading icon={Sun} label="Certificado energético" />
      <div className={`rounded-xl border p-4 space-y-3 ${
        isCompleted
          ? 'border-emerald-200 bg-emerald-50/70'
          : energyCertificate.status === 'skipped'
            ? 'border-gray-200 bg-gray-50'
            : 'border-amber-200 bg-amber-50/70'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900">Estado</p>
            <p className="text-xs text-gray-500 mt-1">
              {isCompleted
                ? 'Documento completado y disponible como PDF'
                : energyCertificate.status === 'skipped'
                  ? 'El cliente lo omitió'
                  : 'Pendiente de completar'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
            isCompleted
              ? 'bg-emerald-100 text-emerald-700'
              : energyCertificate.status === 'skipped'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-amber-100 text-amber-700'
          }`}>
            {isCompleted ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {energyCertificate.label}
          </span>
        </div>

        {asset && (
          <DocImage src={asset.dataUrl} alt={asset.label} className="w-full h-auto rounded-xl border border-gray-200 bg-white" />
        )}

        {isCompleted && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={viewing}
              onClick={async () => {
                setViewing(true);
                try {
                  const pdfFactory = await buildEnergyCertificatePdfFactory(project);
                  await viewPDFInNewTab(pdfFactory);
                } catch (err) {
                  console.error('Energy certificate view failed:', err);
                  alert('No se pudo visualizar el certificado energético.');
                } finally {
                  setViewing(false);
                }
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Eye className="w-3 h-3" />
              {viewing ? 'Abriendo...' : 'Ver PDF'}
            </button>
            <button
              type="button"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  const pdfFactory = await buildEnergyCertificatePdfFactory(project);
                  const blob = await pdfFactory();
                  downloadBlob(blob, `${project.code}_certificado-energetico.pdf`);
                } catch (err) {
                  console.error('Energy certificate download failed:', err);
                  alert('No se pudo descargar el certificado energético.');
                } finally {
                  setDownloading(false);
                }
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3 h-3" />
              {downloading ? 'Descargando...' : 'Descargar PDF'}
            </button>
          </div>
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
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="block truncate text-xs text-gray-700">{asset.label}</span>
                    {asset.needsManualReview && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700"
                        title="Revisión manual requerida"
                        data-testid="additional-bank-doc-review-badge"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Revisar
                      </span>
                    )}
                  </div>
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
  const [actionResult, setActionResult] = useState<DashboardProjectActionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [assessorFilter, setAssessorFilter] = useState('all');
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
      } else if (isDashboardAuthError(response.error)) {
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

    if (isDashboardAuthError(response.error)) {
      await handleLogout();
      throw new Error(response.error);
    }

    throw new Error(response.message || response.error || 'PROJECT_LOAD_FAILED');
  }, [handleLogout, token]);

  const handleDeleteProject = useCallback((code: string) => {
    detailCacheRef.current.delete(code);
    setProjects((prev) => prev.filter((p) => p.code !== code));
  }, []);

  const handleAssessorUpdated = useCallback((project: any) => {
    detailCacheRef.current.delete(project.code);
    setProjects((prev) => prev.map((item) => (
      item.code === project.code ? { ...item, ...project } : item
    )));
  }, []);

  const handleProjectActionResult = useCallback(async (result: DashboardProjectActionResult) => {
    detailCacheRef.current.delete(result.project.code);
    setActionResult(result);
    setSearch(result.project.code);
    await load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const projectsWithSummary = useMemo(
    () => projects.map((project) => ({ project, summary: getDashboardProjectSummary(project) })),
    [projects]
  );

  const filtered = useMemo(() => projectsWithSummary
    .filter(({ project, summary }) => {
      if (assessorFilter !== 'all' && project.assessor !== assessorFilter) return false;

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
    }), [assessorFilter, deferredSearch, projectsWithSummary]);

  const totalSubmitted = projects.filter((project) => project.submissionCount > 0).length;
  const totalPending = projects.length - totalSubmitted;
  const showInitialLoading = loading && projects.length === 0;

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
              data-testid="dashboard-refresh-btn"
              onClick={() => void load()}
              title="Actualizar"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              data-testid="export-csv-btn"
              onClick={() => downloadCSV(token)}
              className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
            <button
              type="button"
              data-testid="logout-btn"
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

        <DashboardProjectManagementCard
          token={token}
          actionResult={actionResult}
          onActionResult={handleProjectActionResult}
          onUnauthorized={handleLogout}
        />

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

          <label className="shrink-0">
            <span className="sr-only">Filtrar por asesor</span>
            <select
              data-testid="dashboard-assessor-filter"
              value={assessorFilter}
              onChange={(event) => setAssessorFilter(event.target.value)}
              className="form-input min-w-[240px]"
            >
              <option value="all">Todos los asesores</option>
              {approvedAssessors.map((assessor) => (
                <option key={assessor} value={assessor}>
                  {assessor}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="bg-red-50 rounded-xl p-4 text-sm text-red-600 border border-red-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {showInitialLoading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-eltex-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!showInitialLoading && (
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <ImageIcon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No hay proyectos que coincidan.</p>
              </div>
            ) : (
              <>
                <div
                  data-testid="dashboard-table-scroll"
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto"
                >
                  <table className="table-fixed min-w-[1180px] w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3 font-semibold whitespace-nowrap w-[360px]">Expediente / cliente</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap w-[180px]">Asesor</th>
                        <th className="px-4 py-3 font-semibold whitespace-nowrap w-[340px]">Estado</th>
                        <th className="sticky right-[110px] z-30 w-[190px] whitespace-nowrap border-l border-gray-100 bg-gray-50 px-4 py-3 font-semibold shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.45)]">
                          Acciones
                        </th>
                        <th className="sticky right-0 z-30 w-[110px] whitespace-nowrap border-l border-gray-100 bg-gray-50 px-4 py-3 font-semibold">
                          ZIP
                        </th>
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
                          onAssessorUpdated={handleAssessorUpdated}
                          onDelete={handleDeleteProject}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

              </>
            )}
          </div>
        )}

        {!showInitialLoading && filtered.length > 0 && (
          <p className="text-center text-xs text-gray-400 pb-4">
            Mostrando {filtered.length} de {projects.length} proyectos
          </p>
        )}
      </div>
    </div>
  );
}
