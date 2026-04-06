import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { ArrowRight, ArrowLeft, ChevronLeft, ChevronRight, Loader2, ZoomIn, X, Clock } from 'lucide-react';
import { SignaturePad } from '@/components/SignaturePad';
import type { FormData, RenderedDocumentAsset, RepresentationData, LocationRegion } from '@/types';
import {
  createRenderedDocumentAsset,
  renderedDocumentKeyForKind,
  renderSignedDocumentPreview,
  renderSignedDocumentModalPreview,
  preloadDocumentTemplates,
  type SignedDocumentKind,
} from '@/lib/signedDocumentOverlays';

interface Props {
  formData: FormData;
  location: LocationRegion | null;
  onChange: (data: RepresentationData) => void;
  onBack: () => void;
  onContinue: () => void;
}

interface DocDef {
  kind: SignedDocumentKind;
  title: string;
}

interface ResolvedDocImagesState {
  formData: FormData;
  images: Partial<Record<SignedDocumentKind, string | null>>;
}

interface ResolvedPreviewState {
  formData: FormData;
  kind: SignedDocumentKind;
  imageDataUrl: string | null;
}

const EMPTY_RESOLVED_IMAGES: Partial<Record<SignedDocumentKind, string | null>> = {};

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

function DocumentFullscreenModal({
  formData,
  docs,
  initialIndex,
  onClose,
}: {
  formData: FormData;
  docs: DocDef[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [resolvedImages, setResolvedImages] = useState<ResolvedDocImagesState>({
    formData,
    images: {},
  });
  const pendingKindsRef = useRef<{ formData: FormData; kinds: Set<SignedDocumentKind> } | null>(null);

  const currentDoc = docs[currentIndex];
  const currentImages = useMemo(
    () => (resolvedImages.formData === formData ? resolvedImages.images : EMPTY_RESOLVED_IMAGES),
    [formData, resolvedImages]
  );

  const loadDoc = useCallback((index: number) => {
    const doc = docs[index];
    if (!doc) return;

    const pendingKinds = pendingKindsRef.current?.formData === formData
      ? pendingKindsRef.current.kinds
      : (() => {
          const nextPending = { formData, kinds: new Set<SignedDocumentKind>() };
          pendingKindsRef.current = nextPending;
          return nextPending.kinds;
        })();

    if (currentImages[doc.kind] !== undefined || pendingKinds.has(doc.kind)) return;

    pendingKinds.add(doc.kind);
    renderSignedDocumentModalPreview({ formData }, doc.kind)
      .then((image) => {
        setResolvedImages((prev) => {
          const nextImages = prev.formData === formData ? { ...prev.images } : {};
          nextImages[doc.kind] = image;
          return { formData, images: nextImages };
        });
      })
      .catch((err) => {
        console.error(`Failed to render ${doc.kind} modal preview:`, err);
        setResolvedImages((prev) => {
          const nextImages = prev.formData === formData ? { ...prev.images } : {};
          nextImages[doc.kind] = null;
          return { formData, images: nextImages };
        });
      })
      .finally(() => {
        if (pendingKindsRef.current?.formData === formData) {
          pendingKindsRef.current.kinds.delete(doc.kind);
        }
      });
  }, [currentImages, docs, formData]);

  useEffect(() => {
    loadDoc(currentIndex);
    if (currentIndex + 1 < docs.length) loadDoc(currentIndex + 1);
    if (currentIndex - 1 >= 0) loadDoc(currentIndex - 1);
  }, [currentIndex, loadDoc, docs.length]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const goTo = (index: number) => {
    if (index < 0 || index >= docs.length) return;
    setCurrentIndex(index);
  };

  const imageDataUrl = currentDoc ? (currentImages[currentDoc.kind] ?? null) : null;
  const loading = currentDoc ? currentImages[currentDoc.kind] === undefined : false;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < docs.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10">
        {docs.length > 1 ? (
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => goTo(currentIndex - 1)}
              disabled={!hasPrev}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              aria-label="Documento anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <span className="text-white text-sm font-semibold truncate block">{currentDoc?.title}</span>
              <span className="text-white/40 text-xs">{currentIndex + 1} / {docs.length}</span>
            </div>
            <button
              type="button"
              onClick={() => goTo(currentIndex + 1)}
              disabled={!hasNext}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              aria-label="Documento siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <span className="text-white text-sm font-semibold truncate pr-4">{currentDoc?.title}</span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 ml-2 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto overscroll-contain">
        {loading ? (
          <div className="h-full flex items-center justify-center gap-2 text-white/60 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando documento...
          </div>
        ) : imageDataUrl ? (
          <img
            src={imageDataUrl}
            alt={currentDoc?.title}
            className="block mx-auto"
            style={{ width: 'max(100%, 700px)' }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-white/40 text-sm">
            No disponible
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-white/10 flex items-center justify-between gap-4">
        {docs.length > 1 && (
          <button
            type="button"
            onClick={() => goTo(currentIndex - 1)}
            disabled={!hasPrev}
            className="shrink-0 flex items-center gap-1 text-white/50 text-xs hover:text-white/80 disabled:opacity-0 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {docs[currentIndex - 1]?.title}
          </button>
        )}
        <p className="flex-1 text-white/40 text-xs text-center">Desplázate para leer el documento completo</p>
        {docs.length > 1 && (
          <button
            type="button"
            onClick={() => goTo(currentIndex + 1)}
            disabled={!hasNext}
            className="shrink-0 flex items-center gap-1 text-white/50 text-xs hover:text-white/80 disabled:opacity-0 disabled:pointer-events-none transition-colors"
          >
            {docs[currentIndex + 1]?.title}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function SignedDocumentPreview({
  formData,
  kind,
  alt,
  onExpand,
}: {
  formData: FormData;
  kind: SignedDocumentKind;
  alt: string;
  onExpand: () => void;
}) {
  const [resolvedPreview, setResolvedPreview] = useState<ResolvedPreviewState | null>(null);
  const previewMatchesCurrentInput = resolvedPreview?.formData === formData && resolvedPreview.kind === kind;
  const imageDataUrl = previewMatchesCurrentInput ? resolvedPreview.imageDataUrl : null;
  const loading = !previewMatchesCurrentInput;

  useEffect(() => {
    let cancelled = false;

    renderSignedDocumentPreview({ formData }, kind)
      .then((image) => {
        if (!cancelled) {
          setResolvedPreview({
            formData,
            kind,
            imageDataUrl: image,
          });
        }
      })
      .catch((err) => {
        console.error(`Failed to render ${kind} preview:`, err);
        if (!cancelled) {
          setResolvedPreview({
            formData,
            kind,
            imageDataUrl: null,
          });
        }
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

  return (
    <button
      type="button"
      onClick={onExpand}
      className="relative w-full block group focus:outline-none"
      aria-label={`Ampliar ${alt}`}
      style={{ touchAction: 'pan-x' }}
    >
      <img
        src={imageDataUrl}
        alt={alt}
        className="w-full block"
        draggable={false}
        style={{
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: 'none',
        } as React.CSSProperties}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 group-active:bg-black/15 transition-colors rounded-2xl pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/50 text-white text-xs font-medium px-3 py-1.5 rounded-full opacity-70 group-hover:opacity-100 transition-opacity">
          <ZoomIn className="w-3.5 h-3.5" />
          Toca para leer
        </div>
      </div>
    </button>
  );
}

export function RepresentationSection({ formData, location, onChange, onBack, onContinue }: Props) {
  const data = formData.representation;
  const docs = getDocsForLocation(location);

  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [sharedSignature, setSharedSignature] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [fullscreenDocIndex, setFullscreenDocIndex] = useState<number | null>(null);
  const [allDocsToured, setAllDocsToured] = useState(false);
  const applyingRef = useRef(false);
  const hasCycled = useRef(false);
  const hasMountCycled = useRef(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const carouselWrapperRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Debounce signature updates so the preview re-renders at most once per 400ms
  // instead of on every signature stroke, keeping the UI responsive while signing.
  const debouncedSignature = useDebounce(sharedSignature, 400);

  // Preload document templates as soon as the section mounts.
  // This warms the image cache so the first render is instant rather than
  // waiting for the large PNG/JPG to decode after the user starts signing.
  useEffect(() => {
    preloadDocumentTemplates(docs.map((d) => d.kind));
  }, [docs]);

  // On mount: scroll the outer scrollable area so the carousel sits at the top
  // of the viewport — the section title slides out of view and the signature
  // pad (fixed bottom panel) is immediately visible below the document.
  useEffect(() => {
    const id = setTimeout(() => {
      const area = scrollAreaRef.current;
      const carousel = carouselWrapperRef.current;
      if (!area || !carousel) return;
      const relativeTop =
        carousel.getBoundingClientRect().top -
        area.getBoundingClientRect().top +
        area.scrollTop;
      area.scrollTo({ top: relativeTop, behavior: 'smooth' });
    }, 150);
    return () => clearTimeout(id);
  }, []);

  // On mount: tour all documents so the customer can see what they are about
  // to sign (tax certificate → generalitat → representation). Fires once.
  useEffect(() => {
    if (hasMountCycled.current || docs.length <= 1) return;
    hasMountCycled.current = true;

    const timers: ReturnType<typeof setTimeout>[] = [];
    docs.forEach((_, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => goToDoc(i), i * 2000));
    });

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user draws their first signature, auto-cycle through every
  // document in the carousel so they can see their signature applied to each
  // one. Fires only once per mount (hasCycled guard).
  useEffect(() => {
    if (!sharedSignature || hasCycled.current || docs.length <= 1) return;
    hasCycled.current = true;

    const timers: ReturnType<typeof setTimeout>[] = [];
    docs.forEach((_, i) => {
      if (i === 0) return;
      timers.push(
        setTimeout(() => {
          goToDoc(i);
          if (i === docs.length - 1) {
            timers.push(setTimeout(() => setAllDocsToured(true), 900));
          }
        }, i * 1300)
      );
    });

    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSignature]);

  const previewFormData = useMemo<FormData>(() => {
    if (!debouncedSignature) return formData;
    const isCataluna = location === 'cataluna';
    const signaturePatch: Partial<RepresentationData> = isCataluna
      ? {
          ivaCertificateSignature: debouncedSignature,
          generalitatSignature: debouncedSignature,
          representacioSignature: debouncedSignature,
        }
      : {
          ivaCertificateEsSignature: debouncedSignature,
          poderRepresentacioSignature: debouncedSignature,
        };
    return {
      ...formData,
      representation: { ...formData.representation, ...signaturePatch },
    };
  }, [formData, debouncedSignature, location]);

  const handleCarouselScroll = useCallback(() => {
    if (!carouselRef.current) return;
    const { scrollLeft, clientWidth } = carouselRef.current;
    if (clientWidth > 0) {
      setActiveDocIndex(Math.round(scrollLeft / clientWidth));
    }
  }, []);

  // For iOS compatibility, we explicitly track scroll end to ensure the
  // active index updates even if the native onScroll event is throttled.
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    
    const handleScrollEnd = () => handleCarouselScroll();
    el.addEventListener('scrollend', handleScrollEnd);
    return () => el.removeEventListener('scrollend', handleScrollEnd);
  }, [handleCarouselScroll]);

  const goToDoc = (i: number) => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollTo({ left: i * carouselRef.current.clientWidth, behavior: 'smooth' });
    setActiveDocIndex(i);
  };

  const handleContinue = async () => {
    if (!sharedSignature || applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    setApplyError(null);

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

      onChange({ ...nextRepresentation, renderedDocuments, signatureDeferred: undefined });
      onContinue();
    } catch (err) {
      console.error('Failed to apply signatures:', err);
      setApplyError('Error al aplicar la firma. Inténtalo de nuevo.');
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  const handleDeferSignature = () => {
    // Customer will sign remotely — mark as deferred so routing skips this section
    // on reload, but the review screen will still show a missing-signature warning.
    onChange({ ...data, signatureDeferred: true });
    onContinue();
  };

  if (docs.length === 0) {
    return (
      <div className="min-h-screen bg-white p-5 pb-10">
        <div className="max-w-sm mx-auto space-y-5 pt-8">
          <h1 className="text-2xl font-bold text-gray-900">Documentos para firmar</h1>
          <p className="text-gray-500 text-sm">
            No se requieren documentos de representación para su provincia.
          </p>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onBack} className="btn-secondary flex items-center gap-1.5 px-5">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={onContinue} className="btn-primary flex-1 flex items-center justify-center gap-2">
              Continuar <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {fullscreenDocIndex !== null && (
        <DocumentFullscreenModal
          formData={previewFormData}
          docs={docs}
          initialIndex={fullscreenDocIndex}
          onClose={() => setFullscreenDocIndex(null)}
        />
      )}

      <div className="h-dvh bg-white flex flex-col overflow-hidden">

        {/* ── Scrollable top area: title + document carousel ── */}
        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 pt-5 pb-4 max-w-sm mx-auto space-y-4">
            <div className="pt-2 pb-1">
              <h1 className="text-2xl font-bold text-gray-900">Documentos para firmar</h1>
              <p className="text-gray-400 text-sm mt-1">
                Revisa todos los documentos y firma en la parte inferior.
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
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === activeDocIndex
                        ? 'bg-eltex-blue w-4'
                        : allDocsToured
                        ? 'bg-eltex-blue/40 w-2'
                        : 'bg-gray-200 w-2'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Carousel — swipe on mobile, arrow buttons for all devices */}
            <div ref={carouselWrapperRef} className="relative">
              <div
                ref={carouselRef}
                onScroll={handleCarouselScroll}
                onTouchStart={() => {
                  // On touch, we ensure scroll-snap-stop is set to always
                  // to prevent over-scrolling through multiple documents
                  if (carouselRef.current) {
                    carouselRef.current.style.scrollSnapStop = 'always';
                  }
                }}
                onTouchEnd={() => {
                  // After touch, we let handleCarouselScroll or scrollend update the index
                  // but we also check for a small nudge after 300ms if no scroll event fired.
                  setTimeout(handleCarouselScroll, 300);
                }}
                className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl border border-gray-200 shadow-sm"
                style={{
                  scrollbarWidth: 'none',
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-x',
                  msOverflowStyle: 'none',
                } as React.CSSProperties}
              >
                {docs.map((doc) => (
                  <div
                    key={doc.kind}
                    className="min-w-full snap-center overflow-hidden [container-type:inline-size]"
                    style={{ touchAction: 'pan-x' }}
                  >
                    <SignedDocumentPreview
                      formData={previewFormData}
                      kind={doc.kind}
                      alt={doc.title}
                      onExpand={() => setFullscreenDocIndex(docs.indexOf(doc))}
                    />
                  </div>
                ))}
              </div>

              {/* Arrow buttons — overlaid on the carousel, visible when multiple docs */}
              {docs.length > 1 && activeDocIndex > 0 && (
                <button
                  type="button"
                  onClick={() => goToDoc(activeDocIndex - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center text-gray-700 hover:bg-white active:scale-95 transition-all z-10"
                  aria-label="Documento anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {docs.length > 1 && activeDocIndex < docs.length - 1 && (
                <button
                  type="button"
                  onClick={() => goToDoc(activeDocIndex + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center text-gray-700 hover:bg-white active:scale-95 transition-all z-10"
                  aria-label="Documento siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {docs.length > 1 && (
              <p className="text-xs text-center text-gray-400">
                Desliza o usa las flechas para ver todos los documentos
              </p>
            )}
        </div>
      </div>

      {/* ── Always-visible bottom panel: signature + buttons ── */}
      <div className="shrink-0 bg-white border-t border-gray-100">
        <div className="px-5 pt-4 pb-3 max-w-sm mx-auto space-y-3">
          <p className="text-sm font-bold text-gray-800">
            Firma para aprobar todos los documentos <span className="text-eltex-error">*</span>
          </p>
          <SignaturePad
            onSignature={(sig) => { setSharedSignature(sig); setApplyError(null); }}
            existingSignature={sharedSignature}
          />
          {applyError && (
            <p className="text-sm text-red-600 text-center">{applyError}</p>
          )}
        </div>

        <div className="px-4 pb-4 safe-area-bottom max-w-sm mx-auto space-y-2">
          <div className="flex gap-3">
            <button type="button" onClick={onBack} className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-xl transition-all hover:bg-gray-50 active:scale-[0.97]">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!sharedSignature || applying}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-2 py-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
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
          <button
            type="button"
            onClick={handleDeferSignature}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 py-1.5 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Firmar más tarde
          </button>
        </div>
      </div>

    </div>
    </>
  );
}
