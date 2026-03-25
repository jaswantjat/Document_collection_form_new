import { useState, useRef, useEffect } from 'react';
import { ArrowRight, Loader2, UserPlus } from 'lucide-react';
import type { ProjectData } from '@/types';
import { lookupByPhone, createProject } from '@/services/api';

interface Props {
  onPhoneConfirmed: (phone: string, project: ProjectData) => void;
  onContinue: () => void;
}

export function PhoneSection({ onPhoneConfirmed }: Props) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newProduct, setNewProduct] = useState<'solar' | 'aerothermal'>('solar');
  const [newAssessor, setNewAssessor] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const lookup = async () => {
    const val = phone.trim();
    if (val.replace(/\s/g, '').length < 9) { setError('Introduce un teléfono válido'); return; }
    setLoading(true); setError('');
    try {
      const res = await lookupByPhone(val);
      if (res.success && res.project) { onPhoneConfirmed(val, res.project); }
      else { setShowNewForm(true); }
    } catch { setError('Sin conexión. Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  };

  const create = async () => {
    const val = phone.trim();
    if (val.replace(/\s/g, '').length < 9) { setError('Introduce un teléfono válido'); return; }
    setLoading(true); setError('');
    try {
      const res = await createProject({
        phone: val,
        email: newEmail.trim() || undefined,
        productType: newProduct,
        assessor: newAssessor.trim() || undefined,
      });
      if (res.success && res.project) { onPhoneConfirmed(val, res.project); }
      else { setError(res.message || 'No se pudo crear el expediente.'); }
    } catch { setError('Sin conexión. Inténtalo de nuevo.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="flex justify-center">
          <img src="/eltex-logo.png" alt="Eltex" className="h-9 object-contain" />
        </div>

        {!showNewForm ? (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-gray-900">Teléfono del cliente</h1>
              <p className="text-gray-400 text-sm">Introduce el número para localizar o crear su expediente.</p>
            </div>

            <div className="space-y-3">
              <input
                ref={inputRef}
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && lookup()}
                placeholder="+34 600 000 000"
                autoComplete="tel"
                className={`form-input text-lg ${error ? 'error' : ''}`}
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="button"
                onClick={lookup}
                disabled={loading}
                className="btn-primary flex items-center justify-center gap-2 text-base py-3.5"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continuar <ArrowRight className="w-5 h-5" /></>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-gray-900">Nuevo expediente</h1>
              <p className="text-gray-400 text-sm">No existe expediente para <strong className="text-gray-700">{phone}</strong>. Completa los datos para crearlo.</p>
            </div>

            <div className="space-y-4">
              {/* Product */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">Producto</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'solar', label: 'Solar', icon: '☀️' },
                    { id: 'aerothermal', label: 'Aerotermia', icon: '🌡️' },
                  ] as const).map(pt => (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => setNewProduct(pt.id)}
                      className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                        newProduct === pt.id
                          ? 'border-eltex-blue bg-eltex-blue text-white'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      <span className="block text-xl mb-0.5">{pt.icon}</span>
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assessor */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-gray-700">Tu nombre (asesor)</p>
                <input
                  type="text"
                  value={newAssessor}
                  onChange={e => setNewAssessor(e.target.value)}
                  placeholder="Nombre completo"
                  className="form-input"
                  autoFocus
                />
              </div>

              {/* Email optional */}
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-gray-700">Email del cliente <span className="text-gray-400 font-normal">(opcional)</span></p>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="form-input"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowNewForm(false); setError(''); }}
                  className="btn-secondary px-4"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={create}
                  disabled={loading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserPlus className="w-4 h-4" /> Crear expediente</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
