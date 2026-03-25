import { useState, useCallback, useRef } from 'react';
import { Upload, X, AlertCircle, Check, Eye, Camera, RotateCcw } from 'lucide-react';
import type { UploadedPhoto } from '@/types';
import { validatePhoto, createUploadedPhoto, fileToPreview } from '@/lib/photoValidation';

interface PhotoUploadProps {
  label: string;
  photos: UploadedPhoto[];
  onPhotosChange: (photos: UploadedPhoto[]) => void;
  minRequired?: number;
  maxPhotos?: number;
  error?: string;
  exampleImage?: string;
  exampleCaption?: string;
  helperText?: string;
  processing?: boolean;
}

export function PhotoUpload({
  label,
  photos,
  onPhotosChange,
  minRequired = 1,
  maxPhotos = 5,
  error,
  exampleImage,
  exampleCaption,
  helperText,
  processing,
}: PhotoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setValidationError(null);

    const result = await validatePhoto(file);
    if (!result.valid) {
      setValidationError(result.error || 'Archivo no válido');
      return;
    }

    const preview = await fileToPreview(file);
    const photo = createUploadedPhoto(file, preview, result.width, result.height);
    onPhotosChange([...photos, photo]);
  }, [photos, onPhotosChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const removePhoto = useCallback((id: string) => {
    onPhotosChange(photos.filter(p => p.id !== id));
  }, [photos, onPhotosChange]);

  const isComplete = photos.length >= minRequired;
  const canAddMore = photos.length < maxPhotos;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-900">
          {label}
          <span className="text-eltex-error ml-0.5">*</span>
          <span className="text-xs font-normal text-gray-500 ml-2">
            {photos.length}/{minRequired} mín.
          </span>
        </label>
        {exampleImage && (
          <button
            type="button"
            onClick={() => setShowExample(!showExample)}
            className="text-xs text-eltex-blue hover:text-eltex-blue-dark font-medium flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            {showExample ? 'Ocultar ejemplo' : 'Ver ejemplo'}
          </button>
        )}
      </div>

      {helperText && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}

      {/* Example image */}
      {showExample && exampleImage && (
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <div className="w-full h-40 bg-blue-100/50 rounded-lg flex items-center justify-center mb-2">
            <div className="text-center text-blue-400 text-sm">
              <Camera className="w-8 h-8 mx-auto mb-1" />
              {exampleCaption || 'Ejemplo de foto correcta'}
            </div>
          </div>
          <p className="text-xs text-blue-600">{exampleCaption}</p>
        </div>
      )}

      {/* Uploaded photos grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map(photo => (
            <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-gray-200">
              <img
                src={photo.preview}
                alt="Uploaded"
                className="w-full h-24 object-cover cursor-pointer"
                onClick={() => setPreviewPhoto(photo.preview)}
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-1">
                <Check className="w-3.5 h-3.5 text-green-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {canAddMore && (
        <div
          className={`upload-zone p-6 text-center ${isDragging ? 'dragging' : ''} ${isComplete ? 'has-file' : ''} ${processing ? 'opacity-60 pointer-events-none' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={handleFileInput}
          />

          {processing ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-eltex-blue border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Analizando documento...</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">
                Arrastra una foto aquí o <span className="text-eltex-blue font-medium">pulsa para seleccionar</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG o PDF · Mín. 1MB · Mín. 1200x900px</p>
            </>
          )}
        </div>
      )}

      {/* Validation error */}
      {(validationError || error) && (
        <div className="flex items-start gap-2 text-sm text-eltex-error bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p>{validationError || error}</p>
            {validationError && (
              <button
                type="button"
                onClick={() => { setValidationError(null); fileInputRef.current?.click(); }}
                className="text-xs text-eltex-blue mt-1 flex items-center gap-1 hover:underline"
              >
                <RotateCcw className="w-3 h-3" /> Intentar de nuevo
              </button>
            )}
          </div>
        </div>
      )}

      {/* Full preview modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <img src={previewPhoto} alt="Preview" className="max-w-full max-h-full rounded-lg" />
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white"
            onClick={() => setPreviewPhoto(null)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
