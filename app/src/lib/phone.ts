/**
 * Phone number utilities — shared by PhoneSection and unit tests.
 *
 * Spanish numbers:  9 digits starting with 6, 7, 8 or 9  (+34)
 * International:    E.164 structural check (7–15 digits after the country code)
 */

/**
 * Parse and normalise a raw phone string to E.164 format.
 * Accepts:
 *  - Spanish 9-digit bare numbers (6/7/8/9 start) → +34XXXXXXXXX
 *  - +CC… E.164 format → returned as-is (normalised)
 *  - 00CC… international prefix → converted to +CC…
 *
 * Returns null when the input cannot be parsed as a structurally valid number.
 */
export function parsePhone(raw: string): string | null {
  let clean = raw.replace(/[\s\-.()\u00A0]/g, '');

  if (/^00\d/.test(clean)) clean = '+' + clean.slice(2);

  if (clean.startsWith('+')) {
    const digits = clean.slice(1);
    if (/^\d{7,15}$/.test(digits)) return '+' + digits;
    return null;
  }

  if (/^\d{9}$/.test(clean) && /^[6-9]/.test(clean)) return '+34' + clean;

  return null;
}

/**
 * Combine a dial code ("+34") and a user-typed local number into a
 * single string ready for parsePhone / server lookup.
 *
 * Strips whitespace, dashes, dots, parentheses and a single leading zero
 * (common in countries like UK where locals write "07700 900000").
 */
export function buildPhone(dialCode: string, localNumber: string): string {
  const digits = localNumber.replace(/[\s\-.()\u00A0]/g, '').replace(/^0+/, '');
  return dialCode + digits;
}

/**
 * Format a local number for display while the user types.
 * Spain (+34): formats as XXX XXX XXX (9 digits max).
 * All other countries: returned unchanged.
 */
export function formatLocalNumber(raw: string, dialCode: string): string {
  const digits = raw.replace(/\D/g, '');
  if (dialCode === '+34' && digits.length <= 9) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  }
  return raw;
}

/**
 * Validate the dial-code + local-number pair and return a user-facing
 * error string, or null when the number is valid.
 *
 * Spain (+34) uses country-specific rules:
 *   - exactly 9 local digits
 *   - must start with 6, 7, 8 or 9 (mobiles and landlines)
 *
 * All other countries use a structural E.164 check (7–15 total digits).
 */
export function getPhoneError(dialCode: string, localNumber: string): string | null {
  if (!localNumber.trim()) return 'El teléfono es obligatorio.';

  if (dialCode === '+34') {
    const digits = localNumber.replace(/\D/g, '');
    if (digits.length < 9) return 'Número incompleto (9 dígitos necesarios).';
    if (digits.length > 9) return 'Número demasiado largo (9 dígitos máximo para España).';
    if (!/^[6-9]/.test(digits)) return 'El número debe empezar por 6, 7, 8 o 9.';
    return null;
  }

  const combined = buildPhone(dialCode, localNumber);
  if (!parsePhone(combined)) return 'Número incompleto o no válido.';
  return null;
}
