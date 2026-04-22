import { afterEach, describe, expect, it } from 'vitest';
import { __pdfToImagesTestUtils } from './pdfToImages';

const { isPdfChunkImportError, normalizePdfConversionError } = __pdfToImagesTestUtils;
const previousNavigator = globalThis.navigator;

function setNavigatorOnlineState(online: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: online },
  });
}

describe('pdfToImages error normalization', () => {
  afterEach(() => {
    if (previousNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: previousNavigator,
      });
      return;
    }
    Reflect.deleteProperty(globalThis, 'navigator');
  });

  it('detects dynamic-import chunk load failures', () => {
    expect(isPdfChunkImportError({
      name: 'TypeError',
      message: 'Failed to fetch dynamically imported module',
    })).toBe(true);

    expect(isPdfChunkImportError({
      name: 'ChunkLoadError',
      message: 'Loading chunk 42 failed.',
    })).toBe(true);
  });

  it('maps offline chunk failures to a reconnect message', () => {
    setNavigatorOnlineState(false);

    expect(
      normalizePdfConversionError(new TypeError('Failed to fetch dynamically imported module')).message
    ).toBe('No se pudo convertir el PDF sin conexión. Vuelve a conectarte o sube fotos del documento.');
  });

  it('maps online chunk failures to a reload message', () => {
    setNavigatorOnlineState(true);

    expect(
      normalizePdfConversionError(new TypeError('Importing a module script failed.')).message
    ).toBe('No se pudo cargar el lector de PDF. Recarga la página e inténtalo de nuevo.');
  });

  it('preserves known friendly PDF errors and normalizes unknown ones', () => {
    setNavigatorOnlineState(true);

    expect(
      normalizePdfConversionError(new Error('No se pudo renderizar una página del PDF.')).message
    ).toBe('No se pudo renderizar una página del PDF.');

    expect(
      normalizePdfConversionError(new Error('Unexpected worker crash')).message
    ).toBe('No se pudo leer el PDF. Comprueba que no esté protegido con contraseña y vuelve a intentarlo.');
  });
});
