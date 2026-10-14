import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSession, resolveChurchId, forbiddenChurch } from '@/lib/requireSession';
import { computeEditableUnitIds, HEX_COLOR_RE } from '@/lib/orgChart';

/**
 * PATCH /api/units/color
 * Altera a cor de uma unidade (Área, Setor, Distrito...) no Organograma.
 *
 * Body: { unitId: string, color: '#RRGGBB' | null, churchId? }   (null = volta à cor padrão)
 *
 * Quem pode: Pastor (nível >= 6), Administrador do Sistema, ou o líder ativo
 * (unidade_lideres) da unidade ou de qualquer unidade acima dela. Células (nível mais
 * baixo) não têm cor própria — repetem a do setor — e são recusadas.
 * Tudo é validado aqui no servidor; esconder o botão na tela não é a proteção.
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { actor } = auth;

    const body = await req.json().catch(() => ({}));
    const unitId = typeof body?.unitId === 'string' ? body.unitId : '';
    const color: string | null = body?.color === null || body?.color === undefined ? null : String(body.color);
    const churchId = resolveChurchId(actor, typeof body?.churchId === 'string' ? body.churchId : null);
    if (!churchId) return forbiddenChurch();

    if (!/^[0-9a-f-]{36}$/i.test(unitId)) {
      return NextResponse.json({ error: 'Unidade inválida.' }, { status: 400 });
    }
    if (color !== null && !HEX_COLOR_RE.test(color)) {
      return NextResponse.json({ error: 'Cor inválida. Use o formato #RRGGBB.' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const [unitsRes, levelsRes] = await Promise.all([
      supabase.from('unidades').select('id, pai_id, nivel_tipo_id').eq('igreja_id', churchId).eq('ativo', true),
      supabase.from('nivel_tipo').select('id, ordem').eq('igreja_id', churchId),
    ]);
    if (unitsRes.error) throw new Error(unitsRes.error.message);
    if (levelsRes.error) throw new Error(levelsRes.error.message);

    const units = unitsRes.data || [];
    const levelOrder = new Map((levelsRes.data || []).map((l) => [l.id as string, Number(l.ordem)]));
    const maxOrder = Math.max(0, ...Array.from(levelOrder.values()));

    const target = units.find((u) => u.id === unitId);
    if (!target) {
      return NextResponse.json({ error: 'Unidade não encontrada nesta igreja.' }, { status: 404 });
    }
    if ((levelOrder.get(target.nivel_tipo_id as string) ?? 0) >= maxOrder) {
      return NextResponse.json(
        { error: 'Células usam a cor do setor e não podem ter cor própria.' },
        { status: 400 }
      );
    }

    const seesAll = actor.isSystemAdmin || actor.level >= 6;
    const ledUnitIds = new Set<string>();
    if (!seesAll) {
      if (!actor.memberId) return forbiddenChurch();
      const { data: led, error: ledErr } = await supabase
        .from('unidade_lideres')
        .select('unidade_id')
        .eq('pessoa_id', actor.memberId)
        .eq('ativo', true);
      if (ledErr) throw new Error(ledErr.message);
      (led || []).forEach((r) => ledUnitIds.add(r.unidade_id as string));
    }

    const editable = computeEditableUnitIds(
      units.map((u) => ({
        id: u.id as string,
        pai_id: (u.pai_id as string | null) ?? null,
        isLeaf: (levelOrder.get(u.nivel_tipo_id as string) ?? 0) >= maxOrder,
      })),
      ledUnitIds,
      seesAll
    );
    if (!editable.has(unitId)) {
      return NextResponse.json(
        { error: 'Você não tem permissão para alterar a cor desta unidade.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { error } = await supabase
      .from('unidades')
      .update({ cor: color })
      .eq('id', unitId)
      .eq('igreja_id', churchId);
    if (error) {
      const missingColumn = error.code === '42703';
      return NextResponse.json(
        { error: missingColumn ? 'A coluna de cor ainda não foi criada no banco.' : error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, unitId, color }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('Erro na rota /api/units/color:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao salvar a cor.' }, { status: 500 });
  }
}
