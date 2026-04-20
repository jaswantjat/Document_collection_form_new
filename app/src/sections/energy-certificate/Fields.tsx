interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  type?: 'text' | 'number';
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
}: FieldProps) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={type === 'number' ? 'numeric' : 'text'}
        min={type === 'number' ? 0 : undefined}
        className={`form-input ${error ? 'error' : ''}`}
      />
      {error && <p data-ec-field-error className="text-sm text-red-500">{error}</p>}
    </label>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: TextAreaFieldProps) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`form-input min-h-[96px] ${error ? 'error' : ''}`}
      />
      {error && <p data-ec-field-error className="text-sm text-red-500">{error}</p>}
    </label>
  );
}

interface SegmentedOptionsProps {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  columns?: 2 | 3;
}

export function SegmentedOptions({
  label,
  options,
  value,
  onChange,
  error,
  columns = 2,
}: SegmentedOptionsProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <div className={`grid gap-2 ${columns === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`px-3 py-3.5 rounded-xl border-2 text-sm font-semibold transition-all active:scale-[0.97] ${
                active ? 'border-eltex-blue bg-eltex-blue text-white' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <p data-ec-field-error className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

interface YesNoFieldProps {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  error?: string;
}

export function YesNoField({
  label,
  value,
  onChange,
  error,
}: YesNoFieldProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {[
          { value: true, label: 'Sí' },
          { value: false, label: 'No' },
        ].map((option) => {
          const active = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => onChange(option.value)}
              className={`px-3 py-3.5 rounded-xl border-2 text-sm font-semibold transition-all active:scale-[0.97] ${
                active ? 'border-eltex-blue bg-eltex-blue text-white' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <p data-ec-field-error className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
