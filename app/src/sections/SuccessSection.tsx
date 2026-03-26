import { useEffect, useRef } from 'react';
import type { ProjectData } from '@/types';

interface Props {
  project: ProjectData;
}

export function SuccessSection({ project }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstName = project.customerName.split(' ')[0];

  useEffect(() => {
    if (!containerRef.current) return;
    const els = containerRef.current.querySelectorAll<HTMLElement>('[data-animate]');
    els.forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 200 + i * 150);
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-white">
      <div ref={containerRef} className="text-center max-w-xs mx-auto space-y-5">
        <div data-animate>
          <img src="/eltex-logo.png" alt="Eltex" className="h-6 object-contain opacity-30 mx-auto mb-10" />
        </div>

        <div data-animate>
          <p className="text-3xl font-light text-gray-900 tracking-tight">
            Gracias, {firstName}.
          </p>
        </div>

        <div data-animate>
          <p className="text-gray-400 text-sm leading-relaxed">
            Hemos recibido tu documentación.<br />
            Nos pondremos en contacto contigo pronto.
          </p>
        </div>

        <div data-animate>
          <p className="text-[11px] text-gray-200 mt-8 tracking-wide">
            {project.code}
          </p>
        </div>
      </div>
    </div>
  );
}
