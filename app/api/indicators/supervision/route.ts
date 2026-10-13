import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSession, resolveChurchId, forbiddenChurch, actorCan } from '@/lib/requireSession';

/**
 * GET /api/indicators/supervision
 *
 * Dados da aba "Supervisão" de Indicadores da Igreja: % de células
 * supervisionadas por mês nos últimos 12 meses.
 *
 * UMA chamada ao banco (RPC indicators_supervisao) devolve o conjunto completo
 * dentro da cobertura de quem consulta — meses, áreas, setores e, por célula,
 * em que meses existiu e em quais foi supervisionada. A tela faz o filtro por
 * Área/Setor, o cálculo dos percentuais e a lista das células pendentes em
 * memória, então trocar filtro ou mês NÃO gera novas consultas.
 *
 * Cobertura (permissão):
 *  - Pastor (nível >= 6) e Administrador do Sistema: toda a igreja.
 *  - Demais (Setor, Área, Distrito...): só as células das unidades que lideram
 *    (unidade_lideres ativo) e de toda a subárvore delas — resolvido dentro do banco.
 *
 * Query: { churchId? }
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { actor } = auth;

    const { searchParams } = new URL(req.url);
    const churchId = resolveChurchId(actor, searchParams.get('churchId'));
    if (!churchId) return forbiddenChurch();

    // Mesmo público da tela Indicadores da Igreja: Líder de Setor ou acima, ou permissão church:admin.
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

    const seesWholeChurch = actor.isSystemAdmin || actor.level >= 6;
    if (!seesWholeChurch && !actor.memberId) return forbiddenChurch();

    const { data, error } = await supabase.rpc('indicators_supervisao', {
      p_igreja_id: churchId,
      p_lider_id: seesWholeChurch ? null : actor.memberId,
      p_meses: 12,
    });

    if (error) {
      console.error('Erro na RPC indicators_supervisao:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, wholeChurch: seesWholeChurch, ...(data as Record<string, unknown>) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/indicators/supervision:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao calcular a supervisão.' }, { status: 500 });
  }
}
