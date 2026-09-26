/**
 * Configurações e chaves VAPID para Web Push Notifications (RFC 8292).
 * Podem ser sobrescritas pelas variáveis de ambiente:
 * - NEXT_PUBLIC_VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_SUBJECT (ex: mailto:contato@appchurch.com)
 */

const FALLBACK_PUBLIC_KEY =
  'BArr7GtBm-7gONHTEsLx37pY9c0SSm7JDypNKy2ZlXygxe8_7GTpOnW10q_MBXrHUc2GCIi4NKjtArzNHxJjPB0';

const FALLBACK_PRIVATE_KEY =
  'hhzYR82Y5dyqTegf8LwZYp-ZoGartJm2S6IvC53LsO0';

const FALLBACK_SUBJECT = 'mailto:contato@appchurch.com';

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || FALLBACK_PUBLIC_KEY;
}

export function getVapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY || FALLBACK_PRIVATE_KEY;
}

export function getVapidSubject(): string {
  return process.env.VAPID_SUBJECT || FALLBACK_SUBJECT;
}
