import type { EnergyCertificateData } from '@/types';
import { isEnergyCertificateReadyToComplete } from '@/lib/energyCertificateValidation';

export type CustomerEnergyFlowStatus = 'pending' | 'skipped' | 'completed';

export function getCustomerEnergyFlowStatus(
  data: EnergyCertificateData | null | undefined
): CustomerEnergyFlowStatus {
  if (!data) return 'pending';
  if (data.status === 'skipped') return 'skipped';
  if (
    data.status === 'completed'
    && isEnergyCertificateReadyToComplete(data)
  ) {
    return 'completed';
  }
  return 'pending';
}

export function hasEnergyCertificateDecision(
  data: EnergyCertificateData | null | undefined
): boolean {
  return getCustomerEnergyFlowStatus(data) !== 'pending';
}
