import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Building2,
  CheckCircle,
  Clock,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  deleteProject,
  updateDashboardProjectAssessor,
  type DashboardProjectRecord,
} from '@/services/api';
import { approvedAssessors } from '@/lib/approvedAssessors';
import type {
  DashboardEnergyCertificateSummary,
  DashboardProjectSummary,
  DashboardWarning,
} from '@/lib/dashboardProject';
import type { DashboardStatusItem } from '@/lib/dashboardStatusItems';
import {
  buildProjectUrl,
  formatDate,
  locationLabel,
} from '@/lib/dashboardHelpers';
import {
  downloadDashboardStatusGroup,
  downloadProjectZip,
} from '@/lib/dashboardExport';
import { type LoadProjectDetail } from './DashboardDocumentActions';
import { ProductBadge } from './DashboardShared';
import { ProjectDetailModal } from './DashboardProjectDetailModal';

function StatusDownloadButton({
  item,
  project,
  loadProjectDetail,
}: {
  item: Pick<DashboardStatusItem, 'key' | 'label' | 'downloadCount'>;
  project: DashboardProjectRecord;
  loadProjectDetail: LoadProjectDetail;
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
  project: DashboardProjectRecord;
  loadProjectDetail: LoadProjectDetail;
}) {
  const [downloading, setDownloading] = useState(false);
  const completed = energyCertificate.status === 'completed';

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${
        completed
          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
          : energyCertificate.status === 'skipped'
            ? 'border-gray-200 bg-gray-50 text-gray-600'
            : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      {completed ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {completed
        ? 'Certificado energético'
        : energyCertificate.status === 'skipped'
          ? 'Certificado energético omitido'
          : 'Certificado energético pendiente'}
      {completed ? (
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
      ) : null}
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
  energyCertificate: DashboardEnergyCertificateSummary;
  warnings: DashboardWarning[];
  project: DashboardProjectRecord;
  loadProjectDetail: LoadProjectDetail;
}) {
  const toneClasses: Record<DashboardStatusItem['tone'], string> = {
    success: 'border-emerald-200 bg-emerald-50/80 text-emerald-800',
    pending: 'border-amber-200 bg-amber-50/80 text-amber-800',
    warning: 'border-orange-200 bg-orange-50/80 text-orange-800',
    muted: 'border-gray-200 bg-gray-50 text-gray-700',
  };

  return (
    <div className="min-w-[280px] space-y-2">
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.key}
              className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-xs ${toneClasses[item.tone]}`}
            >
              <span className="font-medium text-gray-800">{item.label}</span>
              <span className="flex items-center gap-1.5">
                <span className="whitespace-nowrap font-semibold">{item.stateLabel}</span>
                <StatusDownloadButton
                  item={item}
                  project={project}
                  loadProjectDetail={loadProjectDetail}
                />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">Sin estado documental</p>
      )}
      {submissionCount > 0 ? (
        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
          <CheckCircle className="h-3 w-3" />
          {submissionCount} envío{submissionCount !== 1 ? 's' : ''}
        </div>
      ) : null}
      <EnergyCertificateStatusBadge
        energyCertificate={energyCertificate}
        project={project}
        loadProjectDetail={loadProjectDetail}
      />
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

function AssessorCell({
  project,
  token,
  onSaved,
}: {
  project: DashboardProjectRecord;
  token: string;
  onSaved: (project: DashboardProjectRecord) => void;
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
      if (!response.success) {
        throw new Error(response.message || 'No se pudo guardar el asesor.');
      }
      onSaved((response.project ?? {
        ...project,
        assessor: nextAssessor,
        assessorId: nextAssessor,
      }) as DashboardProjectRecord);
      setStatus('saved');
    } catch (err) {
      console.error('Assessor reassignment failed:', err);
      setValue(previous);
      setStatus('error');
    }
  };

  return (
    <div className="min-w-[170px] space-y-1">
      <select
        data-testid="dashboard-assessor-select"
        value={value}
        disabled={status === 'saving'}
        onChange={(event) => {
          void saveAssessor(event.target.value);
        }}
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

export function ProjectTableRow({
  project,
  summary,
  token,
  loadProjectDetail,
  onRefresh,
  onAssessorUpdated,
  onDelete,
}: {
  project: DashboardProjectRecord;
  summary: DashboardProjectSummary;
  token: string;
  loadProjectDetail: LoadProjectDetail;
  onRefresh: () => Promise<void> | void;
  onAssessorUpdated: (project: DashboardProjectRecord) => void;
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
      if (popup) popup.close();
      alert('No se pudo abrir el formulario del expediente.');
    } finally {
      setOpeningForm(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
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
      <tr className="group bg-white transition-colors hover:bg-gray-50">
        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-eltex-blue-light px-2 py-1 font-mono text-[11px] font-bold text-eltex-blue">
                {project.code}
              </span>
              <ProductBadge type={project.productType} />
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
            <p className="truncate text-xs text-gray-500">{locationLabel(summary.location)}</p>
            <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">
              {summary.address || 'Sin dirección cargada'}
            </p>
            <p className="text-[11px] text-gray-400">
              Actualizado {formatDate(summary.lastUpdated)} · Creado {formatDate(project.createdAt)}
            </p>
          </div>
        </td>

        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <AssessorCell project={project} token={token} onSaved={onAssessorUpdated} />
        </td>

        <td className="border-b border-gray-100 px-4 py-3 align-top">
          <StatusCell
            items={summary.statusItems}
            submissionCount={project.submissionCount || 0}
            energyCertificate={summary.energyCertificate}
            warnings={summary.warnings}
            project={project}
            loadProjectDetail={loadProjectDetail}
          />
        </td>

        <td className={stickyActionsCellClass}>
          <div className="grid min-w-[180px] gap-1.5">
            <button
              type="button"
              data-testid="ver-expediente-btn"
              onClick={() => setShowDetail(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-eltex-blue/15 bg-eltex-blue px-3 py-2 text-xs font-semibold text-white hover:bg-eltex-blue/90"
            >
              <Eye className="h-3 w-3" />
              Abrir expediente
            </button>
            <button
              type="button"
              onClick={() => void handleOpenForm()}
              disabled={openingForm}
              className="truncate rounded-lg border border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              {openingForm ? 'Abriendo...' : 'Formulario'}
            </button>
            {deleteState === 'idle' ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteState('confirm');
                  confirmTimeoutRef.current = setTimeout(() => setDeleteState('idle'), 4000);
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar expediente
              </button>
            ) : null}
            {deleteState === 'confirm' ? (
              <div className="flex gap-1">
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
                    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
                    setDeleteState('idle');
                  }}
                  className="flex flex-1 items-center justify-center rounded-lg border border-gray-200 px-2 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            ) : null}
            {deleteState === 'deleting' ? (
              <div className="flex items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Eliminando...
              </div>
            ) : null}
          </div>
        </td>

        <td className={stickyZipCellClass}>
          <button
            type="button"
            data-testid="dashboard-row-download-zip-btn"
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
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            <Download className="h-3 w-3" />
            {downloading ? 'Descargando...' : 'ZIP'}
          </button>
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
