/**
 * Maps Spanish provinces to location regions for representation flow
 */

export type LocationRegion = 'cataluna' | 'madrid' | 'valencia' | 'other';

export interface LocationInfo {
  id: LocationRegion;
  label: string;
}

export const LOCATION_LABELS: Record<LocationRegion, string> = {
  cataluna: 'Cataluña',
  madrid: 'Madrid',
  valencia: 'Valencia',
  other: 'Otra provincia'
};

/**
 * Maps a province name to a location region
 * @param province - Province name from DNI extraction (can be null/undefined)
 * @returns Location region (cataluna, madrid, valencia, or other)
 */
export function mapProvinceToLocation(province: string | null | undefined): LocationRegion {
  if (!province) return 'other';

  // Normalize: lowercase + remove accents
  const normalizedProvince = province
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Cataluña provinces (with alternative names)
  const catalunyaProvinces = [
    'barcelona',
    'girona',
    'gerona', // Old spelling
    'lleida',
    'lerida', // Old spelling
    'tarragona'
  ];

  // Madrid
  const madridProvinces = ['madrid'];

  // Valencia provinces (with alternative names)
  const valenciaProvinces = [
    'valencia',
    'alicante',
    'alacant', // Catalan name
    'castellon',
    'castello', // Valencian name
    'castellon de la plana'
  ];

  if (catalunyaProvinces.includes(normalizedProvince)) return 'cataluna';
  if (madridProvinces.includes(normalizedProvince)) return 'madrid';
  if (valenciaProvinces.includes(normalizedProvince)) return 'valencia';

  return 'other';
}

/**
 * Get location info from province
 * @param province - Province name from DNI extraction
 * @returns Location info object with id and label
 */
export function getLocationInfo(province: string | null | undefined): LocationInfo {
  const region = mapProvinceToLocation(province);
  return {
    id: region,
    label: LOCATION_LABELS[region]
  };
}

/**
 * List of all available locations for manual selection
 */
export const AVAILABLE_LOCATIONS: LocationInfo[] = [
  { id: 'cataluna', label: 'Cataluña' },
  { id: 'madrid', label: 'Madrid' },
  { id: 'valencia', label: 'Valencia' },
  { id: 'other', label: 'Otra provincia' }
];
