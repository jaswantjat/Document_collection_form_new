export interface PropertyDocsProgressInput {
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

export function getPropertyDocsProgress({
  dniDone,
  ibiDone,
  electricityDone,
}: PropertyDocsProgressInput): PropertyDocsProgressSummary {
  const slots = [
    { label: 'DNI / NIE', done: dniDone },
    { label: 'IBI o escritura', done: ibiDone },
    { label: 'Factura de luz', done: electricityDone },
  ];

  return {
    slots,
    missingCount: slots.filter((slot) => !slot.done).length,
  };
}
