import { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { dashboardLogin } from '@/services/api';

interface Props {
  onLogin: (token: string) => void;
}

export function DashboardLogin({ onLogin }: Props) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim()) { setError('Introduce la contraseña.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await dashboardLogin(password);
      if (res.success && res.token) {
        sessionStorage.setItem('dashboard_token', res.token);
        onLogin(res.token);
      } else {
        setError(res.message || 'Contraseña incorrecta.');
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-eltex-lavender flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="form-card p-8 space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <img src="/eltex-logo.png" alt="Eltex" className="h-9 object-contain" />
          </div>

          {/* Icon + heading */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-eltex-blue-light flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7 text-eltex-blue" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Acceso al panel</h1>
            <p className="text-sm text-gray-500">Introduce la contraseña de administrador para continuar.</p>
          </div>

          {/* Password field */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Contraseña</label>
            <div className="relative">
              <input
                ref={inputRef}
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                className={`form-input pr-11 ${error ? 'error' : ''}`}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-xs text-eltex-error">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
