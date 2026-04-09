declare module 'uzip' {
  export function encode(files: Record<string, Uint8Array>): ArrayBuffer;
  export function parse(buffer: ArrayBuffer): Record<string, Uint8Array>;

  const UZIP: {
    encode: typeof encode;
    parse: typeof parse;
  };

  export default UZIP;
}
