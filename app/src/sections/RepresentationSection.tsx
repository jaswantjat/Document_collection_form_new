import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ArrowRight, ArrowLeft, MapPin, Building2, User, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { SignaturePad } from '@/components/SignaturePad';
import type { FormData, RenderedDocumentAsset, RepresentationData, LocationRegion } from '@/types';
import {
  createRenderedDocumentAsset,
  renderedDocumentKeyForKind,
  renderSignedDocumentOverlay,
  type SignedDocumentKind,
} from '@/lib/signedDocumentOverlays';

interface Props {
  formData: any;
  location: LocationRegion | null;
  onChange: (data: RepresentationData) => void;
  onBack: () => void;
  onContinue: () => void;
}

const LOCATIONS: { id: LocationRegion; label: string }[] = [
  { id: 'cataluna', label: 'Cataluña' },
  { id: 'madrid', label: 'Madrid' },
  { id: 'valencia', label: 'Valencia' },
];

type Step = 0 | 1;

interface DocDef {
  kind: SignedDocumentKind;
  title: string;
}

function getDocsForLocation(location: LocationRegion | null): DocDef[] {
  if (location === 'cataluna') {
    return [
      { kind: 'cataluna-iva', title: 'Certificado 10% IVA' },
      { kind: 'cataluna-generalitat', title: 'Declaració Generalitat' },
      { kind: 'cataluna-representacio', title: 'Autorització de Representació' },
    ];
  }
  if (location === 'madrid' || location === 'valencia') {
    return [
      { kind: 'spain-iva', title: 'Certificado 10% IVA' },
      { kind: 'spain-poder', title: 'Poder de Representación' },
    ];
  }
  return [];
}

function SignedDocumentPreview({
  formData,
  kind,
  alt,
}: {
  formData: FormData;
  kind: SignedDocumentKind;
  alt: string;
}) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    renderSignedDocumentOverlay({ formData }, kind)
      .then((image) => {
        if (!cancelled) {
          setImageDataUrl(image);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(`Failed to render ${kind} preview:`, err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [formData, kind]);

  if (loading) {
    return (
      <div className="aspect-[0.707] bg-gray-50 flex items-center justify-center text-sm text-gray-400 gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Preparando vista previa...
      </div>
    );
  }

  if (!imageDataUrl) {
    return (
      <div className="aspect-[0.707] bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        No disponible
      </div>
    );
  }

  return <img src={imageDataUrl} alt={alt} className="w-full block" />;
}

export function RepresentationSection({ formData, location, onChange, onBack, onContinue }: Props) {
  const [step, setStep] = useState<Step>(0);
  const data = formData.representation;
  const update = (patch: Partial<RepresentationData>) => onChange({ ...data, ...patch });

  const docs = getDocsForLocation(location);
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [sharedSignature, setSharedSignature] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const previewFormData = useMemo<FormData>(() => {
    if (!sharedSignature) return formData;
    const isCataluna = location === 'cataluna';
    const signaturePatch: Partial<RepresentationData> = isCataluna
      ? {
          ivaCertificateSignature: sharedSignature,
          generalitatSignature: sharedSignature,
          representacioSignature: sharedSignature,
        }
      : {
          ivaCertificateEsSignature: sharedSignature,
          poderRepresentacioSignature: sharedSignature,
        };
    return {
      ...formData,
      representation: { ...formData.representation, ...signaturePatch },
    };
  }, [formData, sharedSignature, location]);

  const step0Valid = !!location &&
    (!data.isCompany || (data.companyName.trim() !== '' && data.companyNIF.trim() !== ''));

  const go = (s: Step) => {
    setStep(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCarouselScroll = useCallback(() => {
    if (!carouselRef.current) return;
    const { scrollLeft, clientWidth } = carouselRef.current;
    if (clientWidth > 0) {
      setActiveDocIndex(Math.round(scrollLeft / clientWidth));
    }
  }, []);

  const goToDoc = (i: number) => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollTo({ left: i * carouselRef.current.clientWidth, behavior: 'smooth' });
    setActiveDocIndex(i);
  };

  const handleContinue = async () => {
    if (!sharedSignature || applying) return;
    setApplying(true);

    try {
      const isCataluna = location === 'cataluna';

      const signaturePatch: Partial<RepresentationData> = isCataluna
        ? {
            ivaCertificateSignature: sharedSignature,
            generalitatSignature: sharedSignature,
            representacioSignature: sharedSignature,
          }
        : {
            ivaCertificateEsSignature: sharedSignature,
            poderRepresentacioSignature: sharedSignature,
          };

      const nextRepresentation: RepresentationData = { ...data, ...signaturePatch };

      const renderedDocuments: RepresentationData['renderedDocuments'] = {
        ...(nextRepresentation.renderedDocuments || {}),
      };

      for (const doc of docs) {
        const asset: RenderedDocumentAsset = await createRenderedDocumentAsset(
          { formData: { ...formData, representation: nextRepresentation } },
          doc.kind
        );
        renderedDocuments[renderedDocumentKeyForKind(doc.kind)] = asset;
      }

      onChange({ ...nextRepresentation, renderedDocuments });
      onContinue();
    } catch (err) {
      console.error('Failed to apply signatures:', err);
    } finally {
      setApplying(false);
    }
  };

  if (step === 0) {
    return (
      <div className="min-h-screen bg-white p-5 pb-28">
        <div className="max-w-sm mx-auto space-y-6">
          <div className="pt-2 pb-2">
            <h1 className="text-2xl font-bold text-gray-900">Localización</h1>
            <p className="text-gray-400 text-sm mt-1">Selecciona tu ubicación e indica si el titular es una empresa.</p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-eltex-blue" />
              Ubicación confirmada <span className="text-eltex-error ml-0.5">*</span>
            </label>
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 flex items-center gap-3">
              <MapPin className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-green-800">
                {location ? LOCATIONS.find(l => l.id === location)?.label || 'Otra provincia' : 'No seleccionada'}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              La ubicación se confirmó en el paso anterior. Si necesitas cambiarla, vuelve al paso "Ubicación".
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-eltex-blue" /> ¿Es empresa? <span className="text-eltex-error ml-0.5">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: true, label: 'Sí', icon: <Building2 className="w-4 h-4" /> },
                { val: false, label: 'No', icon: <User className="w-4 h-4" /> },
              ].map(opt => (
                <button key={String(opt.val)} type="button"
                  onClick={() => update({ isCompany: opt.val, ...(!opt.val ? { companyName: '', companyNIF: '', companyAddress: '', companyMunicipality: '', companyPostalCode: '' } : {}) })}
                  className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all flex items-center justify-center gap-2 ${
                    data.isCompany === opt.val ? 'border-eltex-blue bg-eltex-blue text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}>{opt.icon}{opt.label}</button>
              ))}
            </div>
          </div>

          {data.isCompany && (
            <div className="space-y-4 bg-gray-50 rounded-2xl p-4 border border-gray-100">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Building2 className="w-4 h-4" /> Datos de la empresa</p>
              <Field label="Nombre de la empresa" required value={data.companyName} onChange={v => update({ companyName: v })} placeholder="Empresa S.L." />
              <Field label="NIF de la empresa" required value={data.companyNIF} onChange={v => update({ companyNIF: v })} placeholder="B12345678" />
              <Field label="Dirección de la empresa" value={data.companyAddress} onChange={v => update({ companyAddress: v })} placeholder="Calle, número, piso" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Municipalidad" value={data.companyMunicipality} onChange={v => update({ companyMunicipality: v })} placeholder="Madrid" />
                <Field label="Código postal" value={data.companyPostalCode} onChange={v => update({ companyPostalCode: v })} placeholder="28001" maxLength={5} />
              </div>
            </div>
          )}

          <Nav onBack={onBack} onContinue={() => { if (step0Valid) go(1); }} disabled={!step0Valid} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-5 pb-10">
      <div className="max-w-sm mx-auto space-y-5">
        <div className="pt-2 pb-1">
          <h1 className="text-2xl font-bold text-gray-900">Documentos para firmar</h1>
          <p className="text-gray-400 text-sm mt-1">
            Revisa todos los documentos y firma una sola vez para aprobarlos todos.
          </p>
        </div>

        {/* Document counter */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">
            {activeDocIndex + 1} de {docs.length} — {docs[activeDocIndex]?.title}
          </span>
          <div className="flex gap-1.5">
            {docs.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToDoc(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === activeDocIndex ? 'bg-eltex-blue w-4' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Carousel */}
        <div className="relative">
          <div
            ref={carouselRef}
            onScroll={handleCarouselScroll}
            className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl border border-gray-200 shadow-sm"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {docs.map((doc) => (
              <div
                key={doc.kind}
                className="min-w-full snap-center overflow-hidden [container-type:inline-size]"
              >
                <SignedDocumentPreview formData={previewFormData} kind={doc.kind} alt={doc.title} />
              </div>
            ))}
          </div>

          {/* Carousel nav arrows */}
          {docs.length > 1 && (
            <>
              {activeDocIndex > 0 && (
                <button
                  type="button"
                  onClick={() => goToDoc(activeDocIndex - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {activeDocIndex < docs.length - 1 && (
                <button
                  type="button"
                  onClick={() => goToDoc(activeDocIndex + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center text-gray-600 hover:bg-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Swipe hint if multiple docs */}
        {docs.length > 1 && (
          <p className="text-xs text-center text-gray-400">
            Desliza para ver todos los documentos antes de firmar
          </p>
        )}

        {/* Single signature pad */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-gray-800">
            Firma para aprobar todos los documentos <span className="text-eltex-error">*</span>
          </p>
          <SignaturePad
            onSignature={setSharedSignature}
            existingSignature={sharedSignature}
          />
        </div>

        {/* Nav */}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => go(0)} className="btn-secondary flex items-center gap-1.5 px-5">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!sharedSignature || applying}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Aplicando firma...
              </>
            ) : (
              <>
                Continuar <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Nav({ onBack, onContinue, disabled }: { onBack: () => void; onContinue: () => void; disabled: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onBack} className="btn-secondary flex items-center gap-1.5 px-5">
        <ArrowLeft className="w-4 h-4" />
      </button>
      <button type="button" onClick={onContinue} disabled={disabled}
        className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
        Continuar <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; required?: boolean; maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-gray-600 font-medium">{label} {required && <span className="text-eltex-error">*</span>}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="form-input" maxLength={maxLength} />
    </div>
  );
}
