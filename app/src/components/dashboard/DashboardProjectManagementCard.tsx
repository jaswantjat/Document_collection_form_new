import { useState } from 'react';
import { ExternalLink, Loader2, Phone, UserPlus } from 'lucide-react';
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

type ProductType = (typeof productOptions)[number]['value'];

interface ManagementFormProps {
  phone: string;
  email: string;
  productType: ProductType;
  assessor: string;
  submitting: boolean;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onProductTypeChange: (value: ProductType) => void;
  onAssessorChange: (value: string) => void;
  onCreate: () => void;
}

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

function CardIntro() {
  return (
    <div className="border-b border-gray-100 bg-gray-50/60 p-5 xl:border-b-0 xl:border-r">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-eltex-blue-light text-eltex-blue">
          <UserPlus className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-lg font-bold text-gray-900">Gestión de expedientes</h2>
          <p className="max-w-xl text-sm leading-6 text-gray-500">
            Crea expedientes desde el dashboard, reabre duplicados por teléfono y entra al expediente desde aquí.
          </p>
        </div>
      </div>
    </div>
  );
}

function ManagementForm({
  phone,
  email,
  productType,
  assessor,
  submitting,
  onPhoneChange,
  onEmailChange,
  onProductTypeChange,
  onAssessorChange,
  onCreate,
}: ManagementFormProps) {
  return (
    <div className="p-5">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-semibold text-gray-700">Teléfono del cliente</span>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              data-testid="dashboard-create-phone-input"
              type="tel"
              value={phone}
              onChange={(event) => onPhoneChange(normalizePhoneInput(event.target.value))}
              placeholder="+34 612 34 56 78"
              className="form-input !pl-12"
            />
          </div>
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-semibold text-gray-700">Email del cliente</span>
          <input
            data-testid="dashboard-create-email-input"
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="correo@ejemplo.com"
            className="form-input"
          />
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-semibold text-gray-700">Producto</span>
          <select
            data-testid="dashboard-create-product-select"
            value={productType}
            onChange={(event) => onProductTypeChange(event.target.value as ProductType)}
            className="form-input"
          >
            {productOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <AssessorSelect assessor={assessor} onAssessorChange={onAssessorChange} />
      </div>

      <FormFooter submitting={submitting} onCreate={onCreate} />
    </div>
  );
}

function AssessorSelect({
  assessor,
  onAssessorChange,
}: Pick<ManagementFormProps, 'assessor' | 'onAssessorChange'>) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-semibold text-gray-700">Asesor</span>
      <select
        data-testid="dashboard-create-assessor-select"
        value={assessor}
        onChange={(event) => onAssessorChange(event.target.value)}
        className="form-input"
      >
        {approvedAssessors.map((approvedAssessor) => (
          <option key={approvedAssessor} value={approvedAssessor}>
            {approvedAssessor}
          </option>
        ))}
      </select>
    </label>
  );
}

function FormFooter({
  submitting,
  onCreate,
}: Pick<ManagementFormProps, 'submitting' | 'onCreate'>) {
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs leading-5 text-gray-500">
        Usa el teléfono como llave: si ya existe, se abrirá el expediente activo.
      </p>
      <button
        type="button"
        data-testid="dashboard-create-project-btn"
        onClick={() => { void onCreate(); }}
        disabled={submitting}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-eltex-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-eltex-blue/90 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-56"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        {submitting ? 'Guardando...' : 'Crear o abrir expediente'}
      </button>
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;

  return (
    <p
      data-testid="dashboard-project-management-error"
      className="mx-5 mb-5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600"
    >
      {error}
    </p>
  );
}

function ActionResultPanel({ actionResult }: { actionResult: DashboardProjectActionResult | null }) {
  if (!actionResult) return null;

  return (
    <div
      data-testid="dashboard-project-action-result"
      className="mx-5 mb-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
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
  );
}

export function DashboardProjectManagementCard({
  token,
  actionResult,
  onActionResult,
  onUnauthorized,
}: Props) {
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [productType, setProductType] = useState<ProductType>('solar');
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
      className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
    >
      <div className="grid gap-0 xl:grid-cols-[minmax(280px,0.85fr)_minmax(620px,1.45fr)]">
        <CardIntro />
        <ManagementForm
          phone={phone}
          email={email}
          productType={productType}
          assessor={assessor}
          submitting={submitting}
          onPhoneChange={setPhone}
          onEmailChange={setEmail}
          onProductTypeChange={setProductType}
          onAssessorChange={setAssessor}
          onCreate={handleCreate}
        />
      </div>

      <ErrorMessage error={error} />
      <ActionResultPanel actionResult={actionResult} />
    </section>
  );
}
