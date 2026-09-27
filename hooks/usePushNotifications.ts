'use client';

import { useState, useEffect, useCallback } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(membroId?: string) {
  const [isSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  });

  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return 'default';
    }
    return Notification.permission;
  });

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshPermission = useCallback(() => {
    if (typeof window !== 'undefined' && typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
      if (isSupported && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => registration.pushManager.getSubscription())
          .then((sub) => {
            setIsSubscribed(Boolean(sub));
          })
          .catch((err) => {
            console.warn('[Push] Erro ao verificar assinatura:', err);
          });
      }
    }
  }, [isSupported]);

  // Verifica se já existe uma assinatura ativa no Service Worker
  useEffect(() => {
    refreshPermission();
  }, [refreshPermission]);

  const subscribeToPush = useCallback(
    async (targetMembroId?: string): Promise<boolean> => {
      const activeMemberId = targetMembroId || membroId;
      if (!activeMemberId) {
        setErrorMessage('Usuário não autenticado.');
        return false;
      }

      if (!isSupported) {
        setErrorMessage('Seu navegador não suporta notificações Push.');
        return false;
      }

      // Remove a flag de descarte ao solicitar explicitamente a inscrição
      if (typeof window !== 'undefined') {
        localStorage.removeItem('appchurch_push_dismissed');
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        // 1. Solicita permissão nativa do navegador
        const userPermission = await Notification.requestPermission();
        setPermission(userPermission);

        if (userPermission !== 'granted') {
          if (userPermission === 'denied') {
            localStorage.setItem('appchurch_push_denied', 'true');
            setErrorMessage(
              'A permissão de notificações foi bloqueada no navegador. Para ativar, libere as notificações nas configurações do site.'
            );
          }
          setIsLoading(false);
          return false;
        }

        // 2. Registra o Service Worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // 3. Busca a chave pública VAPID do servidor
        const keyRes = await fetch('/api/notifications/public-key');
        if (!keyRes.ok) {
          throw new Error('Falha ao obter chave pública de notificação.');
        }
        const { publicKey } = await keyRes.json();
        if (!publicKey) {
          throw new Error('Chave VAPID não configurada no servidor.');
        }

        // 4. Inscreve o navegador no PushManager
        const applicationServerKey = urlBase64ToUint8Array(publicKey);
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey as any,
          });
        }

        const subJson = subscription.toJSON();
        const p256dh = subJson.keys?.p256dh;
        const auth = subJson.keys?.auth;

        if (!subscription.endpoint || !p256dh || !auth) {
          throw new Error('Assinatura Push incompleta gerada pelo navegador.');
        }

        // 5. Detecta a plataforma amigável do dispositivo
        let plataforma = 'Web Browser';
        const ua = navigator.userAgent;
        if (/Android/i.test(ua)) plataforma = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua)) plataforma = 'iOS';
        else if (/Windows/i.test(ua)) plataforma = 'Windows';
        else if (/Mac/i.test(ua)) plataforma = 'macOS';

        // 6. Envia os dados da inscrição para salvar na tabela 'dispositivos_push'
        const registerRes = await fetch('/api/notifications/register-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            membroId: activeMemberId,
            endpoint: subscription.endpoint,
            p256dh,
            auth,
            plataforma,
          }),
        });

        if (!registerRes.ok) {
          const errData = await registerRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Falha ao registrar dispositivo no servidor.');
        }

        setIsSubscribed(true);
        localStorage.removeItem('appchurch_push_denied');
        localStorage.removeItem('appchurch_push_dismissed');
        return true;
      } catch (err: any) {
        console.error('[Push] Erro ao ativar notificações:', err);
        const isAbort =
          err?.name === 'AbortError' ||
          err?.message?.includes('AbortError') ||
          err?.message?.includes('Registration failed - push service error') ||
          err?.message?.includes('push service');

        if (isAbort) {
          setErrorMessage(
            'O serviço de push foi bloqueado pelo seu navegador (comum no Brave ou configurações restritivas). Para receber notificações, ative a opção "Usar serviços do Google para mensagens push" nas configurações de Privacidade e Segurança do navegador.'
          );
        } else {
          setErrorMessage(err.message || 'Não foi possível ativar as notificações.');
        }
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isSupported, membroId]
  );

  const unsubscribeFromPush = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await fetch('/api/notifications/unregister-device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          });
        }
      }
      setIsSubscribed(false);
      return true;
    } catch (err: any) {
      console.warn('[Push] Erro ao desinscrever:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    errorMessage,
    subscribeToPush,
    unsubscribeFromPush,
    refreshPermission,
  };
}
