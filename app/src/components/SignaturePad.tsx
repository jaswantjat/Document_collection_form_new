import { useRef, useState, useEffect, useCallback } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Eraser, Check, Pen } from 'lucide-react';

interface SignaturePadProps {
  onSignature: (signature: string | null) => void;
  existingSignature?: string | null;
  error?: string;
}

export const SignaturePad = ({ onSignature, existingSignature, error }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const onSignatureRef = useRef(onSignature);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasLocalSignature, setHasLocalSignature] = useState(false);
  const hasSignature = hasLocalSignature || !!existingSignature;

  useEffect(() => { onSignatureRef.current = onSignature; }, [onSignature]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set up canvas for high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Load existing signature if provided
    if (existingSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = existingSignature;
    }
  }, [existingSignature]);

  // Animation on mount — useGSAP automatically kills the tween on unmount
  useGSAP(() => {
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out' }
    );
  }, { scope: containerRef });

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    if (!isDrawing) return;
    setIsDrawing(false);
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if canvas has content
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get canvas data to check if there's content
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hasContent = false;
    
    // Check alpha channel for non-transparent pixels
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) {
        hasContent = true;
        break;
      }
    }

    setHasLocalSignature(hasContent);
    
    if (hasContent) {
      // Export at display size for storage
      const exportCanvas = document.createElement('canvas');
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) return;
      
      const rect = canvas.getBoundingClientRect();
      exportCanvas.width = rect.width;
      exportCanvas.height = rect.height;
      exportCtx.drawImage(canvas, 0, 0, rect.width, rect.height);
      
      onSignature(exportCanvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasLocalSignature(false);
    onSignature(null);

    // Animate clear — kill any previous tween on this element first
    gsap.killTweensOf(canvas);
    gsap.fromTo(
      canvas,
      { opacity: 0.5 },
      { opacity: 1, duration: 0.2 }
    );
  };

  // Programmatic test-signature helper — available only in development so
  // automated browser tests can inject a valid signature without needing
  // canvas mouse-draw events (which most test runners can't produce).
  // Usage: window.__eltexFillTestSignature()
  const fillTestSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    // Draw a simple cursive "TEST" shape as the signature
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 60, cy + 10);
    ctx.bezierCurveTo(cx - 40, cy - 30, cx - 20, cy + 30, cx, cy - 10);
    ctx.bezierCurveTo(cx + 20, cy - 30, cx + 40, cy + 20, cx + 60, cy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 60, cy + 18);
    ctx.lineTo(cx + 60, cy + 18);
    ctx.stroke();

    setHasLocalSignature(true);

    const exportCanvas = document.createElement('canvas');
    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) return;
    exportCanvas.width = rect.width;
    exportCanvas.height = rect.height;
    exportCtx.drawImage(canvas, 0, 0, rect.width, rect.height);
    onSignatureRef.current(exportCanvas.toDataURL('image/png'));
  }, []);

  // Expose the helper on window only in non-production builds
  useEffect(() => {
    if (import.meta.env.PROD) return;
    const win = window as unknown as Record<string, unknown>;
    win.__eltexFillTestSignature = fillTestSignature;
    return () => { delete win.__eltexFillTestSignature; };
  }, [fillTestSignature]);

  return (
    <div ref={containerRef} className="w-full">
      {/* Signature Area */}
      <div 
        className={`relative bg-white rounded-xl overflow-hidden transition-all ${
          error ? 'ring-2 ring-eltex-error' : 'ring-1 ring-gray-200'
        }`}
      >
        {/* Clear button */}
        <button
          onClick={clearSignature}
          className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm text-sm text-gray-600 hover:text-eltex-error hover:bg-red-50 transition-colors border border-gray-100"
        >
          <Eraser className="w-4 h-4" />
          <span>Limpiar</span>
        </button>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          data-testid="signature-canvas"
          data-has-signature={hasSignature ? 'true' : 'false'}
          className="w-full h-48 cursor-crosshair touch-none block"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />

        {/* Placeholder text */}
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 text-gray-300">
              <Pen className="w-5 h-5" />
              <span className="text-sm">Firma aquí</span>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-2 text-sm text-eltex-error flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-eltex-error rounded-full" />
          {error}
        </p>
      )}

      {/* Success indicator */}
      {hasSignature && !error && (
        <p className="mt-2 text-sm text-eltex-success flex items-center gap-1">
          <Check className="w-4 h-4" />
          Firma guardada
        </p>
      )}
    </div>
  );
};
