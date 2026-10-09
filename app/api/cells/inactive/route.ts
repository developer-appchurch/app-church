import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSession, resolveChurchId, forbiddenChurch, unitInChurch } from '@/lib/requireSession';

/** Somente o Administrador do Sistema vê e reativa células desativadas. */
function denyUnlessSystemAdmin(isSystemAdmin: boolean): NextResponse | null {
  if (isSystemAdmin) return null;
  return NextResponse.json(
    { error: 'Somente o Administrador do Sistema pode gerenciar células desativadas.' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * GET /api/cells/inactive?churchId=...
 * Células desativadas da igreja, com o setor, a data da desativação e o histórico de relatórios.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const denied = denyUnlessSystemAdmin(auth.actor.isSystemAdmin);
    if (denied) return denied;

    const churchId = resolveChurchId(auth.actor, req.nextUrl.searchParams.get('churchId'));
    if (!churchId) return forbiddenChurch();

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const [{ data: units, error }, { data: levels }] = await Promise.all([
      supabase.from('unidades').select('id, nome, pai_id, nivel_tipo_id, ativo, atualizado_em').eq('igreja_id', churchId),
      supabase.from('nivel_tipo').select('id, ordem').eq('igreja_id', churchId),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const all = units || [];
    // Célula = unidade do nível mais baixo da hierarquia (maior "ordem")
    const maxOrder = Math.max(...(levels || []).map((l: any) => l.ordem), -Infinity);
    const leafLevelIds = new Set((levels || []).filter((l: any) => l.ordem === maxOrder).map((l: any) => l.id));
    const inactive = all.filter((u: any) => u.ativo === false && leafLevelIds.has(u.nivel_tipo_id));
    const byId = new Map(all.map((u: any) => [u.id, u]));

    const ids = inactive.map((u: any) => u.id);
    const { data: reports } = ids.length
      ? await supabase.from('relatorios_semanais').select('unidade_id, data_relatorio').in('unidade_id', ids)
      : { data: [] as any[] };
    const stats = new Map<string, { count: number; last: string | null }>();
    (reports || []).forEach((r: any) => {
      const s = stats.get(r.unidade_id) || { count: 0, last: null };
      s.count += 1;
      if (!s.last || r.data_relatorio > s.last) s.last = r.data_relatorio;
      stats.set(r.unidade_id, s);
    });

    const cells = inactive
      .map((u: any) => {
        const parent: any = u.pai_id ? byId.get(u.pai_id) : null;
        return {
          id: u.id,
          name: u.nome,
          parentName: parent?.nome || null,
          parentActive: !parent || parent.ativo !== false,
          deactivatedAt: u.atualizado_em,
          reportCount: stats.get(u.id)?.count || 0,
          lastReportDate: stats.get(u.id)?.last || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    return NextResponse.json({ cells }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('Erro em GET /api/cells/inactive:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

/**
 * POST /api/cells/inactive  Body: { cellId }
 * Reativa uma célula. Ela volta sem membros e sem líderes (foram desvinculados na desativação).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const denied = denyUnlessSystemAdmin(auth.actor.isSystemAdmin);
    if (denied) return denied;

    const { cellId } = (await req.json().catch(() => ({}))) as { cellId?: string };
    if (!cellId) return NextResponse.json({ error: 'cellId é obrigatório.' }, { status: 400 });
    const unitErr = await unitInChurch(auth.actor, cellId);
    if (unitErr) return unitErr;

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const { data: cell } = await supabase.from('unidades').select('id, pai_id, ativo').eq('id', cellId).maybeSingle();
    if (!cell) return NextResponse.json({ error: 'Célula não encontrada.' }, { status: 404 });
    if (cell.ativo !== false) return NextResponse.json({ error: 'Esta célula já está ativa.' }, { status: 400 });

    if (cell.pai_id) {
      const { data: parent } = await supabase.from('unidades').select('nome, ativo').eq('id', cell.pai_id).maybeSingle();
      if (parent && parent.ativo === false) {
        return NextResponse.json(
          { error: `O setor "${parent.nome}" também está desativado. Reative-o antes ou mova a célula de setor.` },
          { status: 400 }
        );
      }
    }

    const { error } = await supabase
      .from('unidades')
      .update({ ativo: true, atualizado_em: new Date().toISOString() })
      .eq('id', cellId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, cellId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('Erro em POST /api/cells/inactive:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
