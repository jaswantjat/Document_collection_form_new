import { useState, useEffect } from 'react';
import type { ProjectData } from '@/types';
import { fetchProject } from '@/services/api';

export const useProject = (projectCode: string | null) => {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectCode) {
      setError('INVALID_CODE');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchProject(projectCode)
      .then(res => {
        if (res.success && res.project) {
          setProject(res.project);
        } else {
          setError(res.error || 'UNKNOWN_ERROR');
        }
      })
      .catch(() => setError('NETWORK_ERROR'))
      .finally(() => setLoading(false));
  }, [projectCode]);

  return { project, loading, error };
};
