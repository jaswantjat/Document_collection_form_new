import { describe, expect, it } from 'vitest';

import {
  getPropertyDocsProgress,
  hasRequiredPropertyDocs,
} from './propertyDocsProgress';

describe('getPropertyDocsProgress', () => {
  it('tracks only the three initial intake documents', () => {
    const progress = getPropertyDocsProgress({
      productType: 'solar',
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
      productType: 'solar-aerothermal',
      dniDone: false,
      ibiDone: false,
      electricityDone: true,
    });

    expect(progress.missingCount).toBe(2);
  });

  it('omits electricity from the required progress strip for pure aerothermal', () => {
    const progress = getPropertyDocsProgress({
      productType: 'aerothermal',
      dniDone: true,
      ibiDone: true,
      electricityDone: false,
    });

    expect(progress.slots).toEqual([
      { label: 'DNI / NIE', done: true },
      { label: 'IBI o escritura', done: true },
    ]);
    expect(progress.missingCount).toBe(0);
  });
});

describe('hasRequiredPropertyDocs', () => {
  it('does not require electricity for pure aerothermal', () => {
    expect(
      hasRequiredPropertyDocs({
        productType: 'aerothermal',
        dniDone: true,
        ibiDone: true,
        electricityDone: false,
      })
    ).toBe(true);
  });

  it('still requires electricity for solar-aerothermal', () => {
    expect(
      hasRequiredPropertyDocs({
        productType: 'solar-aerothermal',
        dniDone: true,
        ibiDone: true,
        electricityDone: false,
      })
    ).toBe(false);
  });
});
