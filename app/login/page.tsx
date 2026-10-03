'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoginScreen } from '@/components/LoginScreen';
import { AppChurchLogo } from '@/components/AppChurchLogo';
import { AppChurchService } from '@/lib/supabase';
import { UserProfile } from '@/types';

export default function LoginPage() {
  const router = useRouter();
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function verifyAuth() {
      // Se acabamos de deslogar (sinalizado pelo handleLogout), já sabemos com
      // certeza que não há sessão ativa — pula a checagem no servidor, que é
      // redundante aqui e foi o que causava o formulário "recarregar"/voltar
      // enquanto o usuário já começava a digitar o próximo login.
      try {
        if (sessionStorage.getItem('appchurch_just_logged_out') === '1') {
          sessionStorage.removeItem('appchurch_just_logged_out');
          if (isMounted) setIsCheckingSession(false);
          return;
        }
      } catch {
        // ignore - segue para a checagem normal
      }

      // Checa se já existe usuário em cache para redirecionamento imediato (0ms)
      const cached = AppChurchService.getCachedUser();
      if (cached && isMounted) {
        router.replace('/');
        return;
      }

      try {
        const user = await AppChurchService.getCurrentUser();
        if (isMounted && user) {
          router.replace('/');
          return;
        }
      } catch (err) {
        console.warn('Erro ao verificar sessão na página /login:', err);
      } finally {
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    }

    verifyAuth();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleLoginSuccess = (user: UserProfile) => {
    router.replace('/');
  };

  // Splash / Skeleton enquanto valida a sessão existente, sem piscar o formulário
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#041e3a] flex flex-col items-center justify-center relative overflow-hidden font-sans">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 -right-24 w-80 h-80 bg-sky-400/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center justify-center z-10">
          <div className="animate-pulse flex flex-col items-center">
            <AppChurchLogo variant="light" className="h-[80px] mb-6" />
            <div className="w-48 h-2.5 bg-blue-900/60 rounded-full overflow-hidden relative">
              <div className="w-1/2 h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded-full animate-[shimmer_1.5s_infinite]" />
            </div>
          </div>
          <p className="text-sky-200/80 text-xs mt-4 font-medium tracking-wide">
            Verificando credenciais...
          </p>
        </div>
      </div>
    );
  }

  return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
}
