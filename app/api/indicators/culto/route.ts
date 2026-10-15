import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSession, resolveChurchId, forbiddenChurch, actorCan } from '@/lib/requireSession';

/**
 * GET /api/indicators/culto
 *
 * Dados da aba "Cultos" de Indicadores da Igreja: campi, horários e números agregados por
 * mês, semana e horário (função do banco `indicators_culto`, UMA consulta). Os filtros e os
 * gráficos são montados na tela. Mesmo público da tela Indicadores da Igreja
 * (nível >= 3 ou church:admin); lançar os dados é outra permissão (culto:gerenciar).
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

    const { data, error } = await supabase.rpc('indicators_culto', { p_igreja_id: churchId });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') {
        return NextResponse.json(
          { error: 'Os dados de culto ainda não foram criados no banco. Aplique a migração de cultos.' },
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
    console.error('Erro na rota /api/indicators/culto:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao carregar os cultos.' }, { status: 500 });
  }
}
