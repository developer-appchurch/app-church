'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Check, X, Loader2, Sparkles } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { UserProfile } from '../types';

interface NotificationPermissionBannerProps {
  user: UserProfile;
}

export const NotificationPermissionBanner: React.FC<NotificationPermissionBannerProps> = ({
  user,
}) => {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribeToPush,
    refreshPermission,
  } = usePushNotifications(user.id);

  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    if (!supported) return true;
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      return true;
    }
    const previouslyDismissed = localStorage.getItem('appchurch_push_dismissed');
    if (previouslyDismissed === 'true') return true;
    return false;
  });

  const [successToast, setSuccessToast] = useState(false);

  // Reavalia o estado de dismiss e permissões ao montar e quando ocorrerem eventos
  useEffect(() => {
    const updateState = () => {
      refreshPermission();
      if (typeof window === 'undefined') return;
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window;
      if (!supported) {
        setIsDismissed(true);
        return;
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setIsDismissed(true);
        return;
      }
      const previouslyDismissed = localStorage.getItem('appchurch_push_dismissed');
      setIsDismissed(previouslyDismissed === 'true');
    };

    updateState();

    window.addEventListener('focus', updateState);
    window.addEventListener('appchurch:reset-push-banner', updateState);

    return () => {
      window.removeEventListener('focus', updateState);
      window.removeEventListener('appchurch:reset-push-banner', updateState);
    };
  }, [refreshPermission]);

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('appchurch_push_dismissed', 'true');
    }
  };

  const handleEnableNotifications = async () => {
    const success = await subscribeToPush(user.id);
    if (success) {
      setSuccessToast(true);
      setTimeout(() => {
        setIsDismissed(true);
        setSuccessToast(false);
      }, 3500);
    }
  };

  if ((isDismissed || isSubscribed) && !successToast) {
    return null;
  }

  return (
    <div className="mx-3 sm:mx-6 my-2">
      {successToast ? (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-3.5 flex items-center justify-between shadow-xs transition animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Check size={18} />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold">Lembretes ativados com sucesso!</p>
              <p className="text-[11px] text-emerald-700">
                Você receberá notificações automáticas caso haja algum relatório semanal pendente.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-[#041e3a] to-[#0a3563] text-white rounded-2xl p-4 shadow-md border border-sky-800/40 relative overflow-hidden transition animate-in fade-in">
          {/* Detalhes de luz de fundo */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-sky-400/20 rounded-full blur-2xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300 flex items-center justify-center shrink-0 shadow-inner">
                <Bell size={18} className="animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-sky-400/20 text-sky-200 border border-sky-400/30">
                    Lembretes Automáticos
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-100 mt-1 leading-snug">
                  Permita as notificações para receber lembretes importantes sobre os relatórios da sua célula.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0 w-full sm:w-auto justify-end pt-1 sm:pt-0">
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                Agora não
              </button>
              <button
                type="button"
                onClick={handleEnableNotifications}
                disabled={isLoading}
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 active:scale-95 text-[#041e3a] font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Ativando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    <span>Ativar Lembretes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
