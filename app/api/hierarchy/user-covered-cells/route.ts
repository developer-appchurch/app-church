import { NextRequest, NextResponse } from 'next/server';
import { requireSession, resolveChurchId, forbiddenChurch } from '@/lib/requireSession';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * GET /api/hierarchy/user-covered-cells
 * Retorna as IDs das células sob cobertura direta ou hierárquica do usuário.
 * - Administradores / Pastores: Todas as células da igreja
 * - Líder de Área: Todas as células da sua área
 * - Líder de Setor: Todas as células do seu setor
 * - Líder de Célula / Membro: Apenas a célula vinculada e células onde é líder
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    // Membro só consulta a própria cobertura e a própria igreja; o Administrador do Sistema pode consultar qualquer uma.
    const requestedUserId = searchParams.get('userId');
    if (
      !auth.actor.isSystemAdmin &&
      requestedUserId &&
      requestedUserId !== auth.actor.memberId
    ) {
      return forbiddenChurch();
    }
    const userId = requestedUserId || auth.actor.memberId;
    const churchId = resolveChurchId(auth.actor, searchParams.get('churchId'));
    if (!churchId) return forbiddenChurch();

    if (!userId || !churchId) {
      return NextResponse.json(
        { error: 'userId e churchId são obrigatórios' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({
        isAllCells: true,
        cellIds: [],
      });
    }

    // 1. Busca dados do membro
    const { data: member, error: memErr } = await supabase
      .from('membros')
      .select('id, igreja_id, unidade_id, funcao, login, email')
      .eq('id', userId)
      .maybeSingle();

    if (memErr) {
      console.warn('[user-covered-cells] Erro ao consultar membro:', memErr);
    }

    const userRoleNorm = (member?.funcao || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isSystemAdmin =
      member?.login === 'admin' ||
      userRoleNorm.includes('administrador') ||
      member?.email === 'developer.appchurch@gmail.com';
    const isPastor = userRoleNorm.includes('pastor');

    // Pastores e Administradores possuem cobertura global
    if (isSystemAdmin || isPastor) {
      return NextResponse.json({
        isAllCells: true,
        cellIds: [],
      });
    }

    // 2. Busca todas as unidades da igreja
    const { data: allUnits } = await supabase
      .from('unidades')
      .select('id, nome, pai_id, nivel_tipo_id')
      .eq('igreja_id', churchId);

    const unitsList = allUnits || [];

    // Busca níveis para identificar o nível folha (Célula)
    const { data: levels } = await supabase
      .from('nivel_tipo')
      .select('id, nome, ordem')
      .eq('igreja_id', churchId)
      .order('ordem', { ascending: true });

    const maxOrder = levels && levels.length > 0 ? Math.max(...levels.map((l) => l.ordem)) : 40;
    const leafLevelIds = new Set(
      (levels || [])
        .filter((l) => l.ordem === maxOrder || l.nome.toLowerCase().includes('celula'))
        .map((l) => l.id)
    );

    // Mapeia unidades que são folhas (células)
    const isLeafUnit = (unit: any) => {
      if (!unit) return false;
      if (leafLevelIds.has(unit.nivel_tipo_id)) return true;
      // Se nenhuma outra unidade tiver esta unidade como pai, é uma folha
      const hasChildren = unitsList.some((u) => u.pai_id === unit.id);
      return !hasChildren;
    };

    // 3. Busca unidades onde o usuário é líder em unidade_lideres
    const { data: leaderRecords } = await supabase
      .from('unidade_lideres')
      .select('unidade_id')
      .eq('pessoa_id', userId)
      .eq('ativo', true);

    const directlyLedUnitIds = new Set<string>();
    (leaderRecords || []).forEach((r) => {
      if (r.unidade_id) directlyLedUnitIds.add(r.unidade_id);
    });

    // Adiciona a célula vinculada do membro
    if (member?.unidade_id) {
      directlyLedUnitIds.add(member.unidade_id);
    }

    // 4. Para cada unidade liderada, se for nó intermediário (Setor, Área, Distrito), desce na árvore até encontrar as células
    const coveredCellIds = new Set<string>();

    const collectDescendantCells = (parentUnitId: string) => {
      const children = unitsList.filter((u) => u.pai_id === parentUnitId);
      for (const child of children) {
        if (isLeafUnit(child)) {
          coveredCellIds.add(child.id);
        } else {
          collectDescendantCells(child.id);
        }
      }
    };

    for (const unitId of Array.from(directlyLedUnitIds)) {
      const unit = unitsList.find((u) => u.id === unitId);
      if (!unit) {
        coveredCellIds.add(unitId);
        continue;
      }

      if (isLeafUnit(unit)) {
        coveredCellIds.add(unit.id);
      } else {
        // É um setor, área ou distrito: coleta todas as células descendentes
        collectDescendantCells(unit.id);
      }
    }

    // Fallback: se o usuário tiver unidade_id e nada mais foi encontrado
    if (coveredCellIds.size === 0 && member?.unidade_id) {
      coveredCellIds.add(member.unidade_id);
    }

    return NextResponse.json({
      isAllCells: false,
      cellIds: Array.from(coveredCellIds),
    });
  } catch (err: any) {
    console.error('[user-covered-cells] Erro interno:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao obter células sob cobertura' },
      { status: 500 }
    );
  }
}
