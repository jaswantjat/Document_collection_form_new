import { useState } from 'react';
import { ExternalLink, UserPlus } from 'lucide-react';
import { approvedAssessors } from '@/lib/approvedAssessors';
import { buildProjectUrl } from '@/lib/dashboardHelpers';
import {
  createDashboardProject,
  type DashboardProjectActionResult,
} from '@/services/api';

interface Props {
  token: string;
  actionResult: DashboardProjectActionResult | null;
  onActionResult: (result: DashboardProjectActionResult) => Promise<void>;
  onUnauthorized: () => Promise<void>;
}

const productOptions = [
  { value: 'solar', label: 'Solar' },
  { value: 'aerothermal', label: 'Aerotermia' },
  { value: 'solar-aerothermal', label: 'Solar + Aerotermia' },
] as const;

function normalizePhoneInput(value: string): string {
  return value.replace(/[^\d+\s().-]/g, '');
}

function resultTitle(result: DashboardProjectActionResult): string {
  if (result.existing) return 'Expediente existente encontrado';
  return 'Expediente creado';
}

function resultMessage(result: DashboardProjectActionResult): string {
  if (result.existing) {
    return 'Ya existía un expediente activo para ese teléfono. Ábrelo desde aquí sin crear otro.';
  }

  return 'El expediente ya está disponible en el dashboard.';
}

function openAssessorProject(projectCode: string, accessToken?: string): void {
  window.open(buildProjectUrl(projectCode, 'assessor', accessToken), '_blank', 'noopener,noreferrer');
}

export function DashboardProjectManagementCard({
  token,
  actionResult,
  onActionResult,
  onUnauthorized,
}: Props) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [productType, setProductType] = useState<(typeof productOptions)[number]['value']>('solar');
  const [assessor, setAssessor] = useState(approvedAssessors[0]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    setSubmitting(true);
    setError('');

    try {
      const response = await createDashboardProject({
        phone: phone.trim(),
        email: email.trim() || undefined,
        productType,
        assessor,
      }, token);

      if (!response.success || !response.project || !response.customerLink) {
        if (response.error === 'UNAUTHORIZED' || response.error === 'SESSION_EXPIRED') {
          await onUnauthorized();
          return;
        }

        setError(response.message || 'No se pudo crear o abrir el expediente.');
        return;
      }

      await onActionResult({
        action: response.existing ? 'opened' : 'created',
        existing: response.existing ?? false,
        project: response.project,
        customerLink: response.customerLink,
      });

      setPhone('');
      setEmail('');
    } catch (err) {
      console.error('Dashboard project create failed:', err);
      setError('Error de conexión al gestionar el expediente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      data-testid="dashboard-project-management-card"
      className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-gray-900">Gestión de expedientes</h2>
          <p className="text-sm text-gray-500">
            Crea expedientes desde el dashboard, reabre duplicados por teléfono y entra al expediente desde aquí.
          </p>
        </div>

        <div className="grid w-full gap-3 xl:max-w-[720px] xl:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-gray-700">Teléfono del cliente</span>
            <input
              data-testid="dashboard-create-phone-input"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(normalizePhoneInput(event.target.value))}
              placeholder="+34 612 34 56 78"
              className="form-input"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-gray-700">Email del cliente</span>
            <input
              data-testid="dashboard-create-email-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="correo@ejemplo.com"
              className="form-input"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-gray-700">Producto</span>
            <select
              data-testid="dashboard-create-product-select"
              value={productType}
              onChange={(event) => setProductType(event.target.value as (typeof productOptions)[number]['value'])}
              className="form-input"
            >
              {productOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-semibold text-gray-700">Asesor</span>
            <select
              data-testid="dashboard-create-assessor-select"
              value={assessor}
              onChange={(event) => setAssessor(event.target.value)}
              className="form-input"
            >
              {approvedAssessors.map((approvedAssessor) => (
                <option key={approvedAssessor} value={approvedAssessor}>
                  {approvedAssessor}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && (
        <p
          data-testid="dashboard-project-management-error"
          className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="dashboard-create-project-btn"
          onClick={() => { void handleCreate(); }}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-eltex-blue px-4 py-2 text-sm font-semibold text-white hover:bg-eltex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" />
          {submitting ? 'Guardando...' : 'Crear o abrir expediente'}
        </button>
      </div>

      {actionResult && (
        <div
          data-testid="dashboard-project-action-result"
          className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-900">{resultTitle(actionResult)}</p>
              <p className="text-sm text-gray-600">{resultMessage(actionResult)}</p>
              <p className="text-xs font-semibold text-eltex-blue">
                {actionResult.project.code} · {actionResult.project.phone}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="dashboard-open-project-btn"
                onClick={() => openAssessorProject(actionResult.project.code, actionResult.project.accessToken)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir expediente
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
