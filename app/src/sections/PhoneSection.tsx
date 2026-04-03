import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowRight, Loader2, UserPlus, Search, ChevronDown, X } from 'lucide-react';
import type { ProjectData } from '@/types';
import { lookupByPhone, createProject } from '@/services/api';
import { COUNTRIES_SORTED, TOP_COUNTRIES, findCountry, type Country } from '@/lib/countries';
import { buildPhone, getPhoneError, formatLocalNumber } from '@/lib/phone';

interface Props {
  onPhoneConfirmed: (phone: string, project: ProjectData) => void;
  onContinue: () => void;
}

// ── Country Picker Sheet ─────────────────────────────────────────────────────

interface PickerProps {
  current: Country;
  onSelect: (country: Country) => void;
  onClose: () => void;
}

function CountryPickerSheet({ current, onSelect, onClose }: PickerProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    // Prevent body scroll when sheet is open
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Dismiss on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.toLowerCase().trim();
  const filtered = q
    ? COUNTRIES_SORTED.filter(
        c => c.name.toLowerCase().includes(q) || c.code.includes(q)
      )
    : COUNTRIES_SORTED;

  const showTop = !q;

  const handleSelect = (country: Country) => {
    onSelect(country);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label="Seleccionar país"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-3 border-b border-gray-100">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar país o prefijo..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-100 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-eltex-blue/30"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 transition-colors shrink-0"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {showTop && (
          <>
            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Países frecuentes</p>
            {TOP_COUNTRIES.map(country => (
              <CountryRow
                key={`top-${country.code}-${country.name}`}
                country={country}
                active={country.code === current.code && country.name === current.name}
                onSelect={handleSelect}
              />
            ))}
            <div className="mx-4 my-2 border-t border-gray-100" />
            <p className="px-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">Todos los países</p>
          </>
        )}

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-sm text-gray-400 text-center">Sin resultados para &ldquo;{query}&rdquo;</p>
        ) : (
          filtered.map(country => (
            <CountryRow
              key={`all-${country.code}-${country.name}`}
              country={country}
              active={country.code === current.code && country.name === current.name}
              onSelect={handleSelect}
            />
          ))
        )}

        {/* Bottom padding for safe area */}
        <div className="h-6" />
      </div>
    </div>
  );
}

interface CountryRowProps {
  country: Country;
  active: boolean;
  onSelect: (c: Country) => void;
}

function CountryRow({ country, active, onSelect }: CountryRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(country)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors ${
        active ? 'bg-eltex-blue/5' : ''
      }`}
    >
      <span className="text-2xl leading-none w-8 shrink-0">{country.flag}</span>
      <span className="flex-1 text-sm text-gray-900">{country.name}</span>
      <span className={`text-sm tabular-nums shrink-0 ${active ? 'text-eltex-blue font-semibold' : 'text-gray-400'}`}>
        {country.code}
      </span>
    </button>
  );
}

// ── Main Section ──────────────────────────────────────────────────────────────

export function PhoneSection({ onPhoneConfirmed }: Props) {
  const [country, setCountry] = useState<Country>(findCountry('+34'));
  const [localNumber, setLocalNumber] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Set<'solar' | 'aerothermal'>>(new Set(['solar']));
  const [newAssessor, setNewAssessor] = useState('');
  const numberInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { numberInputRef.current?.focus(); }, []);

  const liveError = touched ? getPhoneError(country.code, localNumber) : null;

  const handleCountrySelect = useCallback((selected: Country) => {
    setCountry(selected);
    setLocalNumber('');
    setTouched(false);
    setError('');
    setTimeout(() => numberInputRef.current?.focus(), 50);
  }, []);

  const handleNumberChange = (raw: string) => {
    const formatted = formatLocalNumber(raw, country.code);
    setLocalNumber(formatted);
    setError('');
    setTouched(true);
  };

  const lookup = async () => {
    setTouched(true);
    const err = getPhoneError(country.code, localNumber);
    if (err) { setError(err); return; }
    const combined = buildPhone(country.code, localNumber);
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
    const err = getPhoneError(country.code, localNumber);
    if (err) { setError(err); return; }
    const combined = buildPhone(country.code, localNumber);
    setLoading(true); setError('');
    try {
      const productType = selectedProducts.has('solar') && selectedProducts.has('aerothermal')
        ? 'solar-aerothermal'
        : selectedProducts.has('aerothermal') ? 'aerothermal' : 'solar';
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

  const displayPhone = `${country.code} ${localNumber}`.trim();

  return (
    <>
      {showPicker && (
        <CountryPickerSheet
          current={country}
          onSelect={handleCountrySelect}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
        <div className="w-full max-w-sm space-y-8">

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
                <div className="flex gap-2">
                  {/* Country trigger button */}
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    aria-label={`País: ${country.name} ${country.code}. Toca para cambiar.`}
                    className="form-input !w-auto shrink-0 flex items-center gap-1.5 px-3 cursor-pointer active:bg-gray-50"
                    style={{ minWidth: '5.25rem' }}
                  >
                    <span className="text-xl leading-none">{country.flag}</span>
                    <span className="text-sm font-medium text-gray-700 tabular-nums">{country.code}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  </button>

                  {/* Local number */}
                  <input
                    ref={numberInputRef}
                    type="tel"
                    inputMode="numeric"
                    value={localNumber}
                    onChange={e => handleNumberChange(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && lookup()}
                    placeholder={country.placeholder}
                    autoComplete="tel-national"
                    maxLength={18}
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
                <p className="text-gray-400 text-sm">
                  No existe expediente para <strong className="text-gray-700">{displayPhone}</strong>. Completa los datos para crearlo.
                </p>
              </div>

              <div className="space-y-4">
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
                            if (next.has(pt.id)) { if (next.size > 1) next.delete(pt.id); }
                            else { next.add(pt.id); }
                            return next;
                          })}
                          className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all relative ${
                            active ? 'border-eltex-blue bg-eltex-blue text-white' : 'border-gray-200 bg-white text-gray-600'
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
    </>
  );
}
