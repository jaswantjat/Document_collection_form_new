import { useRef, useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, RotateCcw, CheckCircle } from 'lucide-react';
import type { FormData, ProjectData, FormErrors } from '@/types';

interface Props {
  project: ProjectData;
  formData: FormData;
  errors: FormErrors;
  source: 'assessor' | 'customer';
  onCustomerSignature: (sig: string | null) => void;
  onRepSignature: (sig: string | null) => void;
  onBack: () => void;
  onContinue: () => void;
}

// ─── Signature Pad ────────────────────────────────────────────────────────────

interface SignaturePadProps {
  label: string;
  subtitle: string;
  value: string | null;
  error?: string;
  onChange: (sig: string | null) => void;
}

function SignaturePad({ label, subtitle, value, error, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasLocalSignature, setHasLocalSignature] = useState(false);
  const hasSignature = hasLocalSignature || !!value;
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If we have a value, restore it
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = value;
    }
  }, [value]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e, canvas);
    ctx.beginPath();
    if (lastPos.current) {
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
    }
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasLocalSignature(true);
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPos.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onChange(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasLocalSignature(false);
    onChange(null);
  };

  return (
    <div className={`rounded-2xl border-2 transition-colors ${hasSignature ? 'border-green-200 bg-green-50/30' : 'border-gray-100 bg-white'} p-5 space-y-3`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        {hasSignature && <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />}
      </div>

      <div className="relative rounded-xl overflow-hidden border-2 border-dashed border-gray-200 bg-gray-50 touch-none">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full h-36 cursor-crosshair"
          style={{ touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm">Firma aquí →</p>
          </div>
        )}
      </div>

      {hasSignature && (
        <button type="button" onClick={clear}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> Borrar y repetir
        </button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SignaturesSection({
  project,
  formData,
  errors,
  onCustomerSignature,
  onRepSignature,
  onBack,
  onContinue,
}: Props) {
  const today = new Date().toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-white p-5 pb-28">
      <div className="max-w-sm mx-auto space-y-5">

        <div className="pt-2 pb-2">
          <h1 className="text-2xl font-bold text-gray-900">Firmas</h1>
          <p className="text-gray-400 text-sm mt-1">Dibuja la firma con el dedo o el ratón.</p>
        </div>

        <SignaturePad
          label="Firma del cliente"
          subtitle={formData.dni?.front?.extraction?.extractedData?.fullName || project.customerName}
          value={formData.signatures.customerSignature}
          error={errors['signatures.customer']}
          onChange={onCustomerSignature}
        />

        <SignaturePad
          label="Firma del asesor"
          subtitle={project.assessor}
          value={formData.signatures.repSignature}
          error={errors['signatures.rep']}
          onChange={onRepSignature}
        />

        <p className="text-xs text-gray-400">
          Ref. {project.code} · {today}
        </p>

        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="btn-secondary px-5">
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
