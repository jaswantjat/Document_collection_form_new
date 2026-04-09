import type { Section } from '@/types';

type ConnectionInfo = {
  effectiveType?: string;
  saveData?: boolean;
};

type SectionPreloader = () => Promise<unknown>;

const prefetchedSections = new Set<Section>();

const SECTION_PRELOADERS: Partial<Record<Section, SectionPreloader>> = {
  'province-selection': () => import('@/sections/ProvinceSelectionSection'),
  'representation': () => import('@/sections/RepresentationSection'),
  'energy-certificate': () => import('@/sections/EnergyCertificateSection'),
  review: () => import('@/sections/ReviewSection'),
};

function getConnectionInfo(): ConnectionInfo | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { connection?: ConnectionInfo }).connection ?? null;
}

export function shouldSkipCustomerPrefetch(): boolean {
  const connection = getConnectionInfo();
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

export function prefetchCustomerSection(section: Section | null): void {
  if (!section || shouldSkipCustomerPrefetch()) return;
  if (prefetchedSections.has(section)) return;

  const preload = SECTION_PRELOADERS[section];
  if (!preload) return;

  prefetchedSections.add(section);
  preload().catch(() => {
    prefetchedSections.delete(section);
  });
}
