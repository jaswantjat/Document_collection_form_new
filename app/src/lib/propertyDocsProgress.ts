import type { ProductType } from '@/types';

export interface PropertyDocsProgressInput {
  productType: ProductType;
  dniDone: boolean;
  ibiDone: boolean;
  electricityDone: boolean;
}

export interface PropertyDocsProgressSlot {
  label: string;
  done: boolean;
}

export interface PropertyDocsProgressSummary {
  slots: PropertyDocsProgressSlot[];
  missingCount: number;
}

export function isElectricityRequired(productType: ProductType): boolean {
  return productType !== 'aerothermal';
}

export function hasRequiredPropertyDocs({
  productType,
  dniDone,
  ibiDone,
  electricityDone,
}: PropertyDocsProgressInput): boolean {
  if (!dniDone || !ibiDone) return false;
  return !isElectricityRequired(productType) || electricityDone;
}

export function getPropertyDocsProgress({
  productType,
  dniDone,
  ibiDone,
  electricityDone,
}: PropertyDocsProgressInput): PropertyDocsProgressSummary {
  const slots = [
    { label: 'DNI / NIE', done: dniDone },
    { label: 'IBI o escritura', done: ibiDone },
    ...(
      isElectricityRequired(productType)
        ? [{ label: 'Factura de luz', done: electricityDone }]
        : []
    ),
  ];

  return {
    slots,
    missingCount: slots.filter((slot) => !slot.done).length,
  };
}
