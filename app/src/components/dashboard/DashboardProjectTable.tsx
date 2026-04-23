import { createPortal } from 'react-dom';
import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle,
  Clock,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import {
  deleteProject,
  type DashboardProjectRecord,
} from '@/services/api';
import type {
  DashboardAssetItem,
  DashboardDocumentItem,
  DashboardEnergyCertificateSummary,
  DashboardProjectSummary,
  DashboardSignedPdfItem,
  DashboardWarning,
} from '@/lib/dashboardProject';
import { type DashboardProgressState } from '@/lib/dashboardProgress';
import {
  buildProjectUrl,
  locationLabel,
  formatDate,
  getTableDniAssetsFromProject,
  getTableDocumentAssetsFromProject,
  getTableElectricityAssetsFromProject,
} from '@/lib/dashboardHelpers';
import { downloadProjectZip } from '@/lib/dashboardExport';
import {
  DeferredAssetButtons,
  EcPdfTableButtons,
  SignedPdfButtons,
  type LoadProjectDetail,
} from './DashboardDocumentActions';
import { ProductBadge } from './DashboardShared';
import { ProjectDetailModal } from './DashboardProjectDetailModal';

function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      <Clock className="h-3 w-3" />
      Pendiente
    </span>
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
  loadProjectDetail: LoadProjectDetail;
  onOpenDetail: () => void;
}) {
  if (!item) {
    return <span className="text-sm text-gray-300">—</span>;
  }

  if (!item.present) {
    return <PendingBadge />;
  }

  return (
    <div className="min-w-[120px] space-y-1.5">
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
        <CheckCircle className="h-3 w-3" />
        Recibido
      </div>
      {item.needsManualReview ? (
        <div className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
          <AlertTriangle className="h-3 w-3" />
          Revisar
        </div>
      ) : null}
      <DeferredAssetButtons
        projectCode={projectCode}
        loadProjectDetail={loadProjectDetail}
        resolveAssets={(project) => getTableDocumentAssetsFromProject(project, item.key)}
        onOpenDetail={onOpenDetail}
      />
    </div>
  );
}

function DNITableCell({
  frontItem,
  backItem,
  projectCode,
  loadProjectDetail,
  onOpenDetail,
}: {
  frontItem?: DashboardDocumentItem;
  backItem?: DashboardDocumentItem;
  projectCode: string;
  loadProjectDetail: LoadProjectDetail;
  onOpenDetail: () => void;
}) {
  const hasFront = Boolean(frontItem?.present);
  const hasBack = Boolean(backItem?.present);

  if (!hasFront && !hasBack) {
    return <PendingBadge />;
  }

  return (
    <div className="space-y-1.5">
      <div className="space-y-1">
        {hasFront ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <CheckCircle className="h-2.5 w-2.5" />
              {hasBack ? 'Frontal' : 'Recibido'}
            </span>
            {frontItem?.needsManualReview ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                <AlertTriangle className="h-2.5 w-2.5" />
                Revisar
              </span>
            ) : null}
          </div>
        ) : null}
        {hasBack ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <CheckCircle className="h-2.5 w-2.5" />
              Trasera
            </span>
            {backItem?.needsManualReview ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                <AlertTriangle className="h-2.5 w-2.5" />
                Revisar
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <DeferredAssetButtons
        projectCode={projectCode}
        loadProjectDetail={loadProjectDetail}
        resolveAssets={(project) => getTableDniAssetsFromProject(project, {
          includeFront: hasFront && Boolean(frontItem),
          includeBack: hasBack && Boolean(backItem),
        })}
        onOpenDetail={onOpenDetail}
      />
    </div>
  );
}

function SignedPdfsTableCell({
  projectCode,
  items,
  loadProjectDetail,
  energyCertificate,
}: {
  projectCode: string;
  items: DashboardSignedPdfItem[];
  loadProjectDetail: LoadProjectDetail;
  energyCertificate?: DashboardEnergyCertificateSummary;
}) {
  const hasEc = energyCertificate?.status === 'completed';

  if (!items.length && !hasEc) {
    return <span className="text-sm text-gray-300">—</span>;
  }

  return (
    <div className="min-w-[170px] space-y-2">
      {items.map((item) => {
        const status = item.status ?? (item.present ? 'complete' : 'pending');
        const borderClass =
          status === 'complete'
            ? 'border-emerald-200 bg-emerald-50/60'
            : status === 'deferred'
              ? 'border-amber-200 bg-amber-50/60'
              : 'border-gray-200 bg-gray-50';

        return (
          <div key={item.key} className={`rounded-lg border px-2.5 py-2 ${borderClass}`}>
            <p
              className={`text-[11px] font-semibold leading-tight ${
                status === 'complete'
                  ? 'text-emerald-800'
                  : status === 'deferred'
                    ? 'text-amber-800'
                    : 'text-gray-700'
              }`}
            >
              {item.label}
            </p>
            {item.present ? (
              <div className="mt-2">
                <SignedPdfButtons
                  projectCode={projectCode}
                  item={item}
                  loadProjectDetail={loadProjectDetail}
                  compact
                />
              </div>
            ) : (
              <p
                className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${
                  status === 'deferred' ? 'text-amber-600' : 'text-gray-400'
                }`}
              >
                {status === 'deferred' ? (
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                ) : null}
                {status === 'deferred' ? 'Firma diferida' : 'Pendiente'}
              </p>
            )}
          </div>
        );
      })}
      {hasEc ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2">
          <p className="text-[11px] font-semibold leading-tight text-emerald-800">
            Certificado energético
          </p>
          <EcPdfTableButtons
            projectCode={projectCode}
            loadProjectDetail={loadProjectDetail}
          />
        </div>
      ) : null}
    </div>
  );
}

function StatusCell({
  progressState,
  allDocs,
  submissionCount,
  energyCertificate,
  warnings,
}: {
  progressState: DashboardProgressState;
  allDocs: DashboardDocumentItem[];
  submissionCount: number;
  energyCertificate?: DashboardEnergyCertificateSummary;
  warnings: DashboardWarning[];
}) {
  const pending = allDocs.filter((doc) => !doc.present);
  const progressBadge =
    progressState === 'submitted'
      ? {
          label: 'Enviado',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-600',
          icon: <CheckCircle className="h-3 w-3" />,
        }
      : progressState === 'in-progress'
        ? {
            label: 'En curso',
            className: 'border-blue-200 bg-blue-50 text-blue-700',
            icon: <Upload className="h-3 w-3" />,
          }
        : {
            label: 'Pendiente',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            icon: <Clock className="h-3 w-3" />,
          };

  return (
    <div className="min-w-[160px] space-y-1.5">
      <div
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${progressBadge.className}`}
      >
        {progressBadge.icon}
        {progressBadge.label}
      </div>
      {pending.length === 0 ? (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
          <CheckCircle className="h-3.5 w-3.5" />
          Completo
        </span>
      ) : (
        <ul className="space-y-1">
          {pending.map((doc) => (
            <li
              key={doc.key}
              className="flex items-center gap-1.5 text-xs text-amber-700"
            >
              <Clock className="h-3 w-3 shrink-0" />
              {doc.shortLabel || doc.label}
            </li>
          ))}
        </ul>
      )}
      {submissionCount > 0 ? (
        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
          <CheckCircle className="h-3 w-3" />
          {submissionCount} envío{submissionCount !== 1 ? 's' : ''}
        </div>
      ) : null}
      {energyCertificate ? (
        <div
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
            energyCertificate.status === 'completed'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
              : energyCertificate.status === 'skipped'
                ? 'border-gray-200 bg-gray-50 text-gray-600'
                : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {energyCertificate.status === 'completed' ? (
            <CheckCircle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          {energyCertificate.status === 'completed'
            ? 'Certificado energético'
            : energyCertificate.status === 'skipped'
              ? 'Certificado energético omitido'
              : 'Certificado energético pendiente'}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="space-y-1">
          {warnings.map((warning) => (
            <li
              key={warning.key}
              className="flex items-start gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] leading-snug text-red-700"
            >
              <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-red-500" />
              <span>{warning.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
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
  loadProjectDetail: LoadProjectDetail;
  onOpenDetail: () => void;
}) {
  const uploaded = pages.filter((page) => page.present);
  if (uploaded.length === 0) {
    return <PendingBadge />;
  }

  const manualReview = uploaded.filter((page) => page.needsManualReview).length;

  return (
    <div className="min-w-[130px] space-y-1.5">
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
        <CheckCircle className="h-3 w-3" />
        {uploaded.length} página{uploaded.length !== 1 ? 's' : ''}
      </div>
      {manualReview > 0 ? (
        <div className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
          <AlertTriangle className="h-3 w-3" />
          {manualReview} revisar
        </div>
      ) : null}
      <DeferredAssetButtons
        projectCode={projectCode}
        loadProjectDetail={loadProjectDetail}
        resolveAssets={getTableElectricityAssetsFromProject}
        onOpenDetail={onOpenDetail}
      />
    </div>
  );
}

function AdditionalDocumentsTableCell({ items }: { items: DashboardAssetItem[] }) {
  if (items.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
        <FileText className="h-3 w-3" />
        Sin docs
      </span>
    );
  }

  const manualReview = items.filter((item) => item.needsManualReview).length;
  const firstFilename = items[0]?.filename?.trim() || items[0]?.label || 'Documento adicional';
  const summaryLabel =
    items.length === 1
      ? `1 archivo · ${firstFilename}`
      : `${items.length} archivos · ${firstFilename} +${items.length - 1}`;

  return (
    <div className="max-w-[220px] min-w-0 space-y-1">
      <p
        className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
        title={summaryLabel}
      >
        <CheckCircle className="h-3 w-3 shrink-0" />
        <span className="min-w-0 truncate">{summaryLabel}</span>
      </p>
      {manualReview > 0 ? (
        <div className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
          <AlertTriangle className="h-3 w-3" />
          {manualReview} revisar
        </div>
      ) : null}
    </div>
  );
}

export function ProjectTableRow({
  project,
  summary,
  progressState,
  token,
  loadProjectDetail,
  onRefresh,
  onDelete,
}: {
  project: DashboardProjectRecord;
  summary: DashboardProjectSummary;
  progressState: DashboardProgressState;
  token: string;
  loadProjectDetail: LoadProjectDetail;
  onRefresh: () => void;
  onDelete: (code: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [openingForm, setOpeningForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [deleteState, setDeleteState] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documents = summary.documents ?? [];
  const byKey = new Map(documents.map((item) => [item.key, item]));
  const allDocs = [...documents, ...(summary.electricityPages ?? [])];

  const handleOpenForm = async () => {
    const popup = window.open('', '_blank');
    setOpeningForm(true);

    try {
      const detailProject = await loadProjectDetail(project.code);
      const formUrl = buildProjectUrl(
        project.code,
        'assessor',
        detailProject?.accessToken ?? project.accessToken
      );

      if (popup) {
        popup.location.href = formUrl;
      } else {
        window.open(formUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      console.error('Open project form failed:', err);
      if (popup) {
        popup.close();
      }
      alert('No se pudo abrir el formulario del expediente.');
    } finally {
      setOpeningForm(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
    }

    setDeleteState('deleting');
    try {
      const result = await deleteProject(project.code, token);
      if (result.success) {
        onDelete(project.code);
      } else {
        setDeleteState('idle');
        alert(result.message || 'No se pudo eliminar el expediente.');
      }
    } catch {
      setDeleteState('idle');
      alert('Error de conexión al intentar eliminar el expediente.');
    }
  };

  return (
    <>
      <tr className="bg-white transition-colors hover:bg-gray-50">
        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-gray-900">{formatDate(summary.lastUpdated)}</p>
            <p className="text-xs text-gray-400">Creado {formatDate(project.createdAt)}</p>
          </div>
        </td>

        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-eltex-blue-light px-2 py-1 font-mono text-[11px] font-bold text-eltex-blue">
                {project.code}
              </span>
              {summary.isCompany ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                  <Building2 className="h-3 w-3" />
                  Empresa
                </span>
              ) : null}
            </div>
            <p className="truncate font-semibold text-gray-900">{summary.customerDisplayName}</p>
            {summary.isCompany && summary.companyName ? (
              <p className="truncate text-xs font-medium text-blue-700">
                {summary.companyName}
              </p>
            ) : null}
            <p className="flex items-center gap-1 truncate text-xs text-gray-500">
              <User className="h-3 w-3 shrink-0" />
              {project.assessor || '—'}
            </p>
          </div>
        </td>

        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <div className="space-y-2">
            <ProductBadge type={project.productType} />
            <p className="truncate text-sm font-medium text-gray-800">
              {locationLabel(summary.location)}
            </p>
          </div>
        </td>

        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <p className="line-clamp-3 text-sm leading-relaxed text-gray-800">
            {summary.address || '—'}
          </p>
        </td>

        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <DNITableCell
            frontItem={byKey.get('dniFront') as DashboardDocumentItem | undefined}
            backItem={byKey.get('dniBack') as DashboardDocumentItem | undefined}
            projectCode={project.code}
            loadProjectDetail={loadProjectDetail}
            onOpenDetail={() => setShowDetail(true)}
          />
        </td>
        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <DocumentTableCell
            item={byKey.get('ibi') as DashboardDocumentItem | undefined}
            projectCode={project.code}
            loadProjectDetail={loadProjectDetail}
            onOpenDetail={() => setShowDetail(true)}
          />
        </td>
        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <ElectricityTableCell
            pages={summary.electricityPages}
            projectCode={project.code}
            loadProjectDetail={loadProjectDetail}
            onOpenDetail={() => setShowDetail(true)}
          />
        </td>
        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <AdditionalDocumentsTableCell items={summary.additionalDocuments} />
        </td>
        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <SignedPdfsTableCell
            projectCode={project.code}
            items={summary.signedDocuments}
            loadProjectDetail={loadProjectDetail}
            energyCertificate={summary.energyCertificate}
          />
        </td>
        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <StatusCell
            progressState={progressState}
            allDocs={allDocs}
            submissionCount={project.submissionCount || 0}
            energyCertificate={summary.energyCertificate}
            warnings={summary.warnings}
          />
        </td>
        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <div className="grid min-w-[180px] grid-cols-2 gap-1.5">
            <button
              type="button"
              data-testid="ver-expediente-btn"
              onClick={() => setShowDetail(true)}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-3 w-3" />
              Ver expediente
            </button>
            <button
              type="button"
              onClick={() => void handleOpenForm()}
              disabled={openingForm}
              className="truncate rounded-lg border border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              {openingForm ? 'Abriendo...' : 'Formulario'}
            </button>
            <button
              type="button"
              disabled={downloading}
              onClick={async () => {
                setDownloading(true);
                try {
                  await downloadProjectZip(project, { loadProjectDetail, token });
                } catch {
                  alert('Error al descargar los archivos del expediente.');
                } finally {
                  setDownloading(false);
                }
              }}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              {downloading ? 'Descargando...' : 'Descargar ZIP'}
            </button>
            {deleteState === 'idle' ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteState('confirm');
                  confirmTimeoutRef.current = setTimeout(() => setDeleteState('idle'), 4000);
                }}
                className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar expediente
              </button>
            ) : null}
            {deleteState === 'confirm' ? (
              <div className="col-span-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => void handleDeleteConfirm()}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-400 bg-red-600 px-2 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  <Trash2 className="h-3 w-3" />
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmTimeoutRef.current) {
                      clearTimeout(confirmTimeoutRef.current);
                    }
                    setDeleteState('idle');
                  }}
                  className="flex flex-1 items-center justify-center rounded-lg border border-gray-200 px-2 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            ) : null}
            {deleteState === 'deleting' ? (
              <div className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Eliminando...
              </div>
            ) : null}
          </div>
        </td>
      </tr>
      {showDetail
        ? createPortal(
            <ProjectDetailModal
              projectCode={project.code}
              token={token}
              loadProjectDetail={loadProjectDetail}
              onRefresh={onRefresh}
              onClose={() => setShowDetail(false)}
            />,
            document.body
          )
        : null}
    </>
  );
}
