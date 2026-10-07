import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildOccurrence,
  canManageTadel,
  findOpenOccurrence,
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
import type { TadelHistoryItem, TadelStatusResponse } from '@/types';

const HISTORY_WEEKS = 8;

/**
 * GET /api/tadel?churchId=...
 * Situação do TADEL para o usuário logado: horários da semana, se já registrou
 * presença, histórico das últimas semanas e frequência.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const member = await getTadelSessionMember(req, supabase, req.nextUrl.searchParams.get('churchId'));
    if (!member) {
      return NextResponse.json({ error: 'Sessão inválida. Faça login novamente.' }, { status: 401 });
    }

    const churchId = member.churchId;
    const nowMs = Date.now();

    const currentWeek = getTadelWeek(localDateStr(nowMs));
    const weeks = Array.from({ length: HISTORY_WEEKS }, (_, i) => shiftWeek(currentWeek, -i));
    const oldest = weeks[weeks.length - 1];

    // Todas as consultas dependem só da sessão: uma única rodada em paralelo ao banco
    const [config, levels, canManage, ownLinks, unitsRes, attendanceRes] = await Promise.all([
      loadTadelConfig(supabase, churchId, true),
      loadChurchLevels(supabase, churchId),
      canManageTadel(supabase, member),
      member.id ? loadLeaderLinks(supabase, churchId, { memberId: member.id }) : Promise.resolve([]),
      supabase.from('unidades').select('pai_id').eq('igreja_id', churchId).eq('ativo', true).not('pai_id', 'is', null),
      member.id
        ? supabase
            .from('tadel_presencas')
            .select('horario_id, ano_semana, numero_semana, data_encontro, registrado_em')
            .eq('membro_id', member.id)
            .gte('data_encontro', oldest.startDate)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const activeSchedules = config.schedules.filter((s) => s.active);
    const levelIds = resolveParticipatingLevelIds(levels, config.configuredLevelIds);
    const levelName = new Map(levels.map((l) => [l.id, l.name]));

    const eligibleUnits = ownLinks
      .filter((l) => levelIds.includes(l.levelId))
      .map((l) => ({ id: l.unitId, name: l.unitName, levelName: levelName.get(l.levelId) || '' }));

    const ownUnitIds = new Set(ownLinks.map((l) => l.unitId));
    const leadsUnitWithChildren = (unitsRes.data || []).some((u: any) => ownUnitIds.has(u.pai_id));

    const occurrences = activeSchedules
      .map((s) => buildOccurrence(s, currentWeek, nowMs))
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt));

    const attendanceByWeek = new Map<string, any>();
    (attendanceRes.data || []).forEach((r: any) => attendanceByWeek.set(`${r.ano_semana}-${r.numero_semana}`, r));

    const history: TadelHistoryItem[] = weeks.map((week) => {
      const row = attendanceByWeek.get(`${week.year}-${week.week}`);
      return { week, attendance: row ? mapAttendanceRow(row, config.schedules) : null };
    });

    // Frequência: semanas encerradas desde que o TADEL foi configurado (+ a atual, se já presente)
    const configuredSince = config.createdAt ? localDateStr(Date.parse(config.createdAt)) : null;
    const countable = history.filter((h, i) => {
      if (configuredSince && h.week.endDate < configuredSince) return false;
      return i > 0 || h.attendance !== null;
    });
    const present = countable.filter((h) => h.attendance).length;

    const response: TadelStatusResponse = {
      configured: activeSchedules.length > 0,
      name: config.name,
      eligible: eligibleUnits.length > 0,
      eligibleUnits,
      currentWeek,
      occurrences,
      currentAttendance: history[0].attendance,
      history,
      frequency: {
        present,
        total: countable.length,
        percentage: countable.length > 0 ? Math.round((present / countable.length) * 100) : 0,
      },
      canSupervise: canManage || leadsUnitWithChildren,
      canManage,
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('Erro em GET /api/tadel:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

/**
 * POST /api/tadel
 * Registra a presença do líder logado no TADEL cuja janela de check-in está aberta.
 * Basta uma presença por semana (qualquer horário).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const member = await getTadelSessionMember(req, supabase);
    if (!member?.id) {
      return NextResponse.json({ error: 'Sessão inválida. Faça login novamente.' }, { status: 401 });
    }

    const churchId = member.churchId;
    const [config, levels, ownLinks] = await Promise.all([
      loadTadelConfig(supabase, churchId),
      loadChurchLevels(supabase, churchId),
      loadLeaderLinks(supabase, churchId, { memberId: member.id }),
    ]);

    const levelIds = resolveParticipatingLevelIds(levels, config.configuredLevelIds);
    if (!ownLinks.some((l) => levelIds.includes(l.levelId))) {
      return NextResponse.json(
        { error: `Somente os líderes participantes podem registrar presença no ${config.name}.` },
        { status: 403 }
      );
    }

    const occurrence = findOpenOccurrence(config.schedules);
    if (!occurrence) {
      return NextResponse.json(
        { error: `O registro de presença só fica disponível durante o horário do ${config.name}.` },
        { status: 400 }
      );
    }

    const week = getTadelWeek(occurrence.date);
    const { data, error } = await supabase
      .from('tadel_presencas')
      .insert({
        igreja_id: churchId,
        membro_id: member.id,
        horario_id: occurrence.scheduleId,
        ano_semana: week.year,
        numero_semana: week.week,
        data_encontro: occurrence.date,
        metodo: 'app',
      })
      .select('horario_id, data_encontro, registrado_em')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Sua presença no ${config.name} desta semana já foi registrada.` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, attendance: mapAttendanceRow(data, config.schedules) });
  } catch (err: any) {
    console.error('Erro em POST /api/tadel:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
