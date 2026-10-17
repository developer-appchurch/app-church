import { NextRequest, NextResponse } from 'next/server';
import { authorizeCulto, friendlyDbError, mapCount, mapSchedule } from '@/lib/culto';

/**
 * GET /api/culto/overview
 *
 * Tudo que a tela "Contagem de Culto" precisa para abrir, em UMA chamada (uma checagem de
 * sessão/permissão e três consultas em paralelo): campus com seus horários e os lançamentos
 * dos últimos 180 dias (mais recentes primeiro, até 400).
 *
 * Exige a permissão 'culto:gerenciar' (ou church:admin / Pastor / Administrador).
 */

const NO_STORE = { 'Cache-Control': 'no-store' };
const WINDOW_DAYS = 180;
const MAX_COUNTS = 400;

function isoDaysAgo(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeCulto(req, req.nextUrl.searchParams.get('churchId'));
    if (auth instanceof NextResponse) return auth;
    const { supabase, churchId } = auth;

    const [campusRes, schedRes, countsRes] = await Promise.all([
      supabase.from('campus').select('id, nome, ativo').eq('igreja_id', churchId).order('nome'),
      supabase
        .from('culto_horarios')
        .select('id, campus_id, nome, dia_semana, hora, ativo')
        .eq('igreja_id', churchId)
        .order('dia_semana')
        .order('hora'),
      supabase
        .from('culto_contagens')
        .select(
          'id, horario_id, data_culto, adultos, criancas, voluntarios, conversoes, reconciliacoes, convidados, carros, motos, total, observacao, atualizado_em'
        )
        .eq('igreja_id', churchId)
        .gte('data_culto', isoDaysAgo(WINDOW_DAYS))
        .order('data_culto', { ascending: false })
        .limit(MAX_COUNTS),
    ]);
    if (campusRes.error) throw campusRes.error;
    if (schedRes.error) throw schedRes.error;
    if (countsRes.error) throw countsRes.error;

    const schedules = (schedRes.data || []).map(mapSchedule);
    const campuses = (campusRes.data || []).map((c) => ({
      id: c.id as string,
      name: c.nome as string,
      active: Boolean(c.ativo),
      schedules: schedules.filter((s) => s.campusId === c.id),
    }));

    const scheduleById = new Map(schedules.map((s) => [s.id, { name: s.name, campusId: s.campusId }]));
    const campusName = new Map(campuses.map((c) => [c.id, c.name]));
    const counts = (countsRes.data || []).map((r) => mapCount(r, scheduleById, campusName));

    return NextResponse.json({ success: true, campuses, counts }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em GET /api/culto/overview:', err);
    const f = friendlyDbError(err);
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
}
