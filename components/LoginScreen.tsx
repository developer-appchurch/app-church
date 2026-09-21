'use client';

import React, { useState } from 'react';
import { AppChurchLogo } from './AppChurchLogo';
import { AlertCircle } from 'lucide-react';
import { UserProfile } from '../types';
import { AppChurchService } from '../lib/supabase';
import { ConnectionBadge } from './ConnectionBadge';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
}) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim()) {
      setError('Por favor, informe seu login de acesso.');
      return;
    }
    if (!password.trim()) {
      setError('Por favor, informe sua senha.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const user = await AppChurchService.login(login, password);
      if (!user) {
        setError('Login ou senha incorretos. Utilize uma conta válida.');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      onLoginSuccess(user);
    } catch (err: any) {
      console.warn('Login exception:', err);
      setError('Erro ao processar autenticação. Tente novamente.');
      setIsLoading(false);
    }
  };

  return (
    <div
      id="screen-login"
      className="min-h-screen bg-[#041e3a] flex flex-col justify-between items-center relative overflow-hidden font-sans select-none"
    >
      {/* Background ambient accents */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-20 -right-24 w-80 h-80 bg-sky-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Section with Generic Platform Logo */}
      <div className="w-full max-w-md pt-12 pb-6 px-6 flex flex-col items-center justify-center z-10 text-center">
        <div className="transform transition-transform hover:scale-105 duration-300">
          <AppChurchLogo variant="light" className="h-24" />
        </div>
      </div>

      {/* Main Curved White Card */}
      <div className="w-full max-w-md bg-[#f8fafc] rounded-t-[44px] shadow-2xl px-8 pt-9 pb-12 flex-1 flex flex-col justify-between z-10 border-t border-slate-200/40">
        <div className="w-full max-w-xs mx-auto">
          {/* Welcome Heading */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold text-[#052447] tracking-tight leading-tight">
              Olá,
              <br />
              Bem-vindo
            </h1>
            <p className="text-slate-500 text-xs mt-2 font-medium">
              Acesse com seu usuário e senha
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-start gap-2 font-medium animate-in fade-in">
                <AlertCircle size={15} className="shrink-0 text-red-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="login-input"
                className="block text-xs font-bold text-[#052447] mb-1.5 pl-1"
              >
                Login
              </label>
              <div className="relative">
                <input
                  id="login-input"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Seu usuário de acesso"
                  autoComplete="username"
                  required
                  className="w-full bg-[#f1f5f9] border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-bold text-[#052447] mb-1.5 pl-1"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  required
                  className="w-full bg-[#f1f5f9] border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                />
              </div>
            </div>

            <div className="pt-3">
              <button
                id="btn-login-submit"
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#052447] hover:bg-[#073366] active:scale-[0.99] text-white font-bold py-3.5 px-6 rounded-full shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-80"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entrando...
                  </span>
                ) : (
                  'Entrar'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Sinalizador de Conexão com o Banco de Dados no canto inferior direito */}
      <ConnectionBadge />
    </div>
  );
};
