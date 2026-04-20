import type { DashboardProjectSummary } from '@/lib/dashboardProject';

export type DashboardProgressState = 'pending' | 'in-progress' | 'submitted';

interface DashboardProgressInput {
  submissionCount?: number | null;
  summary: DashboardProjectSummary;
}

export function hasDashboardProgress(summary: DashboardProjectSummary): boolean {
  return (
    summary.counts.documentsPresent > 0
    || summary.additionalDocuments.length > 0
    || summary.finalSignatures.length > 0
    || summary.photoGroups.some((group) => group.items.length > 0)
    || summary.signedDocuments.some((item) => item.present || item.status === 'deferred')
    || summary.energyCertificate.status !== 'pending'
  );
}

export function getDashboardProgressState({
  submissionCount,
  summary,
}: DashboardProgressInput): DashboardProgressState {
  if ((submissionCount ?? 0) > 0) return 'submitted';
  return hasDashboardProgress(summary) ? 'in-progress' : 'pending';
}
