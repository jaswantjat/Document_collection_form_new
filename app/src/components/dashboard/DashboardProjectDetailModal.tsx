import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  LayoutDashboard,
  Loader2,
  Phone,
  Upload,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type { DashboardProjectRecord } from '@/services/api';
import { getDashboardProjectSummary } from '@/lib/dashboardProject';
import {
  formatDate,
  languageLabel,
  locationLabel,
} from '@/lib/dashboardHelpers';
import { downloadProjectZip } from '@/lib/dashboardExport';
import { DashboardAdminUploadModal } from './DashboardAdminUploadModal';
import {
  CompanyDisplay,
  DNIDisplay,
  DownloadGroupsSection,
  ElectricityDisplay,
  EnergyCertificatePanel,
  FinalSignaturesPanel,
  IBIDisplay,
  PhotoGallery,
  SignedDocumentsSection,
} from './DashboardDocumentPanels';
import type { LoadProjectDetail } from './DashboardDocumentActions';
import { InfoCard, ProductBadge } from './DashboardShared';

export function ProjectDetailModal({
  projectCode,
  token,
  loadProjectDetail,
  onRefresh,
  onClose,
}: {
  projectCode: string;
  token: string;
  loadProjectDetail: LoadProjectDetail;
  onRefresh: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [project, setProject] = useState<DashboardProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const detail = await loadProjectDetail(projectCode);
        if (!cancelled) {
          setProject(detail);
        }
      } catch (err) {
        console.error('Project detail load failed:', err);
        if (!cancelled) {
          setError('No se pudo cargar el expediente.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
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
      <div
        className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4"
        data-testid="project-detail-modal"
        onClick={onClose}
      >
        <div
          className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 pb-4 pt-5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-eltex-blue-light px-2 py-1 font-mono text-[11px] font-bold text-eltex-blue">
                  {projectCode}
                </span>
                {project?.productType ? <ProductBadge type={project.productType} /> : null}
              </div>
              <h2 className="text-lg font-bold text-gray-900">
                {summary?.customerDisplayName || project?.customerName || 'Expediente'}
              </h2>
              <p className="text-sm text-gray-500">
                {summary?.address || 'Sin dirección disponible'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {project ? (
                <button
                  type="button"
                  data-testid="detail-upload-btn"
                  onClick={() => setShowUpload(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-blue-700 transition-colors hover:bg-blue-50"
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-sm font-semibold">Subir docs</span>
                </button>
              ) : null}
              {project ? (
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
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-emerald-700 transition-colors hover:bg-emerald-50"
                >
                  <Download className="h-4 w-4" />
                  <span className="text-sm font-semibold">Descargar ZIP</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 transition-colors hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {loading ? (
              <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-eltex-blue" />
                <span className="text-sm text-blue-800">
                  Cargando detalle del expediente...
                </span>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
            ) : null}

            {!loading && !error && project && summary ? (
              <div className="space-y-6">
                {summary.warnings.length > 0 ? (
                  <div className="space-y-2">
                    {summary.warnings.map((warning) => (
                      <div
                        key={warning.key}
                        className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <p className="text-sm text-red-700">{warning.message}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-5">
                  <InfoCard icon={Clock} label="Última actividad" value={formatDate(summary.lastUpdated)} />
                  <InfoCard icon={User} label="Asesor" value={project.assessor || '—'} />
                  <InfoCard icon={LayoutDashboard} label="Ubicación" value={locationLabel(summary.location)} />
                  <InfoCard icon={CheckCircle} label="Envíos" value={String(project.submissionCount || 0)} />
                  <InfoCard icon={Phone} label="Teléfono" value={project.phone || '—'} />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <InfoCard icon={User} label="Nombre" value={summary.firstName || '—'} />
                  <InfoCard icon={Users} label="Apellidos" value={summary.lastName || '—'} />
                  <InfoCard icon={Zap} label="Idioma del navegador" value={languageLabel(summary.customerLanguage)} />
                </div>

                <CompanyDisplay representation={project.formData?.representation} />
                <DNIDisplay dni={project.formData?.dni} projectCode={project.code} />
                <IBIDisplay ibi={project.formData?.ibi} projectCode={project.code} />
                <ElectricityDisplay bill={project.formData?.electricityBill} projectCode={project.code} />
                <SignedDocumentsSection
                  project={project}
                  items={summary.signedDocuments}
                  energyCertificate={summary.energyCertificate}
                />
                <EnergyCertificatePanel
                  project={project}
                  energyCertificate={summary.energyCertificate}
                />
                <FinalSignaturesPanel
                  signatures={summary.finalSignatures}
                  projectCode={project.code}
                />
                <DownloadGroupsSection
                  groups={summary.downloadGroups}
                  projectCode={project.code}
                />
                {summary.photoGroups.map((group) => (
                  <PhotoGallery key={group.key} group={group} projectCode={project.code} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {showUpload
        ? createPortal(
            <DashboardAdminUploadModal
              projectCode={projectCode}
              token={token}
              loadProjectDetail={loadProjectDetail}
              onClose={() => setShowUpload(false)}
              onRefresh={refreshProject}
            />,
            document.body
          )
        : null}
    </>
  );
}
