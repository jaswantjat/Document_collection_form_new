import type { FormData, ProductType } from '@/types';
import { isIdentityDocumentComplete } from '@/lib/identityDocument';

export interface PropertyDocsCompletionState {
  dniDone: boolean;
  ibiDone: boolean;
  electricityDone: boolean;
}

export function isElectricityBillRequired(productType: ProductType): boolean {
  return productType !== 'aerothermal';
}

export function getPropertyDocsCompletionState(
  formData: FormData | null | undefined
): PropertyDocsCompletionState {
  return {
    dniDone: !!formData && isIdentityDocumentComplete(formData.dni),
    ibiDone: !!formData && (!!formData.ibi?.photo || (formData.ibi?.pages?.length ?? 0) > 0),
    electricityDone: !!formData && (formData.electricityBill?.pages?.length ?? 0) > 0,
  };
}

export function hasRequiredPropertyDocs(
  formData: FormData | null | undefined,
  productType: ProductType
): boolean {
  const { dniDone, ibiDone, electricityDone } = getPropertyDocsCompletionState(formData);
  return dniDone && ibiDone && (!isElectricityBillRequired(productType) || electricityDone);
}
