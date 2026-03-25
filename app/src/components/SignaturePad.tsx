import { useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import { Eraser, Check, Pen } from 'lucide-react';

interface SignaturePadProps {
  onSignature: (signature: string | null) => void;
  existingSignature?: string | null;
  error?: string;
}

export const SignaturePad = ({ onSignature, existingSignature, error }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!existingSignature);

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
    
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Load existing signature if provided
    if (existingSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = existingSignature;
    }
  }, [existingSignature]);

  // Animation on mount
  useEffect(() => {
    gsap.fromTo(
      containerRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out' }
    );
  }, []);

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

  const stopDrawing = () => {
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

    setHasSignature(hasContent);
    
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
    setHasSignature(false);
    onSignature(null);

    // Animate clear
    gsap.fromTo(
      canvas,
      { opacity: 0.5 },
      { opacity: 1, duration: 0.2 }
    );
  };

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
