export function LoadingSection() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-eltex-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Cargando tu proyecto...</p>
        <div className="mt-8">
          <img src="/eltex-logo.png" alt="Eltex" className="h-7 object-contain mx-auto opacity-40" />
        </div>
      </div>
    </div>
  );
}
