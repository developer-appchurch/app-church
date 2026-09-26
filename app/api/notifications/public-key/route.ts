import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/pushConfig';

/**
 * GET /api/notifications/public-key
 * Retorna a chave pública VAPID para registro do Service Worker no navegador.
 */
export async function GET() {
  const publicKey = getVapidPublicKey();
  return NextResponse.json({ publicKey });
}
