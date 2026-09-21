import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center font-sans">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">404</h2>
        <p className="text-slate-600 mb-6 font-medium">Página não encontrada</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[#052447] text-white font-semibold hover:bg-sky-900 transition-colors shadow-xs"
        >
          Voltar ao Início
        </Link>
      </div>
    </div>
  );
}
