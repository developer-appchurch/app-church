import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSession, requireLevel, unitInChurch } from '@/lib/requireSession';

/** Papel padrão de Membro (mesmo fallback usado em PATCH /api/hierarchy/units). */
const DEFAULT_MEMBER_ROLE_ID = 'b2000000-0000-0000-0000-000000000003';

/**
 * POST /api/cells/deactivate  Body: { cellId }
 * Desativa uma célula (Líder de Setor ou acima, somente células sob a sua cobertura):
 * - os membros são desvinculados da célula (não são apagados);
 * - o vínculo dos líderes é encerrado e quem não lidera outra unidade volta a ser Membro;
 * - a célula fica inativa (ativo = false). Relatórios e histórico são preservados.
 * A reativação é feita pelo Administrador do Sistema (Configurações da Igreja › Células Desativadas).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const deniedLevel = requireLevel(auth.actor, 3);
    if (deniedLevel) return deniedLevel;

    const { cellId } = (await req.json().catch(() => ({}))) as { cellId?: string };
    if (!cellId) {
      return NextResponse.json({ error: 'cellId é obrigatório.' }, { status: 400 });
    }
    const unitErr = await unitInChurch(auth.actor, cellId);
    if (unitErr) return unitErr;

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const { data: cell } = await supabase
      .from('unidades')
      .select('id, nome, igreja_id, nivel_tipo_id, ativo')
      .eq('id', cellId)
      .maybeSingle();
    if (!cell) {
      return NextResponse.json({ error: 'Célula não encontrada.' }, { status: 404 });
    }
    if (cell.ativo === false) {
      return NextResponse.json({ error: 'Esta célula já está desativada.' }, { status: 400 });
    }

    const churchId: string = cell.igreja_id;
    const [{ data: units }, { data: levels }] = await Promise.all([
      supabase.from('unidades').select('id, pai_id, ativo').eq('igreja_id', churchId),
      supabase.from('nivel_tipo').select('id, ordem').eq('igreja_id', churchId),
    ]);
    const unitList = units || [];

    // Só células: nível mais baixo da hierarquia (maior "ordem") e sem subunidades ativas
    const maxOrder = Math.max(...(levels || []).map((l: any) => l.ordem), -Infinity);
    const isLeafLevel = (levels || []).some((l: any) => l.id === cell.nivel_tipo_id && l.ordem === maxOrder);
    if (!isLeafLevel || unitList.some((u: any) => u.pai_id === cellId && u.ativo !== false)) {
      return NextResponse.json({ error: 'Somente células podem ser desativadas.' }, { status: 400 });
    }

    // Cobertura: Pastor/Admin (nível >= 6) cobre a igreja inteira; os demais precisam liderar
    // a célula ou alguma unidade acima dela (setor, área, distrito).
    if (!auth.actor.isSystemAdmin && auth.actor.level < 6) {
      const { data: led } = await supabase
        .from('unidade_lideres')
        .select('unidade_id')
        .eq('pessoa_id', auth.actor.memberId)
        .eq('ativo', true);
      const ledIds = new Set((led || []).map((l: any) => l.unidade_id));
      const parentOf = new Map<string, string | null>(unitList.map((u: any) => [u.id, u.pai_id || null]));
      let current: string | null = cellId;
      let covered = false;
      for (let hops = 0; current && hops < 25; hops++) {
        if (ledIds.has(current)) {
          covered = true;
          break;
        }
        current = parentOf.get(current) || null;
      }
      if (!covered) {
        return NextResponse.json(
          { error: 'Você só pode desativar células que estão sob a sua cobertura.' },
          { status: 403 }
        );
      }
    }

    const now = new Date().toISOString();

    // 1. Encerra o vínculo dos líderes da célula
    const { data: leaderRows } = await supabase
      .from('unidade_lideres')
      .select('pessoa_id')
      .eq('unidade_id', cellId);
    const leaderIds = Array.from(new Set((leaderRows || []).map((l: any) => l.pessoa_id).filter(Boolean))) as string[];

    const { error: leadersErr } = await supabase.from('unidade_lideres').delete().eq('unidade_id', cellId);
    if (leadersErr) {
      return NextResponse.json({ error: leadersErr.message }, { status: 500 });
    }

    // 2. Desvincula os membros da célula (o gatilho do banco atualiza a contagem)
    const { data: unlinked, error: membersErr } = await supabase
      .from('membros')
      .update({ unidade_id: null, atualizado_em: now })
      .eq('unidade_id', cellId)
      .select('id');
    if (membersErr) {
      return NextResponse.json({ error: membersErr.message }, { status: 500 });
    }

    // 3. Líderes que não lideram outra unidade voltam a ser Membro (exceto Pastor/Administrador)
    const demoted: { id: string; name: string }[] = [];
    if (leaderIds.length > 0) {
      const [{ data: stillLeading }, { data: leaders }, { data: roles }] = await Promise.all([
        supabase.from('unidade_lideres').select('pessoa_id').in('pessoa_id', leaderIds).eq('ativo', true),
        supabase.from('membros').select('id, nome, funcao').in('id', leaderIds),
        supabase.from('papeis').select('id, nome, slug, nivel_hierarquia').order('nivel_hierarquia', { ascending: true }),
      ]);
      const stillLeadingIds = new Set((stillLeading || []).map((l: any) => l.pessoa_id));
      const memberRole = (roles || []).find(
        (r: any) => r.slug === 'membro' || (r.nome && r.nome.toLowerCase().includes('membro')) || r.nivel_hierarquia === 1
      );
      const memberRoleId = memberRole?.id || DEFAULT_MEMBER_ROLE_ID;
      const memberRoleName = memberRole?.nome || 'Membro';

      const toDemote = (leaders || []).filter((m: any) => {
        const funcao = (m.funcao || '').toLowerCase();
        return !stillLeadingIds.has(m.id) && !funcao.includes('pastor') && !funcao.includes('administrador');
      });
      if (toDemote.length > 0) {
        const { error: demoteErr } = await supabase
          .from('membros')
          .update({ papel_id: memberRoleId, funcao: memberRoleName, atualizado_em: now })
          .in('id', toDemote.map((m: any) => m.id));
        if (demoteErr) {
          return NextResponse.json({ error: demoteErr.message }, { status: 500 });
        }
        toDemote.forEach((m: any) => demoted.push({ id: m.id, name: m.nome }));
      }
    }

    // 4. Desativa a célula
    const { error: deactErr } = await supabase
      .from('unidades')
      .update({ ativo: false, quantidade_membros: 0, atualizado_em: now })
      .eq('id', cellId);
    if (deactErr) {
      return NextResponse.json({ error: deactErr.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        cellId,
        unlinkedMemberIds: (unlinked || []).map((m: any) => m.id),
        demotedLeaders: demoted,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('Erro em POST /api/cells/deactivate:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
