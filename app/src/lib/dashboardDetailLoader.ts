interface DetailFetchSuccess<TProject> {
  success: true;
  project?: TProject;
}

interface DetailFetchFailure {
  success: false;
  error?: string;
  message?: string;
}

type DetailFetchResult<TProject> = DetailFetchSuccess<TProject> | DetailFetchFailure;

interface DashboardProjectDetailLoaderOptions<TProject> {
  fetchProject: (projectCode: string) => Promise<DetailFetchResult<TProject>>;
  isAuthError: (error: string | undefined) => boolean;
  onAuthError: () => Promise<void>;
}

export function createDashboardProjectDetailLoader<TProject>({
  fetchProject,
  isAuthError,
  onAuthError,
}: DashboardProjectDetailLoaderOptions<TProject>) {
  const cache = new Map<string, TProject>();
  const inFlight = new Map<string, Promise<TProject>>();

  const loadProjectDetail = async (projectCode: string) => {
    if (cache.has(projectCode)) return cache.get(projectCode) as TProject;
    if (inFlight.has(projectCode)) return inFlight.get(projectCode) as Promise<TProject>;

    const request = (async () => {
      const response = await fetchProject(projectCode);
      const responseError = 'error' in response ? response.error : undefined;
      const responseMessage = 'message' in response ? response.message : undefined;

      if (response.success && response.project) {
        cache.set(projectCode, response.project);
        return response.project;
      }

      if (isAuthError(responseError)) {
        await onAuthError();
        throw new Error(responseError);
      }

      throw new Error(responseMessage || responseError || 'PROJECT_LOAD_FAILED');
    })().finally(() => {
      inFlight.delete(projectCode);
    });

    inFlight.set(projectCode, request);
    return request;
  };

  return {
    loadProjectDetail,
    clearProjectDetail(projectCode: string) {
      cache.delete(projectCode);
      inFlight.delete(projectCode);
    },
    clearAllProjectDetails() {
      cache.clear();
      inFlight.clear();
    },
  };
}
