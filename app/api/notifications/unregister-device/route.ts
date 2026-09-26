import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * POST /api/notifications/unregister-device
 * Desativa o dispositivo push associado ao endpoint fornecido.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint é obrigatório' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const { error } = await supabase
      .from('dispositivos_push')
      .update({ ativo: false, atualizado_em: new Date().toISOString() })
      .eq('endpoint', endpoint.trim());

    if (error && error.code !== '42P01') {
      console.warn('[UnregisterDevice] Aviso ao desativar dispositivo:', error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}
