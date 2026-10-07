import { NextRequest, NextResponse } from 'next/server';
import { hasValidAdminSession } from '@/lib/adminSession';

/**
 * Guarda para rotas administrativas de manutenção (provisionamento de schema/índices).
 * Só passa com a sessão assinada do Administrador do Sistema (login "admin").
 * Uso: const denied = requireSystemAdmin(req); if (denied) return denied;
 */
export function requireSystemAdmin(req: NextRequest): NextResponse | null {
  if (hasValidAdminSession(req)) return null;
  return NextResponse.json(
    { error: 'Acesso restrito ao Administrador do Sistema.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
}
