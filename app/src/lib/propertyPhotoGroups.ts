import type { UploadedPhoto } from '@/types';

export const PROPERTY_PHOTO_GROUPS = [
  { key: 'electricalPanel', label: 'Cuadro eléctrico' },
  { key: 'roof', label: 'Tejado' },
  { key: 'installationSpace', label: 'Espacio de instalación' },
  { key: 'radiators', label: 'Radiadores' },
] as const;

export type PropertyPhotoGroupKey = typeof PROPERTY_PHOTO_GROUPS[number]['key'];

type PropertyPhotoSlot = {
  photos?: UploadedPhoto[] | null;
} | null | undefined;

export type PropertyPhotoFormData = Partial<Record<PropertyPhotoGroupKey, PropertyPhotoSlot>>;

export interface PropertyPhotoGroup {
  key: PropertyPhotoGroupKey;
  label: string;
  photos: UploadedPhoto[];
}

export function getPropertyPhotoGroups(formData: unknown): PropertyPhotoGroup[] {
  const source = (formData ?? {}) as PropertyPhotoFormData;

  return PROPERTY_PHOTO_GROUPS.map(({ key, label }) => {
    const slot = source[key];
    const photos = Array.isArray(slot?.photos)
      ? slot.photos.filter(Boolean)
      : [];

    return { key, label, photos };
  });
}
