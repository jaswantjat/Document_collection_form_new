import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, MapPin } from 'lucide-react';
import type { FormData } from '@/types';
import { getLocationInfo, AVAILABLE_LOCATIONS, type LocationRegion } from '@/lib/provinceMapping';

interface Props {
  formData: FormData;
  onLocationSelect: (location: LocationRegion) => void;
  onBack: () => void;
  onContinue: () => void;
}

type SelectionState = 'detected' | 'manual' | 'confirmed';

export function ProvinceSelectionSection({ formData, onLocationSelect, onBack, onContinue }: Props) {
  const existingLocation = formData.location ?? formData.representation.location ?? null;
  const [state, setState] = useState<SelectionState>(existingLocation ? 'confirmed' : 'detected');
  const [selectedLocation, setSelectedLocation] = useState<LocationRegion | null>(existingLocation);

  // Extract province from DNI back
  const province = formData.dni?.back?.extraction?.extractedData?.province;
  const locationInfo = getLocationInfo(province);

  const handleConfirm = () => {
    onLocationSelect(locationInfo.id);
    setSelectedLocation(locationInfo.id);
    setState('confirmed');
  };

  const handleManualSelect = (locationId: LocationRegion) => {
    onLocationSelect(locationId);
    setSelectedLocation(locationId);
    setState('confirmed');
  };

  const handleChange = () => {
    setState('manual');
  };

  const canContinue = state === 'confirmed' && selectedLocation !== null;

  return (
    <div className="min-h-screen bg-white p-5 pb-28">
      <div className="max-w-sm mx-auto space-y-5">

        {/* Header */}
        <div className="pt-2 pb-2">
          <h1 className="text-2xl font-bold text-gray-900">Ubicación</h1>
          <p className="text-gray-400 text-sm mt-1">
            Confirma tu provincia para adaptar el proceso.
          </p>
        </div>

        {/* Detected State */}
        {state === 'detected' && province && (
          <div className="bg-white rounded-2xl border-2 border-green-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <MapPin className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500">Ubicación detectada</p>
                <p className="text-xl font-semibold text-gray-900">{locationInfo.label}</p>
                <p className="text-xs text-gray-400 mt-1">Detectada desde tu DNI</p>
              </div>
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Confirmar
              </button>
              <button
                type="button"
                onClick={handleChange}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-xl transition-colors"
              >
                Cambiar
              </button>
            </div>
          </div>
        )}

        {/* No Detection State */}
        {state === 'detected' && !province && (
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <MapPin className="w-6 h-6 text-gray-400" />
              </div>
              <div className="flex-1">
                <p className="text-lg font-semibold text-gray-900">Provincia no detectada</p>
                <p className="text-sm text-gray-500 mt-1">
                  No pudimos detectar tu provincia desde el DNI. Por favor, selecciónala manualmente.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setState('manual')}
              className="w-full bg-eltex-blue hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
            >
              Seleccionar manualmente
            </button>
          </div>
        )}

        {/* Manual Selection State */}
        {state === 'manual' && (
          <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 space-y-4">
            <div className="text-center mb-4">
              <p className="text-lg font-semibold text-gray-900">Selecciona tu ubicación</p>
              <p className="text-sm text-gray-500 mt-1">Elige la región donde se encuentra la propiedad</p>
            </div>

            <div className="space-y-2">
              {AVAILABLE_LOCATIONS.map((location) => {
                const isSelected = selectedLocation === location.id;
                return (
                  <button
                    key={location.id}
                    type="button"
                    onClick={() => handleManualSelect(location.id)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isSelected ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          <MapPin className={`w-5 h-5 ${isSelected ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <span className={`font-semibold ${isSelected ? 'text-green-700' : 'text-gray-700'}`}>
                          {location.label}
                        </span>
                      </div>
                      {isSelected && (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {province && (
              <button
                type="button"
                onClick={() => setState('detected')}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
              >
                ← Volver a la detección automática
              </button>
            )}
          </div>
        )}

        {/* Confirmed State */}
        {state === 'confirmed' && selectedLocation && (
          <div className="bg-white rounded-2xl border-2 border-green-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500">Ubicación confirmada</p>
                <p className="text-xl font-semibold text-gray-900">
                  {AVAILABLE_LOCATIONS.find(l => l.id === selectedLocation)?.label}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800">
            <strong>¿Por qué necesitamos esto?</strong><br />
            La documentación y los requisitos varían según la región. Por ejemplo, en Cataluña se requieren trámites adicionales con la Generalitat.
          </p>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="btn-secondary flex items-center gap-1.5 px-5"
          >
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
