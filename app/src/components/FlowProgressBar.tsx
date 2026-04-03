import type { Section } from '@/types';

const STEPS: { section: Section; label: string }[] = [
  { section: 'property-docs', label: 'Documentos' },
  { section: 'province-selection', label: 'Ubicación' },
  { section: 'representation', label: 'Autorización' },
  { section: 'energy-certificate', label: 'Certificado' },
  { section: 'review', label: 'Revisión' },
];

function getSectionIndex(section: Section | 'phone' | 'success'): number {
  return STEPS.findIndex((s) => s.section === section);
}

interface Props {
  currentSection: Section | 'phone' | 'success';
}

export function FlowProgressBar({ currentSection }: Props) {
  const currentIndex = getSectionIndex(currentSection);
  if (currentIndex === -1) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 pt-3 pb-2">
      <div className="max-w-sm mx-auto">
        <div className="flex items-center gap-1.5 mb-1.5">
          {STEPS.map((step, i) => {
            const isCompleted = i < currentIndex;
            const isActive = i === currentIndex;
            return (
              <div key={step.section} className="flex-1">
                <div
                  className={`h-1 rounded-full transition-all duration-400 ${
                    isCompleted
                      ? 'bg-eltex-blue'
                      : isActive
                      ? 'bg-eltex-blue/35'
                      : 'bg-gray-200'
                  }`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium text-gray-500">
            {STEPS[currentIndex]?.label}
          </p>
          <p className="text-[10px] text-gray-400 tabular-nums">
            {currentIndex + 1} / {STEPS.length}
          </p>
        </div>
      </div>
    </div>
  );
}
