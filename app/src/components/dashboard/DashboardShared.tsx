import { useState, type ReactNode } from 'react';
import { Sun, Thermometer, type LucideIcon } from 'lucide-react';

export function ProductBadge({ type }: { type: string }) {
  const isSolar = type?.toLowerCase() === 'solar';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        isSolar
          ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
          : 'border-cyan-200 bg-cyan-50 text-cyan-700'
      }`}
    >
      {isSolar ? <Sun className="h-3 w-3" /> : <Thermometer className="h-3 w-3" />}
      {isSolar ? 'Solar' : 'Aerotermia'}
    </span>
  );
}

export function SectionHeading({
  icon: Icon,
  label,
  actions,
}: {
  icon: LucideIcon;
  label: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-eltex-blue-light">
          <Icon className="h-3.5 w-3.5 text-eltex-blue" />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-gray-600">{label}</p>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function FieldRow({ label, value }: { label: string; value: unknown }) {
  if (!value && value !== 0) {
    return null;
  }

  return (
    <div className="flex gap-2 py-0.5 text-xs">
      <span className="w-36 shrink-0 text-gray-400">{label}</span>
      <span className="break-all font-medium text-gray-800">{String(value)}</span>
    </div>
  );
}

export function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-2 break-words text-sm font-semibold text-gray-900">{value || '—'}</p>
    </div>
  );
}

export function DocImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in rounded-xl border border-gray-200 object-cover transition-opacity hover:opacity-90 ${className}`}
      />
      {open ? (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-xl shadow-2xl" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            ✕
          </button>
        </div>
      ) : null}
    </>
  );
}
