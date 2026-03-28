export const useUrlParams = () => {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const sp = new URLSearchParams(search);

  return {
    projectCode: sp.get('code') || sp.get('project'),
    source: sp.get('source') === 'assessor' ? 'assessor' : 'customer',
  } as const;
};
