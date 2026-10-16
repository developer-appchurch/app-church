import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSession, resolveChurchId, forbiddenChurch, actorCan } from '@/lib/requireSession';

/**
 * GET /api/indicators/celulas
 *
 * Dados da aba da menor unidade (Células) de Indicadores da Igreja: somas semanais de
 * membros e convidados por setor (função do banco `indicators_celulas`, UMA consulta). Os filtros (setor, área) e os
 * gráficos são montados na tela. Mesmo público da tela Indicadores da Igreja
 * (nível >= 3 ou church:admin).
 *
 * Query: { churchId? }
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { actor } = auth;

    const churchId = resolveChurchId(actor, new URL(req.url).searchParams.get('churchId'));
    if (!churchId) return forbiddenChurch();

    if (!actor.isSystemAdmin && actor.level < 3 && !(await actorCan(actor, 'church:admin'))) {
      return NextResponse.json(
        { error: 'Você não tem permissão para esta ação.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const { data, error } = await supabase.rpc('indicators_celulas', { p_igreja_id: churchId, p_semanas: 104 });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') {
        return NextResponse.json(
          { error: 'Os indicadores de células ainda não foram criados no banco. Aplique a migração indicators_celulas.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json(
      { success: true, ...(data as Record<string, unknown>) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/indicators/celulas:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao carregar os indicadores.' }, { status: 500 });
  }
}
