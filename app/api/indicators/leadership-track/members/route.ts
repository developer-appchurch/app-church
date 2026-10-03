import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/indicators/leadership-track/members
 *
 * Lista paginada de membros no escopo da tela "Indicadores Igreja" (aba
 * Trilho de Liderança), cada um com seu % de conclusão do trilho — usada
 * na visão "Membros (N)". Mesmo cálculo de escopo do endpoint de
 * estatísticas (/api/indicators/leadership-track), mas aqui as conclusões
 * são buscadas só para a página atual de membros (não para o escopo
 * inteiro), já que listamos página a página.
 *
 * Query: { churchId, unitId?, search?, limit?, offset? }
 */

function collectSubtreeIds(rootId: string, childrenMap: Map<string, string[]>): Set<string> {
  const result = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const children = childrenMap.get(current) || [];
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        queue.push(childId);
      }
    }
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');
    const unitId = searchParams.get('unitId') || null;
    const search = (searchParams.get('search') || '').trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '30', 10) || 30, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    if (!churchId) {
      return NextResponse.json({ error: 'Parâmetro churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // Unidades — só para resolver a subárvore do escopo escolhido
    let subtreeIds: string[] | null = null;
    if (unitId) {
      const { data: unitsRows, error: unitsErr } = await supabase
        .from('unidades')
        .select('id, pai_id')
        .eq('igreja_id', churchId);

      if (unitsErr) {
        return NextResponse.json({ error: unitsErr.message }, { status: 500 });
      }

      const childrenMap = new Map<string, string[]>();
      (unitsRows || []).forEach((u: any) => {
        if (u.pai_id) {
          const list = childrenMap.get(u.pai_id) || [];
          list.push(u.id);
          childrenMap.set(u.pai_id, list);
        }
      });
      subtreeIds = Array.from(collectSubtreeIds(unitId, childrenMap));
    }

    // Etapas do trilho (próprias da igreja; senão o padrão global) — só o
    // total importa aqui, o detalhe por etapa fica no endpoint de estatísticas.
    const { data: ownSteps } = await supabase.from('etapas_trilha').select('id').eq('igreja_id', churchId);
    let stepIds = (ownSteps || []).map((s: any) => s.id);
    if (stepIds.length === 0) {
      const { data: globalSteps } = await supabase.from('etapas_trilha').select('id').is('igreja_id', null);
      stepIds = (globalSteps || []).map((s: any) => s.id);
    }
    const totalSteps = stepIds.length;

    // Membros no escopo, paginados e com busca por nome
    let membersQuery = supabase
      .from('membros')
      .select('id, nome, url_avatar, unidade:unidades(nome)', { count: 'exact' })
      .eq('igreja_id', churchId)
      .order('nome', { ascending: true })
      .range(offset, offset + limit - 1);

    if (subtreeIds) membersQuery = membersQuery.in('unidade_id', subtreeIds);
    if (search) membersQuery = membersQuery.ilike('nome', `%${search}%`);

    const { data: memberRows, error: membersErr, count } = await membersQuery;
    if (membersErr) {
      return NextResponse.json({ error: membersErr.message }, { status: 500 });
    }

    const members = memberRows || [];
    const memberIds = members.map((m: any) => m.id);

    // Conclusões só dos membros desta página
    const completedByMember = new Map<string, number>();
    if (memberIds.length > 0 && stepIds.length > 0) {
      const { data: compRows } = await supabase
        .from('membro_etapas_trilha')
        .select('membro_id')
        .in('membro_id', memberIds)
        .in('etapa_id', stepIds)
        .eq('concluida', true);

      (compRows || []).forEach((r: any) => {
        completedByMember.set(r.membro_id, (completedByMember.get(r.membro_id) || 0) + 1);
      });
    }

    const result = members.map((m: any) => {
      const unidade = Array.isArray(m.unidade) ? m.unidade[0] : m.unidade;
      const completedCount = completedByMember.get(m.id) || 0;
      const percent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 1000) / 10 : 0;
      return {
        id: m.id,
        name: m.nome,
        avatarUrl: m.url_avatar || undefined,
        cellName: unidade?.nome || '',
        completedCount,
        totalSteps,
        percent,
      };
    });

    return NextResponse.json({ success: true, total: count ?? result.length, members: result });
  } catch (err: any) {
    console.error('Erro na rota /api/indicators/leadership-track/members:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao listar membros.' }, { status: 500 });
  }
}
