/**
 * TDD — Layer 1: provinceMapping.ts
 * First-principles tests covering happy path + bad data conditions.
 * Written BEFORE any code changes (Red → Green → Refactor cycle).
 */

import { describe, it, expect } from 'vitest';
import {
  mapProvinceToLocation,
  getLocationInfo,
  LOCATION_LABELS,
  AVAILABLE_LOCATIONS,
} from './provinceMapping';

// ─────────────────────────────────────────────────────────────────────────────
// mapProvinceToLocation — null / undefined / empty (bad data)
// ─────────────────────────────────────────────────────────────────────────────
describe('mapProvinceToLocation — null / empty / garbage inputs', () => {
  it('returns "other" for null', () => {
    expect(mapProvinceToLocation(null)).toBe('other');
  });

  it('returns "other" for undefined', () => {
    expect(mapProvinceToLocation(undefined)).toBe('other');
  });

  it('returns "other" for empty string', () => {
    expect(mapProvinceToLocation('')).toBe('other');
  });

  it('returns "other" for whitespace-only string', () => {
    expect(mapProvinceToLocation('   ')).toBe('other');
  });

  it('returns "other" for a number-looking string', () => {
    expect(mapProvinceToLocation('08001')).toBe('other');
  });

  it('returns "other" for a completely unknown province', () => {
    expect(mapProvinceToLocation('Cáceres')).toBe('other');
  });

  it('returns "other" for a province in another country', () => {
    expect(mapProvinceToLocation('Paris')).toBe('other');
  });

  it('returns "other" for a SQL-injection-style string', () => {
    expect(mapProvinceToLocation("'; DROP TABLE provinces; --")).toBe('other');
  });

  it('returns "other" for a very long string', () => {
    expect(mapProvinceToLocation('a'.repeat(500))).toBe('other');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapProvinceToLocation — Cataluña (happy path + accent/case variants)
// ─────────────────────────────────────────────────────────────────────────────
describe('mapProvinceToLocation — Cataluña provinces', () => {
  it('maps "Barcelona" (title case) to cataluna', () => {
    expect(mapProvinceToLocation('Barcelona')).toBe('cataluna');
  });

  it('maps "BARCELONA" (uppercase) to cataluna', () => {
    expect(mapProvinceToLocation('BARCELONA')).toBe('cataluna');
  });

  it('maps "barcelona" (lowercase) to cataluna', () => {
    expect(mapProvinceToLocation('barcelona')).toBe('cataluna');
  });

  it('maps "Girona" to cataluna', () => {
    expect(mapProvinceToLocation('Girona')).toBe('cataluna');
  });

  it('maps "Gerona" (old spelling) to cataluna', () => {
    expect(mapProvinceToLocation('Gerona')).toBe('cataluna');
  });

  it('maps "Lleida" to cataluna', () => {
    expect(mapProvinceToLocation('Lleida')).toBe('cataluna');
  });

  it('maps "Lérida" (accented) to cataluna', () => {
    expect(mapProvinceToLocation('Lérida')).toBe('cataluna');
  });

  it('maps "Lerida" (no accent) to cataluna', () => {
    expect(mapProvinceToLocation('Lerida')).toBe('cataluna');
  });

  it('maps "Tarragona" to cataluna', () => {
    expect(mapProvinceToLocation('Tarragona')).toBe('cataluna');
  });

  it('maps "  Barcelona  " (extra whitespace) to cataluna', () => {
    expect(mapProvinceToLocation('  Barcelona  ')).toBe('cataluna');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapProvinceToLocation — Madrid
// ─────────────────────────────────────────────────────────────────────────────
describe('mapProvinceToLocation — Madrid province', () => {
  it('maps "Madrid" (title case) to madrid', () => {
    expect(mapProvinceToLocation('Madrid')).toBe('madrid');
  });

  it('maps "MADRID" (uppercase) to madrid', () => {
    expect(mapProvinceToLocation('MADRID')).toBe('madrid');
  });

  it('does NOT map "Comunidad de Madrid" to madrid (exact match only)', () => {
    expect(mapProvinceToLocation('Comunidad de Madrid')).toBe('other');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapProvinceToLocation — Valencia
// ─────────────────────────────────────────────────────────────────────────────
describe('mapProvinceToLocation — Valencia provinces', () => {
  it('maps "Valencia" to valencia', () => {
    expect(mapProvinceToLocation('Valencia')).toBe('valencia');
  });

  it('maps "Alicante" to valencia', () => {
    expect(mapProvinceToLocation('Alicante')).toBe('valencia');
  });

  it('maps "Alacant" (Valencian name) to valencia', () => {
    expect(mapProvinceToLocation('Alacant')).toBe('valencia');
  });

  it('maps "Castellón" (accented) to valencia', () => {
    expect(mapProvinceToLocation('Castellón')).toBe('valencia');
  });

  it('maps "Castellon" (no accent) to valencia', () => {
    expect(mapProvinceToLocation('Castellon')).toBe('valencia');
  });

  it('maps "Castelló" (Valencian) to valencia', () => {
    expect(mapProvinceToLocation('Castelló')).toBe('valencia');
  });

  it('maps "Castellon de la Plana" to valencia', () => {
    expect(mapProvinceToLocation('Castellon de la Plana')).toBe('valencia');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getLocationInfo — returns correct id + label
// ─────────────────────────────────────────────────────────────────────────────
describe('getLocationInfo', () => {
  it('returns cataluna info for Barcelona', () => {
    const info = getLocationInfo('Barcelona');
    expect(info.id).toBe('cataluna');
    expect(info.label).toBe(LOCATION_LABELS.cataluna);
  });

  it('returns madrid info for Madrid', () => {
    const info = getLocationInfo('Madrid');
    expect(info.id).toBe('madrid');
    expect(info.label).toBe(LOCATION_LABELS.madrid);
  });

  it('returns valencia info for Alicante', () => {
    const info = getLocationInfo('Alicante');
    expect(info.id).toBe('valencia');
    expect(info.label).toBe(LOCATION_LABELS.valencia);
  });

  it('returns other info for null', () => {
    const info = getLocationInfo(null);
    expect(info.id).toBe('other');
    expect(info.label).toBe(LOCATION_LABELS.other);
  });

  it('returns other info for unknown province', () => {
    const info = getLocationInfo('Murcia');
    expect(info.id).toBe('other');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AVAILABLE_LOCATIONS — 'other' must NOT appear (users cannot select it)
// ─────────────────────────────────────────────────────────────────────────────
describe('AVAILABLE_LOCATIONS', () => {
  it('contains exactly 3 entries', () => {
    expect(AVAILABLE_LOCATIONS).toHaveLength(3);
  });

  it('does not include "other" — it is not user-selectable', () => {
    const ids = AVAILABLE_LOCATIONS.map((l) => l.id);
    expect(ids).not.toContain('other');
  });

  it('includes cataluna, madrid, and valencia', () => {
    const ids = AVAILABLE_LOCATIONS.map((l) => l.id);
    expect(ids).toContain('cataluna');
    expect(ids).toContain('madrid');
    expect(ids).toContain('valencia');
  });

  it('every entry has a non-empty label', () => {
    for (const loc of AVAILABLE_LOCATIONS) {
      expect(loc.label.length).toBeGreaterThan(0);
    }
  });
});
