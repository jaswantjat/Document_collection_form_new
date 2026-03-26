import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, MapPin, Building2, User } from 'lucide-react';
import type { FormData, RepresentationData } from '@/types';
import { getLocationInfo, AVAILABLE_LOCATIONS, type LocationRegion } from '@/lib/provinceMapping';

interface Props {
  formData: FormData;
  representationData: RepresentationData;
  onLocationSelect: (location: LocationRegion) => void;
  onRepresentationChange: (patch: Partial<RepresentationData>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function ProvinceSelectionSection({
  formData,
  representationData,
  onLocationSelect,
  onRepresentationChange,
  onBack,
  onContinue,
}: Props) {
  const existingLocation = formData.location ?? formData.representation.location ?? null;
  const [locationConfirmed, setLocationConfirmed] = useState(!!existingLocation);
  const [showManual, setShowManual] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationRegion | null>(existingLocation);
  const locationConfirmedRef = useRef(!!existingLocation);
  const showManualRef = useRef(false);

  // Province comes only from electricity bill — never from DNI or IBI
  function getAutoProvince(): string | null {
    for (const page of formData.electricityBill?.pages ?? []) {
      const prov = page.extraction?.extractedData?.provincia;
      if (prov) return prov;
    }
    return null;
  }
  const province = getAutoProvince();
  const locationInfo = province ? getLocationInfo(province) : null;

  const data = representationData;
  const update = (patch: Partial<RepresentationData>) => onRepresentationChange(patch);

  const confirmLocation = (loc: LocationRegion) => {
    onLocationSelect(loc);
    setSelectedLocation(loc);
    setLocationConfirmed(true);
    locationConfirmedRef.current = true;
    setShowManual(false);
    showManualRef.current = false;
  };

  // Auto-confirm when province is detected and maps to a known region
  useEffect(() => {
    if (locationConfirmedRef.current || showManualRef.current || !province) return;
    const locInfo = getLocationInfo(province);
    if (locInfo.id === 'other') return;
    // Brief delay so user sees "Detected" before it auto-confirms
    const timer = setTimeout(() => {
      // Re-check refs to avoid stale closure overriding user action
      if (!locationConfirmedRef.current && !showManualRef.current) {
        confirmLocation(locInfo.id);
      }
    }, 350);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province]);

  const canContinue =
    locationConfirmed &&
    selectedLocation !== null &&
    (!data.isCompany || (data.companyName.trim() !== '' && data.companyNIF.trim() !== ''));

  return (
    <div className="min-h-screen bg-white p-5 pb-28">
      <div className="max-w-sm mx-auto space-y-5">

        <div className="pt-2 pb-2">
          <h1 className="text-2xl font-bold text-gray-900">Ubicación</h1>
          <p className="text-gray-400 text-sm mt-1">
            Confirma tu provincia e indica si el titular es una empresa.
          </p>
        </div>

        {/* ── Location block ─────────────────────────────────────── */}
        {!locationConfirmed && !showManual && province && (
          <div className="bg-white rounded-2xl border-2 border-green-200 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500">Detectada automáticamente</p>
                <p className="text-lg font-semibold text-gray-900">{locationInfo?.label}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => locationInfo && confirmLocation(locationInfo.id)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Confirmar
              </button>
              <button
                type="button"
                onClick={() => { setShowManual(true); showManualRef.current = true; }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition-colors"
              >
                Cambiar
              </button>
            </div>
          </div>
        )}

        {!locationConfirmed && !showManual && !province && (
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-600">No pudimos detectar tu provincia. Selecciónala manualmente.</p>
            </div>
            <button
              type="button"
              onClick={() => { setShowManual(true); showManualRef.current = true; }}
              className="w-full bg-eltex-blue hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors"
            >
              Seleccionar provincia
            </button>
          </div>
        )}

        {showManual && (
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-800">Selecciona tu ubicación</p>
            <div className="space-y-2">
              {AVAILABLE_LOCATIONS.map((location) => {
                const isSelected = selectedLocation === location.id;
                return (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => confirmLocation(location.id)}
                    className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${
                      isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isSelected ? 'bg-green-100' : 'bg-gray-100'}`}>
                      <MapPin className={`w-4 h-4 ${isSelected ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    <span className={`font-semibold ${isSelected ? 'text-green-700' : 'text-gray-700'}`}>{location.label}</span>
                    {isSelected && <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />}
                  </button>
                );
              })}
            </div>
            {province && (
              <button
                type="button"
                onClick={() => setShowManual(false)}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 py-1"
              >
                ← Volver a la detección automática
              </button>
            )}
          </div>
        )}

        {locationConfirmed && selectedLocation && (
          <div
            className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-green-100 transition-colors"
            onClick={() => { setLocationConfirmed(false); setShowManual(true); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && (setLocationConfirmed(false), setShowManual(true))}
          >
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500">Ubicación confirmada</p>
              <p className="font-semibold text-green-800">
                {AVAILABLE_LOCATIONS.find(l => l.id === selectedLocation)?.label}
              </p>
            </div>
            <span className="text-xs text-gray-400">Cambiar</span>
          </div>
        )}

        {/* ── Company question (appears once location is set) ────── */}
        {locationConfirmed && (
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-eltex-blue" />
              ¿El titular es una empresa? <span className="text-eltex-error ml-0.5">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: true, label: 'Sí, es empresa', icon: <Building2 className="w-4 h-4" /> },
                { val: false, label: 'No, particular', icon: <User className="w-4 h-4" /> },
              ].map(opt => (
                <button
                  key={String(opt.val)}
                  type="button"
                  onClick={() =>
                    update({
                      isCompany: opt.val,
                      ...(!opt.val ? { companyName: '', companyNIF: '', companyAddress: '', companyMunicipality: '', companyPostalCode: '' } : {}),
                    })
                  }
                  className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all flex items-center justify-center gap-2 ${
                    data.isCompany === opt.val
                      ? 'border-eltex-blue bg-eltex-blue text-white'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>

            {data.isCompany && (
              <div className="space-y-3 bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> Datos de la empresa
                </p>
                <Field
                  label="Nombre de la empresa"
                  required
                  value={data.companyName}
                  onChange={v => update({ companyName: v })}
                  placeholder="Empresa S.L."
                />
                <Field
                  label="NIF de la empresa"
                  required
                  value={data.companyNIF}
                  onChange={v => update({ companyNIF: v })}
                  placeholder="B12345678"
                />
                <Field
                  label="Dirección de la empresa"
                  value={data.companyAddress}
                  onChange={v => update({ companyAddress: v })}
                  placeholder="Calle, número, piso"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Municipio"
                    value={data.companyMunicipality}
                    onChange={v => update({ companyMunicipality: v })}
                    placeholder="Madrid"
                  />
                  <Field
                    label="Código postal"
                    value={data.companyPostalCode}
                    onChange={v => update({ companyPostalCode: v })}
                    placeholder="28001"
                    maxLength={5}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────────── */}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onBack} className="btn-secondary flex items-center gap-1.5 px-5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continuar <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, required, maxLength,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; required?: boolean; maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-gray-600 font-medium">
        {label} {required && <span className="text-eltex-error">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="form-input"
        maxLength={maxLength}
      />
    </div>
  );
}
