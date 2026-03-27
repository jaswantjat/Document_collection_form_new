import { useState, useCallback, useRef } from 'react';
import { ArrowRight, ArrowLeft, Camera, Zap, Home, Sun, Thermometer, Plus, X, AlertTriangle } from 'lucide-react';
import type { FormData, UploadedPhoto, ProductType, FormErrors } from '@/types';
import { validatePhoto, createUploadedPhoto, fileToPreview, expandUploadFiles } from '@/lib/photoValidation';

interface Props {
  productType: ProductType;
  formData: FormData;
  errors: FormErrors;
  setElectricalPanelPhotos: (photos: UploadedPhoto[]) => void;
  updateInstallationSpace: (field: string, value: unknown) => void;
  updateRoof: (field: string, value: unknown) => void;
  updateRadiators: (field: string, value: unknown) => void;
  onBack: () => void;
  onContinue: () => void;
}

// ─── Multi Photo Uploader ─────────────────────────────────────────────────────

interface MultiPhotoProps {
  photos: UploadedPhoto[];
  minRequired: number;
  maxPhotos?: number;
  label: string;
  hint: string;
  onChange: (photos: UploadedPhoto[]) => void;
  error?: string;
}

function MultiPhotoUploader({ photos, maxPhotos = 6, label, hint, onChange, error }: MultiPhotoProps) {
  const [validationError, setValidationError] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList) => {
    setValidationError('');
    setUploading(true);
    try {
      const remaining = maxPhotos - photos.length;
      const { files: expandedFiles, errors } = await expandUploadFiles(Array.from(files));
      const toProcess = expandedFiles.slice(0, remaining);
      const newPhotos: UploadedPhoto[] = [];
      let nextError = errors[0]?.message || '';

      for (const { file, skipBlurCheck } of toProcess) {
        const result = await validatePhoto(file, { skipBlurCheck });
        if (!result.valid) {
          nextError ||= result.error || 'Archivo no válido';
          continue;
        }
        const preview = await fileToPreview(file);
        newPhotos.push(createUploadedPhoto(file, preview, result.width, result.height));
      }

      if (!nextError && expandedFiles.length > remaining) {
        nextError = `Solo se han añadido ${remaining} archivo${remaining === 1 ? '' : 's'} porque este bloque admite un máximo de ${maxPhotos}.`;
      }

      setValidationError(nextError);
      if (newPhotos.length > 0) {
        onChange([...photos, ...newPhotos]);
      }
    } finally {
      setUploading(false);
    }
  }, [photos, maxPhotos, onChange]);

  const removePhoto = (id: string) => {
    onChange(photos.filter(p => p.id !== id));
  };

  const canAdd = photos.length < maxPhotos;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
        </div>
        {photos.length > 0 && (
          <div className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700">
            {photos.length} foto{photos.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Photo grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map(photo => (
            <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden group">
              <img src={photo.preview} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                className="absolute top-1 right-1 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <X className="w-3.5 h-3.5 text-gray-700" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {canAdd && (
        <label
          className={`upload-zone flex flex-col items-center justify-center p-5 text-center cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={e => {
              const nextFiles = e.target.files;
              e.target.value = '';
              if (nextFiles) handleFiles(nextFiles);
            }}
          />
          {uploading ? (
            <div className="w-5 h-5 border-2 border-eltex-blue border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-eltex-blue-light flex items-center justify-center mb-2">
                <Plus className="w-5 h-5 text-eltex-blue" />
              </div>
              <p className="text-sm text-gray-600">
                {photos.length === 0 ? 'Añadir fotos' : 'Añadir más'}
              </p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG o PDF · Máx. 20MB</p>
            </>
          )}
        </label>
      )}

      {(validationError || error) && (
        <div className="flex items-center gap-2 text-xs text-eltex-error">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {validationError || error}
        </div>
      )}
    </div>
  );
}

// ─── Select Field ─────────────────────────────────────────────────────────────

function SelectField({
  label, value, onChange, options, error,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label} <span className="text-eltex-error">*</span>
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`form-input ${error ? 'error' : ''}`}
      >
        <option value="">Seleccionar...</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-eltex-error mt-1">{error}</p>}
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, error, suffix,
}: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string; error?: string; suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        {label} <span className="text-eltex-error">*</span>
      </label>
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`form-input ${suffix ? 'pr-12' : ''} ${error ? 'error' : ''}`}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-eltex-error mt-1">{error}</p>}
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="form-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-eltex-blue-light flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PropertyPhotosSection({
  productType,
  formData,
  setElectricalPanelPhotos,
  updateInstallationSpace,
  updateRoof,
  updateRadiators,
  onBack,
  onContinue,
}: Props) {
  return (
    <div className="min-h-screen p-4 pb-28">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="form-card p-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-full bg-eltex-blue-light flex items-center justify-center">
              <Camera className="w-4 h-4 text-eltex-blue" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Fotos del inmueble</h2>
          </div>
          <p className="text-sm text-gray-500 ml-11">
            Estas fotos ayudan al equipo técnico a preparar la instalación. Asegúrate de que sean claras y bien iluminadas.
          </p>
        </div>

        {/* Electrical Panel — always required */}
        <SectionCard
          icon={<Zap className="w-4 h-4 text-eltex-blue" />}
          title="Cuadro eléctrico"
          subtitle="Foto del cuadro de fusibles / ICP (opcional)."
        >
          <MultiPhotoUploader
            photos={formData.electricalPanel.photos}
            minRequired={2}
            label="Fotos del cuadro eléctrico"
            hint="Vista frontal abierta mostrando todos los interruptores y etiquetas."
            onChange={setElectricalPanelPhotos}
          />
        </SectionCard>

        {/* Solar: Roof */}
        {productType === 'solar' && (
          <SectionCard
            icon={<Sun className="w-4 h-4 text-eltex-blue" />}
            title="Tejado"
            subtitle="Fotos y dimensiones del tejado (opcional)."
          >
            <MultiPhotoUploader
              photos={formData.roof.photos}
              minRequired={2}
              label="Fotos del tejado"
              hint="Foto panorámica desde arriba y foto de la superficie. Incluye el perímetro completo."
              onChange={(photos) => updateRoof('photos', photos)}
            />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <TextField
                label="Largo del tejado"
                value={formData.roof.lengthM}
                onChange={v => updateRoof('lengthM', v)}
                placeholder="12"
                suffix="m"
              />
              <TextField
                label="Ancho del tejado"
                value={formData.roof.widthM}
                onChange={v => updateRoof('widthM', v)}
                placeholder="8"
                suffix="m"
              />
            </div>
            <SelectField
              label="Tipo de tejado"
              value={formData.roof.roofType}
              onChange={v => updateRoof('roofType', v)}
              options={[
                { value: 'flat', label: 'Plano' },
                { value: 'tiled', label: 'Teja' },
                { value: 'metal', label: 'Metálico' },
                { value: 'other', label: 'Otro' },
              ]}
            />
            <SelectField
              label="Orientación principal"
              value={formData.roof.orientation}
              onChange={v => updateRoof('orientation', v)}
              options={[
                { value: 'south', label: 'Sur (óptimo)' },
                { value: 'east', label: 'Este' },
                { value: 'west', label: 'Oeste' },
                { value: 'north', label: 'Norte' },
                { value: 'mixed', label: 'Mixta / No sé' },
              ]}
            />
          </SectionCard>
        )}

        {/* Aerothermal: Installation Space + Radiators */}
        {productType === 'aerothermal' && (
          <>
            <SectionCard
              icon={<Home className="w-4 h-4 text-eltex-blue" />}
              title="Espacio de instalación"
              subtitle="Dónde se instalará la bomba de calor (opcional)."
            >
              <MultiPhotoUploader
                photos={formData.installationSpace.photos}
                minRequired={2}
                label="Fotos del espacio"
                hint="Foto de la sala/exterior donde se instalará la unidad. Muestra el espacio completo con dimensiones visibles."
                onChange={(photos) => updateInstallationSpace('photos', photos)}
              />
              <p className="text-xs font-semibold text-gray-600 pt-1">Dimensiones del espacio</p>
              <div className="grid grid-cols-3 gap-2">
                <TextField
                  label="Ancho"
                  value={formData.installationSpace.widthCm}
                  onChange={v => updateInstallationSpace('widthCm', v)}
                  placeholder="80"
                  suffix="cm"
                />
                <TextField
                  label="Fondo"
                  value={formData.installationSpace.depthCm}
                  onChange={v => updateInstallationSpace('depthCm', v)}
                  placeholder="60"
                  suffix="cm"
                />
                <TextField
                  label="Alto"
                  value={formData.installationSpace.heightCm}
                  onChange={v => updateInstallationSpace('heightCm', v)}
                  placeholder="200"
                  suffix="cm"
                />
              </div>
            </SectionCard>

            <SectionCard
              icon={<Thermometer className="w-4 h-4 text-eltex-blue" />}
              title="Radiadores"
              subtitle="Fotos y datos del sistema de calefacción actual (opcional)."
            >
              <MultiPhotoUploader
                photos={formData.radiators.photos}
                minRequired={1}
                label="Fotos de los radiadores"
                hint="Foto de un radiador representativo. Si hay varios tipos, incluye uno de cada."
                onChange={(photos) => updateRadiators('photos', photos)}
              />
              <div className="grid grid-cols-2 gap-3 pt-2">
                <SelectField
                  label="Tipo de radiador"
                  value={formData.radiators.radiatorType}
                  onChange={v => updateRadiators('radiatorType', v)}
                  options={[
                    { value: 'iron', label: 'Hierro fundido' },
                    { value: 'aluminium', label: 'Aluminio' },
                    { value: 'underfloor', label: 'Suelo radiante' },
                    { value: 'mixed', label: 'Mixto' },
                  ]}
                />
                <TextField
                  label="Nº radiadores"
                  value={formData.radiators.totalCount}
                  onChange={v => updateRadiators('totalCount', v)}
                  placeholder="8"
                />
              </div>
              <TextField
                label="Zonas de calefacción"
                value={formData.radiators.heatingZones}
                onChange={v => updateRadiators('heatingZones', v)}
                placeholder="1"
                suffix="zonas"
              />
            </SectionCard>
          </>
        )}

        {/* Navigation */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onBack} className="btn-secondary flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Atrás
          </button>
          <button type="button" onClick={onContinue} className="btn-primary flex items-center justify-center gap-2">
            Continuar <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
