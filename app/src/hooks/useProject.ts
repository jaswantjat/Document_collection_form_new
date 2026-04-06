import { useState, useEffect } from 'react';
import type { ProjectData } from '@/types';
import { fetchProject } from '@/services/api';

interface UseProjectState {
  projectCode: string | null;
  project: ProjectData | null;
  loading: boolean;
  error: string | null;
}

export const useProject = (projectCode: string | null) => {
  const [state, setState] = useState<UseProjectState>(() => ({
    projectCode,
    project: null,
    loading: Boolean(projectCode),
    error: projectCode ? null : 'INVALID_CODE',
  }));

  useEffect(() => {
    if (!projectCode) return;
    let cancelled = false;

    fetchProject(projectCode)
      .then(res => {
        if (cancelled) return;
        if (res.success && res.project) {
          setState({
            projectCode,
            project: res.project,
            loading: false,
            error: null,
          });
          return;
        }
        setState({
          projectCode,
          project: null,
          loading: false,
          error: res.error || 'UNKNOWN_ERROR',
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          projectCode,
          project: null,
          loading: false,
          error: 'NETWORK_ERROR',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [projectCode]);

  if (!projectCode) {
    return { project: null, loading: false, error: 'INVALID_CODE' };
  }

  if (state.projectCode !== projectCode) {
    return { project: null, loading: true, error: null };
  }

  return {
    project: state.project,
    loading: state.loading,
    error: state.error,
  };
};
