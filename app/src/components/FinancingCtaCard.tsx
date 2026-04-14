import { ArrowRight, CreditCard } from 'lucide-react';
import type { FinancingCta } from '@/lib/financing';

interface Props {
  cta: FinancingCta | null;
}

export function FinancingCtaCard({ cta }: Props) {
  if (!cta) return null;

  return (
    <div
      data-testid="financing-cta-card"
      className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-sky-950">{cta.title}</p>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Opcional
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-sky-900/80">{cta.description}</p>
          <a
            data-testid="financing-cta-link"
            href={cta.href}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
          >
            {cta.actionLabel}
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
