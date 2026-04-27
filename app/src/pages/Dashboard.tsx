import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle,
  Clock,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Search,
  Upload,
  Users,
} from 'lucide-react';
import {
  dashboardLogout,
  type DashboardProjectActionResult,
} from '@/services/api';
import { useDashboardProjects } from '@/hooks/useDashboardProjects';
import { approvedAssessors } from '@/lib/approvedAssessors';
import { downloadCSV } from '@/lib/dashboardHelpers';
import { DashboardProjectManagementCard } from '@/components/dashboard/DashboardProjectManagementCard';
import { ProjectTableRow } from '@/components/dashboard/DashboardProjectTable';

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

export function Dashboard({ token, onLogout }: DashboardProps) {
  const [actionResult, setActionResult] = useState<DashboardProjectActionResult | null>(
    null
  );

  const handleLogout = useCallback(async () => {
    await dashboardLogout(token);
    sessionStorage.removeItem('dashboard_token');
    onLogout();
  }, [onLogout, token]);

  const {
    assessorFilter,
    clearProjectDetail,
    error,
    filter,
    filteredProjects,
    loadProjectDetail,
    loading,
    projects,
    refresh,
    removeProject,
    search,
    setAssessorFilter,
    setFilter,
    setSearch,
    showInitialLoading,
    totalInProgress,
    totalPending,
    totalSubmitted,
    updateProject,
  } = useDashboardProjects({
    token,
    onUnauthorized: handleLogout,
  });

  const handleProjectActionResult = useCallback(
    async (result: DashboardProjectActionResult) => {
      clearProjectDetail(result.project.code);
      setActionResult(result);
      setFilter('all');
      setSearch(result.project.code);
      await refresh();
    },
    [clearProjectDetail, refresh, setFilter, setSearch]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/eltex-logo.png" alt="Eltex" className="h-7 object-contain" />
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-eltex-blue" />
              <h1 className="font-bold text-gray-900">Dashboard</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="dashboard-refresh-btn"
              onClick={() => void refresh()}
              title="Actualizar"
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              data-testid="export-csv-btn"
              onClick={() => downloadCSV(token)}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <Archive className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
            <button
              type="button"
              data-testid="logout-btn"
              onClick={() => void handleLogout()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-5 px-4 py-6">
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard
            label="Total proyectos"
            value={projects.length}
            icon={Users}
            color="text-eltex-blue"
            bg="bg-eltex-blue-light"
          />
          <SummaryCard
            label="Enviados"
            value={totalSubmitted}
            icon={CheckCircle}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <SummaryCard
            label="En curso"
            value={totalInProgress}
            icon={Upload}
            color="text-blue-700"
            bg="bg-blue-50"
          />
          <SummaryCard
            label="Pendientes"
            value={totalPending}
            icon={Clock}
            color="text-amber-600"
            bg="bg-amber-50"
          />
        </div>

        <DashboardProjectManagementCard
          token={token}
          actionResult={actionResult}
          onActionResult={handleProjectActionResult}
          onUnauthorized={handleLogout}
        />

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, código, teléfono, asesor o dirección..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="form-input w-full py-2.5 pl-10 text-sm"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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

            <div className="flex shrink-0 gap-1 rounded-xl border border-gray-200 bg-white p-1">
              {(['all', 'submitted', 'in-progress', 'pending'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === item
                      ? 'bg-eltex-blue text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  {item === 'all'
                    ? 'Todos'
                    : item === 'submitted'
                      ? 'Enviados'
                      : item === 'in-progress'
                        ? 'En curso'
                        : 'Pendientes'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        {showInitialLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-eltex-blue border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.length === 0 ? (
              <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center">
                <ImageIcon className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                <p className="text-sm text-gray-400">No hay proyectos que coincidan.</p>
              </div>
            ) : (
              <div
                data-testid="dashboard-table-scroll"
                className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm"
              >
                <table className="table-fixed min-w-[1180px] w-full">
                  <thead className="border-b border-gray-100 bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="w-[360px] whitespace-nowrap px-4 py-3 font-semibold">Expediente / cliente</th>
                      <th className="w-[180px] whitespace-nowrap px-4 py-3 font-semibold">Asesor</th>
                      <th className="w-[340px] whitespace-nowrap px-4 py-3 font-semibold">Estado</th>
                      <th className="sticky right-[110px] z-30 w-[190px] whitespace-nowrap border-l border-gray-100 bg-gray-50 px-4 py-3 font-semibold shadow-[-12px_0_16px_-16px_rgba(15,23,42,0.45)]">
                        Acciones
                      </th>
                      <th className="sticky right-0 z-30 w-[110px] whitespace-nowrap border-l border-gray-100 bg-gray-50 px-4 py-3 font-semibold">
                        ZIP
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map(({ project, summary }) => (
                      <ProjectTableRow
                        key={project.code}
                        project={project}
                        summary={summary}
                        token={token}
                        loadProjectDetail={loadProjectDetail}
                        onRefresh={refresh}
                        onAssessorUpdated={updateProject}
                        onDelete={removeProject}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!showInitialLoading && filteredProjects.length > 0 ? (
          <p className="pb-4 text-center text-xs text-gray-400">
            Mostrando {filteredProjects.length} de {projects.length} proyectos
          </p>
        ) : null}
      </div>
    </div>
  );
}
