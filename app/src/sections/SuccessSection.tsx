import { useEffect, useRef } from 'react';
import { CheckCircle } from 'lucide-react';
import type { ProjectData } from '@/types';

interface Props {
  project: ProjectData;
}

export function SuccessSection({ project }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstName = project.customerName?.split(' ')[0] || null;

  useEffect(() => {
    if (!containerRef.current) return;
    const els = containerRef.current.querySelectorAll<HTMLElement>('[data-animate]');
    els.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 120 + i * 130);
    });
  }, []);

  return (
    <div data-testid="success-section" className="min-h-screen flex items-center justify-center bg-white p-6">
      <div ref={containerRef} className="w-full max-w-xs mx-auto flex flex-col items-center text-center gap-6">

        <div data-animate>
          <img src="/eltex-logo.png" alt="Eltex" className="h-6 object-contain opacity-20 mx-auto" />
        </div>

        <div data-animate className="flex items-center justify-center w-16 h-16 rounded-full bg-green-50">
          <CheckCircle className="w-8 h-8 text-green-500" strokeWidth={1.5} />
        </div>

        <div data-animate className="space-y-2">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            {firstName ? `¡Todo listo, ${firstName}!` : '¡Todo listo!'}
          </h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Hemos recibido tu documentación correctamente.<br />
            Te contactaremos pronto para los próximos pasos.
          </p>
        </div>

        <div data-animate className="w-full rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">Expediente</span>
          <span className="font-mono text-xs font-bold text-gray-700 tracking-widest">{project.code}</span>
        </div>

      </div>
    </div>
  );
}
