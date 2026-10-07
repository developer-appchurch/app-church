import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  canManageTadel,
  getTadelSessionMember,
  getTadelWeek,
  loadChurchLevels,
  loadLeaderLinks,
  loadTadelConfig,
  localDateStr,
  mapAttendanceRow,
  resolveParticipatingLevelIds,
  shiftWeek,
} from '@/lib/tadel';
import type { TadelSupervisionLeader, TadelSupervisionResponse } from '@/types';

/**
 * GET /api/tadel/acompanhamento?churchId=...&weekOffset=0
 * Quem esteve presente / ausente no TADEL numa semana (weekOffset 0 = atual, -1 = anterior...).
 * - Pastor / Administrador / tadel:manage: todos os líderes participantes da igreja.
 * - Demais líderes: apenas os líderes participantes das unidades abaixo das suas na hierarquia.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const params = req.nextUrl.searchParams;
    const member = await getTadelSessionMember(req, supabase, params.get('churchId'));
    if (!member) {
      return NextResponse.json({ error: 'Sessão inválida. Faça login novamente.' }, { status: 401 });
    }

    const churchId = member.churchId;
    const weekOffset = Math.min(0, Math.max(-52, parseInt(params.get('weekOffset') || '0', 10) || 0));
    const week = shiftWeek(getTadelWeek(localDateStr()), weekOffset);

    const [config, levels, canManage] = await Promise.all([
      loadTadelConfig(supabase, churchId, true),
      loadChurchLevels(supabase, churchId),
      canManageTadel(supabase, member),
    ]);

    const levelIds = resolveParticipatingLevelIds(levels, config.configuredLevelIds);
    let links = await loadLeaderLinks(supabase, churchId, { levelIds });

    if (!canManage) {
      const ownLinks = member.id ? await loadLeaderLinks(supabase, churchId, { memberId: member.id }) : [];
      const { data: units } = await supabase
        .from('unidades')
        .select('id, pai_id')
        .eq('igreja_id', churchId)
        .eq('ativo', true);

      const childrenOf = new Map<string, string[]>();
      (units || []).forEach((u: any) => {
        if (!u.pai_id) return;
        childrenOf.set(u.pai_id, [...(childrenOf.get(u.pai_id) || []), u.id]);
      });

      // Descendentes das unidades que o usuário lidera
      const covered = new Set<string>();
      const stack = ownLinks.flatMap((l) => childrenOf.get(l.unitId) || []);
      while (stack.length > 0) {
        const id = stack.pop() as string;
        if (covered.has(id)) continue;
        covered.add(id);
        stack.push(...(childrenOf.get(id) || []));
      }

      if (covered.size === 0) {
        return NextResponse.json({ error: 'Você não tem líderes sob sua cobertura.' }, { status: 403 });
      }
      links = links.filter((l) => covered.has(l.unitId) && l.memberId !== member.id);
    }

    const memberIds = Array.from(new Set(links.map((l) => l.memberId)));
    const levelName = new Map(levels.map((l) => [l.id, l.name]));

    const [{ data: members }, { data: attendanceRows }] = await Promise.all([
      memberIds.length > 0
        ? supabase.from('membros').select('id, nome, url_avatar').in('id', memberIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('tadel_presencas')
        .select('membro_id, horario_id, data_encontro, registrado_em')
        .eq('igreja_id', churchId)
        .eq('ano_semana', week.year)
        .eq('numero_semana', week.week),
    ]);

    const memberById = new Map((members || []).map((m: any) => [m.id, m]));
    const attendanceByMember = new Map((attendanceRows || []).map((r: any) => [r.membro_id, r]));

    const leaders: TadelSupervisionLeader[] = memberIds
      .map((id) => {
        const m: any = memberById.get(id);
        const row = attendanceByMember.get(id);
        return {
          memberId: id,
          name: m?.nome || 'Líder',
          avatarUrl: m?.url_avatar || null,
          units: links
            .filter((l) => l.memberId === id)
            .map((l) => ({ id: l.unitId, name: l.unitName, levelName: levelName.get(l.levelId) || '' })),
          attendance: row ? mapAttendanceRow(row, config.schedules) : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    const countsBySchedule: Record<string, number> = {};
    leaders.forEach((l) => {
      if (!l.attendance) return;
      const key = l.attendance.scheduleId || 'sem_horario';
      countsBySchedule[key] = (countsBySchedule[key] || 0) + 1;
    });

    const response: TadelSupervisionResponse = {
      name: config.name,
      week,
      schedules: config.schedules,
      leaders,
      countsBySchedule,
    };
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('Erro em GET /api/tadel/acompanhamento:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
