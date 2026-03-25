import { useEffect, useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import type { ProjectData } from '@/types';

interface Props {
  project: ProjectData;
}

export function SuccessSection({ project }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const els = containerRef.current.querySelectorAll('[data-animate]');
    els.forEach((el, i) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.opacity = '0';
      htmlEl.style.transform = 'translateY(20px)';
      setTimeout(() => {
        htmlEl.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        htmlEl.style.opacity = '1';
        htmlEl.style.transform = 'translateY(0)';
      }, i * 100);
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div ref={containerRef} className="w-full max-w-lg text-center">

        {/* Success icon */}
        <div data-animate className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
        </div>

        {/* Heading */}
        <div data-animate className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            ¡Documentación enviada!
          </h1>
          <p className="text-gray-600 text-lg">
            Hola {project.customerName.split(' ')[0]}, hemos recibido toda tu documentación correctamente.
          </p>
        </div>

        {/* Ref */}
        <p data-animate className="text-xs text-gray-400 mb-6">
          Referencia: <strong>{project.code}</strong> · Asesor: {project.assessor}
        </p>

        {/* Logo */}
        <div data-animate className="flex justify-center">
          <img src="/eltex-logo.png" alt="Eltex" className="h-8 object-contain opacity-60" />
        </div>
      </div>
    </div>
  );
}
