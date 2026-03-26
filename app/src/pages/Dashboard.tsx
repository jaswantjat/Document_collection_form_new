/* eslint-disable @typescript-eslint/no-explicit-any */

import { useDeferredValue, useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  Building2,
  Calendar,
  Camera,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  PenLine,
  Phone,
  RefreshCw,
  Search,
  Sun,
  Thermometer,
  User,
  Users,
  Zap,
} from 'lucide-react';
import { dashboardLogout, fetchDashboard, generateImagePDF } from '@/services/api';
import {
  getDashboardProjectSummary,
  getDashboardElectricityPages,
  type DashboardAssetGroup,
  type DashboardAssetItem,
  type DashboardDocumentItem,
  type DashboardSignedPdfItem,
} from '@/lib/dashboardProject';
import { getStoredRenderedDocument, renderSignedDocumentOverlay } from '@/lib/signedDocumentOverlays';

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    window.open(dataUrl, '_blank', 'noopener,noreferrer');
  }
}

async function viewPDFInNewTab(pdfFactory: () => Promise<Blob>) {
  const previewWindow = window.open('', '_blank', 'noopener,noreferrer');

  try {
    const blob = await pdfFactory();
    const url = URL.createObjectURL(blob);
    if (previewWindow) {
      previewWindow.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } catch (err) {
    console.error('View PDF failed:', err);
    if (previewWindow) previewWindow.close();
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
  const overlay = getStoredRenderedDocument(project, item.key)?.imageDataUrl
    || await renderSignedDocumentOverlay(project, item.key);
  return () => generateImagePDF(overlay, item.filename);
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

function SectionHeading({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
      <div className="w-6 h-6 rounded-md bg-eltex-blue-light flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-eltex-blue" />
      </div>
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">{label}</p>
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

function InfoCard({
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

function QuickStat({
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

function SignedPdfButtons({
  project,
  item,
  compact = false,
}: {
  project: any;
  item: DashboardSignedPdfItem;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState<'view' | 'download' | null>(null);
  const baseClasses = compact
    ? 'h-7 w-7 rounded-md'
    : 'h-8 rounded-lg px-2.5';

  const run = async (mode: 'view' | 'download') => {
    setLoading(mode);
    try {
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

function DocumentTableCell({
  item,
}: {
  project: any;
  item: DashboardDocumentItem;
}) {
  if (!item?.present || !item?.dataUrl) {
    return <span className="text-sm text-gray-300">—</span>;
  }
  return (
    <div className="space-y-1">
      <img
        src={item.dataUrl}
        alt={item.label}
        className="w-12 h-14 rounded object-cover border border-gray-200 cursor-zoom-in hover:opacity-80 transition-opacity"
        onClick={() => window.open(item.dataUrl!, '_blank')}
      />
      {item.needsManualReview && (
        <div className="flex items-center gap-1 text-[10px] text-orange-600 font-medium">
          <AlertTriangle className="w-3 h-3" /> Revisar
        </div>
      )}
    </div>
  );
}

function SignedPdfsTableCell({
  project,
  items,
}: {
  project: any;
  items: DashboardSignedPdfItem[];
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
              <SignedPdfButtons project={project} item={item} compact />
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
}: {
  allDocs: DashboardDocumentItem[];
  submissionCount: number;
}) {
  const pending = allDocs.filter(d => !d.present);
  const allDone = pending.length === 0;

  return (
    <div className="space-y-1.5 min-w-[140px]">
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
    </div>
  );
}

function ElectricityTableCell({ pages }: { project: any; pages: DashboardDocumentItem[] }) {
  const uploaded = pages.filter(p => p.present);
  if (uploaded.length === 0) {
    return <span className="text-sm text-gray-300">—</span>;
  }
  return (
    <div className="flex gap-1.5 flex-wrap">
      {uploaded.map((page) => page.dataUrl && (
        <img
          key={page.key}
          src={page.dataUrl}
          alt={page.label}
          className="w-12 h-14 rounded object-cover border border-gray-200 cursor-zoom-in hover:opacity-80 transition-opacity"
          onClick={() => window.open(page.dataUrl!, '_blank')}
          title={page.label}
        />
      ))}
    </div>
  );
}

function ProjectTableRow({
  project,
  token,
}: {
  project: any;
  token: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const summary = getDashboardProjectSummary(project);
  const documents = summary.documents;
  const byKey = new Map(documents.map((item) => [item.key, item]));
  const allDocs = [...documents, ...summary.electricityPages];

  return (
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

      <td className="px-4 py-3 align-top border-b border-gray-100"><DocumentTableCell project={project} item={byKey.get('dniFront') as DashboardDocumentItem} /></td>
      <td className="px-4 py-3 align-top border-b border-gray-100"><DocumentTableCell project={project} item={byKey.get('dniBack') as DashboardDocumentItem} /></td>
      <td className="px-4 py-3 align-top border-b border-gray-100"><DocumentTableCell project={project} item={byKey.get('ibi') as DashboardDocumentItem} /></td>
      <td className="px-4 py-3 align-top border-b border-gray-100">
        <ElectricityTableCell project={project} pages={summary.electricityPages} />
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <SignedPdfsTableCell project={project} items={summary.signedDocuments} />
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <StatusCell allDocs={allDocs} submissionCount={project.submissionCount} />
      </td>

      <td className="px-4 py-3 align-top border-b border-gray-100">
        <div className="flex flex-col gap-2 min-w-[130px]">
          <a
            href={`/?code=${project.code}${project.accessToken ? `&token=${project.accessToken}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 text-center"
          >
            Abrir formulario
          </a>
          <button
            type="button"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              try { await downloadProjectZip(project, token); }
              catch { alert('Error al descargar los archivos del expediente.'); }
              finally { setDownloading(false); }
            }}
            className="px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            {downloading ? 'Descargando...' : 'Descargar ZIP'}
          </button>
        </div>
      </td>
    </tr>
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

function DNIDisplay({ dni, projectCode }: { dni: any; projectCode: string }) {
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

  return (
    <div className="space-y-3">
      <SectionHeading icon={CreditCard} label="DNI / NIE" />
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

function IBIDisplay({ ibi, projectCode }: { ibi: any; projectCode: string }) {
  if (!ibi?.photo) return null;

  const data = ibi.extraction?.extractedData;
  const asset = ibi.photo?.preview ? {
    key: 'ibi',
    label: 'IBI / Escritura',
    dataUrl: ibi.photo.preview,
    mimeType: extensionFromMimeType(undefined, ibi.photo.preview).startsWith('p') ? 'image/png' : 'image/jpeg',
  } : null;

  return (
    <div className="space-y-3">
      <SectionHeading icon={FileText} label="IBI / Escritura" />
      <div className="grid lg:grid-cols-[220px_1fr] gap-4">
        <div className="space-y-2">
          {asset && <AssetButtons asset={asset} projectCode={projectCode} />}
          {asset ? (
            <DocImage src={asset.dataUrl} alt={asset.label} className="w-full h-56" />
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

function ElectricityDisplay({ bill, projectCode }: { bill: any; projectCode: string }) {
  const pages: any[] = bill?.pages ?? [];
  // backward compat: migrate old front/back into pages if needed
  const normalised = pages.length === 0
    ? [bill?.front, bill?.back].filter(Boolean)
    : pages;

  const uploadedPages = normalised.filter((p: any) => p?.photo);
  if (uploadedPages.length === 0) return null;

  return (
    <div className="space-y-3">
      <SectionHeading icon={Zap} label={`Factura de electricidad — ${uploadedPages.length} imagen${uploadedPages.length !== 1 ? 'es' : ''}`} />
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

function PhotoGallery({
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

function FinalSignaturesPanel({
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

function SignedDocumentsSection({
  project,
  items,
}: {
  project: any;
  items: DashboardSignedPdfItem[];
}) {
  if (!items.length) return null;

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
              <SignedPdfButtons project={project} item={item} />
            ) : (
              <p className="text-xs text-gray-400">Se habilitará cuando la firma correspondiente exista.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DownloadGroupsSection({
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

function ProjectDetailPanel({
  project,
  token,
}: {
  project: any;
  token: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const summary = getDashboardProjectSummary(project);
  const formData = project.formData;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-eltex-blue bg-eltex-blue-light px-2.5 py-1 rounded-lg">
                {project.code}
              </span>
              <ProductBadge type={project.productType} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{summary.customerDisplayName}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{project.phone || '—'}</span>
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{project.email || '—'}</span>
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{project.assessor || '—'}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`/?code=${project.code}${project.accessToken ? `&token=${project.accessToken}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              Abrir formulario
            </a>
            <button
              type="button"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try { await downloadProjectZip(project, token); }
                catch { alert('Error al descargar los archivos del expediente.'); }
                finally { setDownloading(false); }
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Download className="w-3 h-3" />
              {downloading ? 'Descargando...' : 'Descargar ZIP'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <InfoCard icon={Calendar} label="Última actualización" value={formatDate(summary.lastUpdated)} />
          <InfoCard icon={MapPin} label="Región" value={locationLabel(summary.location)} />
          <InfoCard icon={MapPin} label="Dirección" value={summary.address || '—'} />
          <InfoCard
            icon={CheckCircle}
            label="Estado"
            value={project.submissionCount > 0 ? `${project.submissionCount} envío${project.submissionCount !== 1 ? 's' : ''}` : 'Pendiente'}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickStat
            label="documentos"
            value={`${summary.counts.documentsPresent}/${summary.counts.documentsTotal}`}
            tone={summary.counts.manualReview ? 'orange' : 'blue'}
          />
          <QuickStat
            label="formularios firmados"
            value={`${summary.counts.signedFormsPresent}/${summary.counts.signedFormsTotal}`}
            tone="green"
          />
          <QuickStat
            label="PDFs disponibles"
            value={`${summary.counts.pdfsAvailable}/${summary.counts.pdfsTotal}`}
            tone={summary.counts.pdfsAvailable ? 'green' : 'gray'}
          />
          <QuickStat
            label="firmas finales"
            value={`${summary.counts.finalSignaturesPresent}/${summary.counts.finalSignaturesTotal}`}
            tone="gray"
          />
        </div>
      </div>

      <div className="p-5 space-y-6 bg-gradient-to-b from-gray-50/60 to-white">
        {!formData && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
            Este proyecto aún no tiene datos guardados.
          </div>
        )}

        {formData && (
          <>
            <DNIDisplay dni={formData.dni} projectCode={project.code} />
            <IBIDisplay ibi={formData.ibi} projectCode={project.code} />
            <ElectricityDisplay bill={formData.electricityBill} projectCode={project.code} />
            <SignedDocumentsSection project={project} items={summary.signedDocuments} />

            {summary.photoGroups.length > 0 && (
              <div className="space-y-4">
                <SectionHeading icon={Camera} label="Fotos del inmueble" />
                {summary.photoGroups.map((group) => (
                  <PhotoGallery key={group.key} group={group} projectCode={project.code} />
                ))}
              </div>
            )}

            <FinalSignaturesPanel signatures={summary.finalSignatures} projectCode={project.code} />
            <DownloadGroupsSection groups={summary.downloadGroups} projectCode={project.code} />
          </>
        )}

        {project.submissionCount > 0 && project.latestSubmission && (
          <div className="space-y-2">
            <SectionHeading icon={CheckCircle} label="Último envío" />
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs space-y-1">
              <div className="flex gap-2">
                <span className="text-emerald-600 font-semibold">ID:</span>
                <span className="font-mono text-emerald-700">{project.latestSubmission.id}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-emerald-600 font-semibold">Fecha:</span>
                <span className="text-emerald-700">{formatDate(project.latestSubmission.timestamp)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-emerald-600 font-semibold">Origen:</span>
                <span className="text-emerald-700 capitalize">{project.latestSubmission.source}</span>
              </div>
            </div>
          </div>
        )}
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

  const handleLogout = async () => {
    await dashboardLogout(token);
    sessionStorage.removeItem('dashboard_token');
    onLogout();
  };

  const load = async () => {
    setLoading(true);
    setError('');

    try {
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
  };

  const runInitialLoad = useEffectEvent(async () => {
    await load();
  });

  useEffect(() => {
    void runInitialLoad();
  }, [token]);

  const filtered = [...projects]
    .filter((project) => {
      if (filter === 'submitted' && project.submissionCount === 0) return false;
      if (filter === 'pending' && project.submissionCount > 0) return false;

      if (!deferredSearch.trim()) return true;

      const query = deferredSearch.toLowerCase();
      const summary = getDashboardProjectSummary(project);

      return (
        project.customerName?.toLowerCase().includes(query)
        || summary.customerDisplayName.toLowerCase().includes(query)
        || project.code?.toLowerCase().includes(query)
        || project.phone?.includes(query)
        || project.assessor?.toLowerCase().includes(query)
        || (summary.address || '').toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      const leftDate = new Date(getDashboardProjectSummary(left).lastUpdated || 0).getTime();
      const rightDate = new Date(getDashboardProjectSummary(right).lastUpdated || 0).getTime();
      return rightDate - leftDate;
    });

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
                      {filtered.map((project) => (
                        <ProjectTableRow
                          key={project.code}
                          project={project}
                          token={token}
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
