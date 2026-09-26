import webpush from 'web-push';
import { getVapidPublicKey, getVapidPrivateKey, getVapidSubject } from './pushConfig';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    cellId?: string;
    cellName?: string;
    type?: string;
    [key: string]: any;
  };
}

export interface PushResult {
  success: boolean;
  statusCode?: number;
  expired?: boolean;
  error?: string;
}

// Configura os detalhes VAPID uma vez
let isVapidConfigured = false;
function ensureVapidConfig() {
  if (!isVapidConfigured) {
    webpush.setVapidDetails(
      getVapidSubject(),
      getVapidPublicKey(),
      getVapidPrivateKey()
    );
    isVapidConfigured = true;
  }
}

/**
 * Envia uma notificação Web Push para o dispositivo do usuário.
 * Retorna se o envio teve sucesso ou se a inscrição expirou (410/404).
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload
): Promise<PushResult> {
  try {
    ensureVapidConfig();

    const stringifiedPayload = JSON.stringify(payload);

    const response = await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      stringifiedPayload,
      {
        TTL: 60 * 60 * 24, // 24 horas de retenção se o aparelho estiver offline
        urgency: 'high',
      }
    );

    return {
      success: true,
      statusCode: response.statusCode,
    };
  } catch (err: any) {
    const statusCode = err.statusCode || err.status;
    const isExpired = statusCode === 410 || statusCode === 404;

    console.warn(
      `[PushService] Falha ao entregar notificação push (${statusCode || 'erro'}):`,
      err.message
    );

    return {
      success: false,
      statusCode,
      expired: isExpired,
      error: err.message || 'Erro desconhecido ao enviar push notification',
    };
  }
}
