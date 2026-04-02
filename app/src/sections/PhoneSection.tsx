import { useState, useRef, useEffect } from 'react';
import { ArrowRight, Loader2, UserPlus } from 'lucide-react';
import type { ProjectData } from '@/types';
import { lookupByPhone, createProject } from '@/services/api';

interface Props {
  onPhoneConfirmed: (phone: string, project: ProjectData) => void;
  onContinue: () => void;
}

const DIAL_CODES = [
  { code: '+34', flag: '🇪🇸', label: 'España',       placeholder: '612 345 678' },
  { code: '+44', flag: '🇬🇧', label: 'Reino Unido',  placeholder: '7700 900000' },
  { code: '+351', flag: '🇵🇹', label: 'Portugal',     placeholder: '912 345 678' },
  { code: '+33', flag: '🇫🇷', label: 'Francia',       placeholder: '6 12 34 56 78' },
  { code: '+49', flag: '🇩🇪', label: 'Alemania',      placeholder: '151 12345678' },
  { code: '+39', flag: '🇮🇹', label: 'Italia',        placeholder: '312 345 6789' },
  { code: '+31', flag: '🇳🇱', label: 'Países Bajos',  placeholder: '6 12345678' },
  { code: '+1',  flag: '🇺🇸', label: 'EE. UU. / CA', placeholder: '202 555 0123' },
] as const;

/**
 * Parse and normalise a phone number — Spanish or international.
 *
 * Accepts:
 *  - Spanish 9-digit numbers starting with 6/7/8/9 (with or without +34 / 0034 prefix)
 *  - Any international number in E.164 format (+CC…) or with 00CC prefix
 *
 * Returns the normalised E.164 string (e.g. "+34612345678", "+447700900000")
 * or null if the input cannot be parsed as a valid phone number.
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

/** Build the E.164 string from the split dial-code + local-number fields. */
function buildPhone(dialCode: string, localNumber: string): string {
  // Strip leading zero (some countries write local numbers with a leading 0)
  const digits = localNumber.replace(/[\s\-.()\u00A0]/g, '').replace(/^0/, '');
  return dialCode + digits;
}

function getPhoneError(dialCode: string, localNumber: string): string | null {
  if (!localNumber.trim()) return 'El teléfono es obligatorio.';
  const combined = buildPhone(dialCode, localNumber);
  if (!parsePhone(combined)) return 'Número incompleto o no válido.';
  return null;
}

export function PhoneSection({ onPhoneConfirmed }: Props) {
  const [dialCode, setDialCode] = useState('+34');
  const [localNumber, setLocalNumber] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Set<'solar' | 'aerothermal'>>(new Set(['solar']));
  const [newAssessor, setNewAssessor] = useState('');
  const numberInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { numberInputRef.current?.focus(); }, []);

  const selectedDialEntry = DIAL_CODES.find(d => d.code === dialCode) ?? DIAL_CODES[0];

  // Live validation once the field has been touched
  const liveError = touched ? getPhoneError(dialCode, localNumber) : null;

  const lookup = async () => {
    setTouched(true);
    const err = getPhoneError(dialCode, localNumber);
    if (err) { setError(err); return; }
    const combined = buildPhone(dialCode, localNumber);
    setLoading(true); setError('');
    try {
      const res = await lookupByPhone(combined);
      if (res.success && res.project) { onPhoneConfirmed(combined, res.project); }
      else { setShowNewForm(true); }
    } catch { setError('Sin conexión. Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  };

  const create = async () => {
    setTouched(true);
    const err = getPhoneError(dialCode, localNumber);
    if (err) { setError(err); return; }
    const combined = buildPhone(dialCode, localNumber);
    setLoading(true); setError('');
    try {
      const productType = selectedProducts.has('solar') && selectedProducts.has('aerothermal')
        ? 'solar-aerothermal'
        : selectedProducts.has('aerothermal')
          ? 'aerothermal'
          : 'solar';
      const res = await createProject({
        phone: combined,
        email: newEmail.trim() || undefined,
        productType,
        assessor: newAssessor.trim() || undefined,
      });
      if (res.success && res.project) { onPhoneConfirmed(combined, res.project); }
      else { setError(res.message || 'No se pudo crear el expediente.'); }
    } catch { setError('Sin conexión. Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  };

  const displayPhone = `${dialCode} ${localNumber}`.trim();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="flex justify-center">
          <img src="/eltex-logo.png" alt="Eltex" className="h-9 object-contain" />
        </div>

        {!showNewForm ? (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-gray-900">Teléfono del cliente</h1>
              <p className="text-gray-400 text-sm">Introduce el número para localizar o crear su expediente.</p>
            </div>

            <div className="space-y-3">
              {/* Country code + number row */}
              <div className={`flex gap-2 ${(liveError || error) ? 'has-error' : ''}`}>
                {/* Dial-code picker */}
                <div className="relative shrink-0">
                  <select
                    value={dialCode}
                    onChange={e => {
                      setDialCode(e.target.value);
                      setLocalNumber('');
                      setTouched(false);
                      setError('');
                      setTimeout(() => numberInputRef.current?.focus(), 0);
                    }}
                    aria-label="Prefijo internacional"
                    className="form-input !w-auto appearance-none pr-7 pl-3 text-base cursor-pointer"
                    style={{ minWidth: '5.5rem' }}
                  >
                    {DIAL_CODES.map(d => (
                      <option key={d.code} value={d.code}>
                        {d.flag} {d.code}
                      </option>
                    ))}
                  </select>
                  {/* Custom chevron */}
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
                </div>

                {/* Local number */}
                <input
                  ref={numberInputRef}
                  type="tel"
                  inputMode="numeric"
                  value={localNumber}
                  onChange={e => {
                    setLocalNumber(e.target.value);
                    setError('');
                    setTouched(true);
                  }}
                  onKeyDown={e => e.key === 'Enter' && lookup()}
                  placeholder={selectedDialEntry.placeholder}
                  autoComplete="tel-national"
                  maxLength={15}
                  className={`form-input text-lg flex-1 min-w-0 ${(liveError || error) ? 'error' : ''}`}
                />
              </div>

              {(liveError || error) && (
                <p className="text-sm text-red-500">{liveError || error}</p>
              )}

              <button
                type="button"
                onClick={lookup}
                disabled={loading}
                className="btn-primary flex items-center justify-center gap-2 text-base py-3.5"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continuar <ArrowRight className="w-5 h-5" /></>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-gray-900">Nuevo expediente</h1>
              <p className="text-gray-400 text-sm">No existe expediente para <strong className="text-gray-700">{displayPhone}</strong>. Completa los datos para crearlo.</p>
            </div>

            <div className="space-y-4">
              {/* Product */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">Producto</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'solar', label: 'Solar', icon: '☀️' },
                    { id: 'aerothermal', label: 'Aerotermia', icon: '🌡️' },
                  ] as const).map(pt => {
                    const active = selectedProducts.has(pt.id);
                    return (
                      <button
                        key={pt.id}
                        type="button"
                        onClick={() => setSelectedProducts(prev => {
                          const next = new Set(prev);
                          if (next.has(pt.id)) {
                            if (next.size > 1) next.delete(pt.id);
                          } else {
                            next.add(pt.id);
                          }
                          return next;
                        })}
                        className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all relative ${
                          active
                            ? 'border-eltex-blue bg-eltex-blue text-white'
                            : 'border-gray-200 bg-white text-gray-600'
                        }`}
                      >
                        <span className="block text-xl mb-0.5">{pt.icon}</span>
                        {pt.label}
                        {active && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px]">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedProducts.size === 2 && (
                  <p className="text-xs text-eltex-blue font-medium text-center">Combo Solar + Aerotermia seleccionado</p>
                )}
              </div>

              {/* Assessor */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-gray-700">Tu nombre (asesor)</p>
                <input
                  type="text"
                  value={newAssessor}
                  onChange={e => setNewAssessor(e.target.value)}
                  placeholder="Nombre completo"
                  className="form-input"
                  autoFocus
                />
              </div>

              {/* Email optional */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-gray-700">Email del cliente <span className="text-gray-400 font-normal">(opcional)</span></p>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="form-input"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowNewForm(false); setError(''); }}
                  className="btn-secondary px-4"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={loading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4" /> Crear expediente</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
