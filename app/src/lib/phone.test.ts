import { describe, it, expect } from 'vitest';

/**
 * Parse and normalise a phone number — Spanish or international.
 * (Copied from PhoneSection.tsx for unit testing)
 */
function parsePhone(raw: string): string | null {
  // Strip spaces, dashes, dots, parentheses — keep + and digits
  let clean = raw.replace(/[\s\-.()\u00A0]/g, '');

  // Convert 00XX international prefix → +XX
  if (/^00\d/.test(clean)) clean = '+' + clean.slice(2);

  // International format: starts with +
  if (clean.startsWith('+')) {
    const digits = clean.slice(1);
    // E.164 allows 7–15 digits after the country code
    if (/^\d{7,15}$/.test(digits)) return '+' + digits;
    return null;
  }

  // Spanish shorthand: exactly 9 digits starting with 6, 7, 8, or 9
  if (/^\d{9}$/.test(clean) && /^[6-9]/.test(clean)) {
    return '+34' + clean;
  }

  return null;
}

describe('parsePhone (Frontend)', () => {
  it('UNIT-PHONE-01: accepts Spanish 9-digit numbers', () => {
    expect(parsePhone('612345678')).toBe('+34612345678');
    expect(parsePhone('912345678')).toBe('+34912345678');
    expect(parsePhone('712345678')).toBe('+34712345678');
    expect(parsePhone('812345678')).toBe('+34812345678');
  });

  it('UNIT-PHONE-02: accepts Spanish numbers with +34 prefix', () => {
    expect(parsePhone('+34612345678')).toBe('+34612345678');
    expect(parsePhone('+34 612 345 678')).toBe('+34612345678');
  });

  it('UNIT-PHONE-03: accepts UK numbers (+44)', () => {
    expect(parsePhone('+447700900000')).toBe('+447700900000');
    expect(parsePhone('+44 7700 900000')).toBe('+447700900000');
  });

  it('UNIT-PHONE-04: accepts French numbers (+33)', () => {
    expect(parsePhone('+33612345678')).toBe('+33612345678');
  });

  it('UNIT-PHONE-05: accepts US numbers (+1)', () => {
    expect(parsePhone('+12025550123')).toBe('+12025550123');
  });

  it('UNIT-PHONE-06: accepts 00XX international prefix', () => {
    expect(parsePhone('0034612345678')).toBe('+34612345678');
    expect(parsePhone('00447700900000')).toBe('+447700900000');
  });

  it('rejects invalid numbers', () => {
    expect(parsePhone('12345678')).toBeNull(); // Too short
    expect(parsePhone('1234567890123456')).toBeNull(); // Too long (16 digits)
    expect(parsePhone('512345678')).toBeNull(); // Invalid Spanish start digit
    expect(parsePhone('abc123456')).toBeNull(); // Non-numeric
  });
});
