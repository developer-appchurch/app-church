import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireSession } from '@/lib/requireSession';

/**
 * POST /api/notifications/register-device
 * Registra ou atualiza um dispositivo push associado ao membro autenticado.
 * Realiza UPSERT garantindo suporte a múltiplos aparelhos e sem duplicidade por endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const body = await req.json().catch(() => ({}));
    const { membroId: bodyMembroId, endpoint, p256dh, auth: pushAuth, plataforma } = body;
    // O dispositivo sempre é vinculado a quem está logado (não ao id enviado no corpo).
    const membroId = auth.actor.memberId || (auth.actor.isSystemAdmin ? bodyMembroId : null);

    if (!membroId) {
      return NextResponse.json(
        { error: 'membroId é obrigatório para registrar dispositivo.' },
        { status: 400 }
      );
    }

    if (!endpoint || !p256dh || !pushAuth) {
      return NextResponse.json(
        { error: 'endpoint, p256dh e auth são obrigatórios para a assinatura push.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Banco de dados não configurado.' },
        { status: 500 }
      );
    }

    const payload = {
      membro_id: membroId,
      endpoint: endpoint.trim(),
      p256dh: p256dh.trim(),
      auth: pushAuth.trim(),
      plataforma: plataforma || 'Web / PWA',
      ativo: true,
      atualizado_em: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('dispositivos_push')
      .upsert(payload, { onConflict: 'endpoint' });

    if (error) {
      // Se a tabela ainda não tiver sido criada no Supabase
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn(
          '[RegisterDevice] Tabela dispositivos_push ainda não foi criada no banco Supabase. Execute a migration supabase_notifications_migration.sql.'
        );
        return NextResponse.json({
          success: true,
          savedToDatabase: false,
          warning: 'Tabela dispositivos_push não existe no banco Supabase.',
        });
      }

      console.error('[RegisterDevice] Erro ao registrar dispositivo push:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Dispositivo push registrado com sucesso.',
    });
  } catch (err: any) {
    console.error('[RegisterDevice] Erro inesperado:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}
