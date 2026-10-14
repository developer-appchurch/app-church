import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSession, resolveChurchId, forbiddenChurch, actorCan } from '@/lib/requireSession';
import { computeEditableUnitIds, firstName, formatLeaders } from '@/lib/orgChart';

/**
 * GET /api/indicators/org-chart
 *
 * Dados da aba "Organograma" de Indicadores da Igreja: a árvore completa da igreja
 * (Área → Setor → Célula), com os líderes de cada unidade e a cor de cada uma.
 * Quem tem acesso à tela vê o organograma inteiro (não filtra por cobertura).
 *
 * Também devolve `editableIds`: as unidades cuja cor o usuário pode alterar
 * (Pastor/Administrador: todas as que não são célula; líder: a sua e as abaixo dela).
 * A rota PATCH /api/units/color revalida isso no servidor antes de salvar.
 *
 * Query: { churchId? }
 */

const CHUNK = 60;

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await run(ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...(data || []));
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { actor } = auth;

    const { searchParams } = new URL(req.url);
    const churchId = resolveChurchId(actor, searchParams.get('churchId'));
    if (!churchId) return forbiddenChurch();

    // Mesmo público da tela Indicadores da Igreja.
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

    // Unidades ativas. Se a coluna `cor` ainda não existe no banco, segue sem cores.
    let hasColorColumn = true;
    let unitsRes: { data: any[] | null; error: any } = await supabase
      .from('unidades')
      .select('id, nome, pai_id, nivel_tipo_id, cor')
      .eq('igreja_id', churchId)
      .eq('ativo', true);
    if (unitsRes.error && unitsRes.error.code === '42703') {
      hasColorColumn = false;
      unitsRes = await supabase
        .from('unidades')
        .select('id, nome, pai_id, nivel_tipo_id')
        .eq('igreja_id', churchId)
        .eq('ativo', true);
    }
    if (unitsRes.error) throw new Error(unitsRes.error.message);
    const units = unitsRes.data || [];

    const [levelsRes, churchRes, pastorRolesRes] = await Promise.all([
      supabase.from('nivel_tipo').select('id, nome, ordem').eq('igreja_id', churchId),
      supabase.from('igrejas').select('nome').eq('id', churchId).maybeSingle(),
      supabase.from('papeis').select('id').gte('nivel_hierarquia', 6),
    ]);
    if (levelsRes.error) throw new Error(levelsRes.error.message);
    const levels = levelsRes.data || [];
    const maxOrder = levels.reduce((m, l) => Math.max(m, Number(l.ordem)), 0);
    const levelById = new Map(levels.map((l) => [l.id, l]));

    const unitIds = units.map((u) => u.id as string);
    const leaderRows = await inChunks<{ unidade_id: string; pessoa_id: string; criado_em: string }>(unitIds, (chunk) =>
      supabase
        .from('unidade_lideres')
        .select('unidade_id, pessoa_id, criado_em')
        .eq('ativo', true)
        .in('unidade_id', chunk)
    );

    const pastorRoleIds = (pastorRolesRes.data || []).map((p) => p.id as string);
    let pastors: { id: string; nome: string }[] = [];
    if (pastorRoleIds.length > 0) {
      const { data, error } = await supabase
        .from('membros')
        .select('id, nome')
        .eq('igreja_id', churchId)
        .in('papel_id', pastorRoleIds)
        .order('nome');
      if (error) throw new Error(error.message);
      pastors = data || [];
    }

    const personIds = Array.from(new Set(leaderRows.map((r) => r.pessoa_id)));
    const people = await inChunks<{ id: string; nome: string }>(personIds, (chunk) =>
      supabase.from('membros').select('id, nome').in('id', chunk)
    );
    const nameById = new Map(people.map((p) => [p.id, p.nome]));

    const leadersByUnit = new Map<string, { pessoa_id: string; criado_em: string }[]>();
    leaderRows.forEach((r) => {
      const list = leadersByUnit.get(r.unidade_id) || [];
      list.push(r);
      leadersByUnit.set(r.unidade_id, list);
    });

    const seesAll = actor.isSystemAdmin || actor.level >= 6;
    const ledUnitIds = new Set<string>();
    if (!seesAll && actor.memberId) {
      leaderRows.forEach((r) => {
        if (r.pessoa_id === actor.memberId) ledUnitIds.add(r.unidade_id);
      });
    }

    const liteUnits = units.map((u) => ({
      id: u.id as string,
      pai_id: (u.pai_id as string | null) ?? null,
      isLeaf: Number(levelById.get(u.nivel_tipo_id)?.ordem ?? 0) >= maxOrder,
    }));
    const editable = computeEditableUnitIds(liteUnits, ledUnitIds, seesAll);

    const nodes = units
      .map((u) => {
        const level = levelById.get(u.nivel_tipo_id);
        const leaders = (leadersByUnit.get(u.id) || [])
          .slice()
          .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)))
          .map((r) => firstName(nameById.get(r.pessoa_id)));
        return {
          id: u.id as string,
          name: u.nome as string,
          parentId: (u.pai_id as string | null) ?? null,
          order: Number(level?.ordem ?? 0),
          levelName: (level?.nome as string | undefined) ?? '',
          isLeaf: Number(level?.ordem ?? 0) >= maxOrder,
          color: hasColorColumn ? ((u.cor as string | null) ?? null) : null,
          leaders: formatLeaders(leaders),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return NextResponse.json(
      {
        success: true,
        church: {
          name: (churchRes.data?.nome as string | undefined) ?? '',
          leaders: formatLeaders(pastors.map((p) => firstName(p.nome))),
        },
        nodes,
        editableIds: Array.from(editable),
        colorsAvailable: hasColorColumn,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/indicators/org-chart:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao montar o organograma.' }, { status: 500 });
  }
}
