import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDashboard, fetchDashboardProject, type DashboardProjectRecord } from '@/services/api';
import { createDashboardProjectDetailLoader } from '@/lib/dashboardDetailLoader';
import { getDashboardProjectSummary, type DashboardProjectSummary } from '@/lib/dashboardProject';
import { getDashboardProgressState, type DashboardProgressState } from '@/lib/dashboardProgress';

function isDashboardAuthError(error: string | undefined) {
  return error === 'UNAUTHORIZED' || error === 'SESSION_EXPIRED';
}

export interface DashboardProjectListItem {
  project: DashboardProjectRecord;
  summary: DashboardProjectSummary;
  progressState: DashboardProgressState;
}

export function useDashboardProjects({
  token,
  onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => Promise<void>;
}) {
  const [projects, setProjects] = useState<DashboardProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | DashboardProgressState>('all');
  const [assessorFilter, setAssessorFilter] = useState('all');
  const [search, setSearch] = useState('');

  const detailLoader = useMemo(() => createDashboardProjectDetailLoader<DashboardProjectRecord>({
    fetchProject: (projectCode) => fetchDashboardProject(projectCode, token),
    isAuthError: isDashboardAuthError,
    onAuthError: onUnauthorized,
  }), [onUnauthorized, token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      detailLoader.clearAllProjectDetails();
      const response = await fetchDashboard(token);
      if (response.success && response.projects) {
        setProjects(response.projects);
      } else if (isDashboardAuthError(response.error)) {
        await onUnauthorized();
      } else {
        setError('No se pudieron cargar los datos.');
      }
    } catch (err) {
      console.error('Dashboard load failed:', err);
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  }, [detailLoader, onUnauthorized, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const projectsWithSummary = useMemo<DashboardProjectListItem[]>(
    () => projects.map((project) => {
      const summary = getDashboardProjectSummary(project);
      return {
        project,
        summary,
        progressState: getDashboardProgressState({
          submissionCount: project.submissionCount,
          summary,
        }),
      };
    }),
    [projects]
  );

  const filteredProjects = useMemo(() => projectsWithSummary
    .filter(({ project, summary, progressState }) => {
      if (filter !== 'all' && progressState !== filter) return false;
      if (assessorFilter !== 'all' && project.assessor !== assessorFilter) return false;

      if (!search.trim()) return true;

      const query = search.toLowerCase();

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
    }), [assessorFilter, filter, projectsWithSummary, search]);

  const totalSubmitted = projectsWithSummary.filter(({ progressState }) => progressState === 'submitted').length;
  const totalInProgress = projectsWithSummary.filter(({ progressState }) => progressState === 'in-progress').length;
  const totalPending = projectsWithSummary.filter(({ progressState }) => progressState === 'pending').length;

  const clearProjectDetail = useCallback((projectCode: string) => {
    detailLoader.clearProjectDetail(projectCode);
  }, [detailLoader]);

  const removeProject = useCallback((projectCode: string) => {
    detailLoader.clearProjectDetail(projectCode);
    setProjects((prev) => prev.filter((project) => project.code !== projectCode));
  }, [detailLoader]);

  const updateProject = useCallback((updatedProject: DashboardProjectRecord) => {
    detailLoader.clearProjectDetail(updatedProject.code);
    setProjects((prev) => prev.map((project) => (
      project.code === updatedProject.code ? { ...project, ...updatedProject } : project
    )));
  }, [detailLoader]);

  return {
    assessorFilter,
    clearProjectDetail,
    error,
    filter,
    filteredProjects,
    loadProjectDetail: detailLoader.loadProjectDetail,
    loading,
    projects,
    refresh,
    removeProject,
    search,
    setAssessorFilter,
    setFilter,
    setSearch,
    showInitialLoading: loading && projects.length === 0,
    totalInProgress,
    totalPending,
    totalSubmitted,
    updateProject,
  };
}
