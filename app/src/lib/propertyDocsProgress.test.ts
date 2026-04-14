import { describe, expect, it } from 'vitest';

import { getPropertyDocsProgress } from './propertyDocsProgress';

describe('getPropertyDocsProgress', () => {
  it('tracks only the three initial intake documents', () => {
    const progress = getPropertyDocsProgress({
      dniDone: true,
      ibiDone: false,
      electricityDone: true,
    });

    expect(progress.slots).toEqual([
      { label: 'DNI / NIE', done: true },
      { label: 'IBI o escritura', done: false },
      { label: 'Factura de luz', done: true },
    ]);
  });

  it('calculates the missing count without any contract slot', () => {
    const progress = getPropertyDocsProgress({
      dniDone: false,
      ibiDone: false,
      electricityDone: true,
    });

    expect(progress.missingCount).toBe(2);
  });
});
