import type { FormData, ProjectData } from '@/types';

export interface FinancingRouteContext {
  project: ProjectData;
  formData: FormData;
}

interface FinancingConfig {
  genericUrl: string | null;
}

export interface FinancingCta {
  href: string;
  routeKind: 'generic-config';
  title: string;
  description: string;
  actionLabel: string;
}

function readFinancingConfig(): FinancingConfig {
  return {
    genericUrl: import.meta.env.VITE_FINANCING_URL ?? null,
  };
}

export function normalizeFinancingUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveFinancingCta(
  context: FinancingRouteContext,
  config: FinancingConfig = readFinancingConfig()
): FinancingCta | null {
  const href = normalizeFinancingUrl(config.genericUrl);
  if (!href) return null;

  const futureRoutingContext = {
    projectCode: context.project.code,
    productType: context.project.productType,
    location: context.formData.location ?? context.formData.representation.location ?? 'unknown',
  };
  void futureRoutingContext;

  return {
    href,
    routeKind: 'generic-config',
    title: '¿Necesitas financiación?',
    description: 'Consulta las opciones en una pestaña nueva. Podrás volver a este formulario cuando quieras.',
    actionLabel: 'Ver opciones de financiación',
  };
}
