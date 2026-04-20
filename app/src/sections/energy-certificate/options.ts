export const HEIGHT_OPTIONS = [
  { value: '<2.7m', label: 'Menos de 2,7m' },
  { value: '2.7-3.2m', label: 'Entre 2,7m y 3,2m' },
  { value: '>3.2m', label: 'Más de 3,2m' },
] as const;

export const THERMAL_INSTALLATION_OPTIONS = [
  {
    value: 'termo-electrico',
    label: 'Termo Eléctrico (Sólo ACS)',
    image: 'https://uploads.onecompiler.io/4454edy2w/4454ed8yh/value_image%20(1).png',
  },
  {
    value: 'calentador',
    label: 'Calentador (Sólo ACS)',
    image: 'https://uploads.onecompiler.io/4454edy2w/4454ed8yh/value_image%20(2).png',
  },
  {
    value: 'caldera',
    label: 'Caldera (ACS y calefacción)',
    image: 'https://uploads.onecompiler.io/4454edy2w/4454ed8yh/value_image%20(3).png',
  },
  {
    value: 'aerotermia',
    label: 'Aerotermia',
    image: 'https://uploads.onecompiler.io/4454edy2w/4454ed8yh/value_image.png',
  },
] as const;

export const FUEL_OPTIONS = [
  { value: 'gas', label: 'Gas' },
  { value: 'gasoil', label: 'Gasoil' },
  { value: 'electricidad', label: 'Electricidad' },
  { value: 'aerotermia', label: 'Aerotermia' },
] as const;

export const HEATING_OPTIONS = [
  { value: 'radiadores-agua', label: 'Radiadores de Agua' },
  { value: 'radiadores-electricos', label: 'Radiadores eléctricos' },
  { value: 'suelo-radiante', label: 'Suelo Radiante' },
] as const;

export const RADIATOR_MATERIAL_OPTIONS = [
  { value: 'hierro-fundido', label: 'Hierro fundido' },
  { value: 'aluminio', label: 'Aluminio' },
] as const;

export const FRAME_OPTIONS = [
  { value: 'madera', label: 'Madera' },
  { value: 'aluminio', label: 'Aluminio' },
  { value: 'pvc', label: 'PVC' },
] as const;

export const GLASS_OPTIONS = [
  { value: 'simple', label: 'Simple' },
  { value: 'doble', label: 'Doble vidrio' },
] as const;

export const AIR_TYPE_OPTIONS = [
  { value: 'frio-calor', label: 'Frío y Calor' },
  { value: 'frio', label: 'Frío' },
] as const;

export type SoldProductString =
  | 'solo-paneles'
  | 'solo-aerotermia'
  | 'paneles-y-aerotermia'
  | 'ampliacion'
  | 'ampliacion-y-aerotermia';

export function parseSoldProduct(soldProduct: SoldProductString | null) {
  return {
    hasSolar: soldProduct === 'solo-paneles' || soldProduct === 'paneles-y-aerotermia',
    hasAerothermal:
      soldProduct === 'solo-aerotermia'
      || soldProduct === 'paneles-y-aerotermia'
      || soldProduct === 'ampliacion-y-aerotermia',
    isAmpliacion: soldProduct === 'ampliacion' || soldProduct === 'ampliacion-y-aerotermia',
  };
}

export function deriveSoldProduct(
  hasSolar: boolean,
  hasAerothermal: boolean,
  isAmpliacion: boolean
): SoldProductString | null {
  if (isAmpliacion) {
    return hasAerothermal ? 'ampliacion-y-aerotermia' : 'ampliacion';
  }
  if (hasSolar && hasAerothermal) return 'paneles-y-aerotermia';
  if (hasSolar) return 'solo-paneles';
  if (hasAerothermal) return 'solo-aerotermia';
  return null;
}
