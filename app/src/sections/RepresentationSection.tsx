import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ArrowRight, ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
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

    return () => { cancelled = true; };
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
  const data = formData.representation;

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

        {docs.length > 1 && (
          <p className="text-xs text-center text-gray-400">
            Desliza para ver todos los documentos antes de firmar
          </p>
        )}

        {/* Signature pad */}
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
          <button type="button" onClick={onBack} className="btn-secondary flex items-center gap-1.5 px-5">
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
