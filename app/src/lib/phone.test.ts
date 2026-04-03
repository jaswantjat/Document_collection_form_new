import { describe, it, expect } from 'vitest';
import { parsePhone, buildPhone, getPhoneError, formatLocalNumber } from './phone';

// ── parsePhone ────────────────────────────────────────────────────────────────

describe('parsePhone', () => {
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
    expect(parsePhone('12345678')).toBeNull();          // Too short, no country code
    expect(parsePhone('1234567890123456')).toBeNull();  // Too long (16 digits)
    expect(parsePhone('512345678')).toBeNull();          // Invalid Spanish start digit
    expect(parsePhone('abc123456')).toBeNull();          // Non-numeric
  });
});

// ── buildPhone ────────────────────────────────────────────────────────────────

describe('buildPhone', () => {
  it('combines dial code and local number', () => {
    expect(buildPhone('+34', '612345678')).toBe('+34612345678');
    expect(buildPhone('+34', '612 345 678')).toBe('+34612345678');
    expect(buildPhone('+44', '7700900000')).toBe('+447700900000');
  });

  it('strips a leading zero from local number (common in UK / DE / FR)', () => {
    expect(buildPhone('+44', '07700900000')).toBe('+447700900000');
    expect(buildPhone('+33', '0612345678')).toBe('+33612345678');
  });

  it('strips multiple leading zeros', () => {
    expect(buildPhone('+34', '00612345678')).toBe('+34612345678');
  });
});

// ── getPhoneError ─────────────────────────────────────────────────────────────

describe('getPhoneError — Spain (+34)', () => {
  it('returns null for valid Spanish mobile numbers', () => {
    expect(getPhoneError('+34', '612345678')).toBeNull();
    expect(getPhoneError('+34', '712345678')).toBeNull();
    expect(getPhoneError('+34', '812345678')).toBeNull();
    expect(getPhoneError('+34', '912345678')).toBeNull();
    expect(getPhoneError('+34', '612 345 678')).toBeNull(); // formatted with spaces
  });

  it('rejects empty local number', () => {
    expect(getPhoneError('+34', '')).toBeTruthy();
    expect(getPhoneError('+34', '   ')).toBeTruthy();
  });

  it('rejects Spanish numbers that are too short', () => {
    expect(getPhoneError('+34', '61234')).toBeTruthy();
    expect(getPhoneError('+34', '61234567')).toBeTruthy(); // 8 digits
  });

  it('rejects Spanish numbers that are too long', () => {
    expect(getPhoneError('+34', '6123456789')).toBeTruthy(); // 10 digits
  });

  it('rejects Spanish numbers starting with 1–5', () => {
    expect(getPhoneError('+34', '512345678')).toBeTruthy();
    expect(getPhoneError('+34', '412345678')).toBeTruthy();
    expect(getPhoneError('+34', '112345678')).toBeTruthy();
  });
});

describe('getPhoneError — international', () => {
  it('returns null for valid UK numbers', () => {
    expect(getPhoneError('+44', '7700900000')).toBeNull();
    expect(getPhoneError('+44', '07700900000')).toBeNull(); // leading 0 stripped by buildPhone
  });

  it('returns null for valid French numbers', () => {
    expect(getPhoneError('+33', '612345678')).toBeNull();
  });

  it('returns null for valid US numbers', () => {
    expect(getPhoneError('+1', '2025550123')).toBeNull();
  });

  it('rejects numbers that are too short after combining', () => {
    expect(getPhoneError('+44', '123')).toBeTruthy();
  });
});

// ── formatLocalNumber ─────────────────────────────────────────────────────────

describe('formatLocalNumber', () => {
  it('formats Spanish numbers as XXX XXX XXX', () => {
    expect(formatLocalNumber('612', '+34')).toBe('612');
    expect(formatLocalNumber('612345', '+34')).toBe('612 345');
    expect(formatLocalNumber('612345678', '+34')).toBe('612 345 678');
  });

  it('returns non-Spanish input unchanged', () => {
    expect(formatLocalNumber('7700900000', '+44')).toBe('7700900000');
  });
});
