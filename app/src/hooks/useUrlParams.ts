import { useState, useEffect } from 'react';

export const useUrlParams = () => {
  const [params, setParams] = useState<{
    projectCode: string | null;
    source: 'customer' | 'assessor';
  }>({
    projectCode: null,
    source: 'customer',
  });

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    // Support both ?code= and ?project= for backwards compat
    const projectCode = sp.get('code') || sp.get('project');
    const source = sp.get('source') as 'customer' | 'assessor';

    setParams({
      projectCode,
      source: source === 'assessor' ? 'assessor' : 'customer',
    });
  }, []);

  return params;
};
