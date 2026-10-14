import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
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
 * Os dados vêm de UMA função do banco (indicators_organograma). Se ela ainda não existir
 * no banco, cai no caminho antigo (várias consultas) para não deixar a tela quebrada.
 *
 * Query: { churchId? }
 */

interface RawLeader {
  id: string;
  nome: string;
}

interface RawNode {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  levelName: string;
  isLeaf: boolean;
  color: string | null;
  leaders: RawLeader[];
}

interface RawOrg {
  church: { name: string; pastors: string[] };
  nodes: RawNode[];
  colorsAvailable: boolean;
}

/** Caminho rápido: uma única chamada ao banco. Devolve null se a função não existe. */
async function loadViaRpc(supabase: SupabaseClient, churchId: string): Promise<RawOrg | null> {
  const { data, error } = await supabase.rpc('indicators_organograma', { p_igreja_id: churchId });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw new Error(error.message);
  }
  const raw = (data || {}) as { church?: { name?: string; pastors?: string[] }; nodes?: RawNode[] };
  return {
    church: { name: raw.church?.name || '', pastors: raw.church?.pastors || [] },
    nodes: raw.nodes || [],
    colorsAvailable: true,
  };
}

const CHUNK = 60;

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: any }>) {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map((c) => run(c)));
  const out: T[] = [];
  for (const r of results) {
    if (r.error) throw new Error(r.error.message);
    out.push(...(r.data || []));
  }
  return out;
}

/** Caminho de reserva (antes da função existir no banco): várias consultas. */
async function loadViaTables(supabase: SupabaseClient, churchId: string): Promise<RawOrg> {
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
  const pastorRoleIds = (pastorRolesRes.data || []).map((p) => p.id as string);

  const [leaderRows, pastorsRes] = await Promise.all([
    inChunks<{ unidade_id: string; pessoa_id: string; criado_em: string }>(unitIds, (chunk) =>
      supabase.from('unidade_lideres').select('unidade_id, pessoa_id, criado_em').eq('ativo', true).in('unidade_id', chunk)
    ),
    pastorRoleIds.length > 0
      ? supabase.from('membros').select('nome').eq('igreja_id', churchId).in('papel_id', pastorRoleIds).order('nome')
      : Promise.resolve({ data: [] as { nome: string }[], error: null }),
  ]);
  if (pastorsRes.error) throw new Error(pastorsRes.error.message);

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

  return {
    church: {
      name: (churchRes.data?.nome as string | undefined) ?? '',
      pastors: (pastorsRes.data || []).map((p: { nome: string }) => p.nome),
    },
    colorsAvailable: hasColorColumn,
    nodes: units.map((u) => {
      const level = levelById.get(u.nivel_tipo_id);
      const order = Number(level?.ordem ?? 0);
      return {
        id: u.id as string,
        name: u.nome as string,
        parentId: (u.pai_id as string | null) ?? null,
        order,
        levelName: (level?.nome as string | undefined) ?? '',
        isLeaf: order >= maxOrder,
        color: hasColorColumn ? ((u.cor as string | null) ?? null) : null,
        leaders: (leadersByUnit.get(u.id) || [])
          .slice()
          .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)))
          .map((r) => ({ id: r.pessoa_id, nome: nameById.get(r.pessoa_id) || '' })),
      };
    }),
  };
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

    const org = (await loadViaRpc(supabase, churchId)) ?? (await loadViaTables(supabase, churchId));

    const seesAll = actor.isSystemAdmin || actor.level >= 6;
    const ledUnitIds = new Set<string>();
    if (!seesAll && actor.memberId) {
      org.nodes.forEach((n) => {
        if (n.leaders.some((l) => l.id === actor.memberId)) ledUnitIds.add(n.id);
      });
    }
    const editable = computeEditableUnitIds(
      org.nodes.map((n) => ({ id: n.id, pai_id: n.parentId, isLeaf: n.isLeaf })),
      ledUnitIds,
      seesAll
    );

    const nodes = org.nodes
      .map((n) => ({
        id: n.id,
        name: n.name,
        parentId: n.parentId,
        order: n.order,
        levelName: n.levelName,
        isLeaf: n.isLeaf,
        color: n.color,
        leaders: formatLeaders(n.leaders.map((l) => firstName(l.nome))),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return NextResponse.json(
      {
        success: true,
        church: {
          name: org.church.name,
          leaders: formatLeaders(org.church.pastors.map((p) => firstName(p))),
        },
        nodes,
        editableIds: Array.from(editable),
        colorsAvailable: org.colorsAvailable,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/indicators/org-chart:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao montar o organograma.' }, { status: 500 });
  }
}
