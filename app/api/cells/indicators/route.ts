import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireSession, requireLevel, unitInChurch } from '@/lib/requireSession';

/** Reuniões consideradas na média de presença do card. */
const LAST_MEETINGS_FOR_AVERAGE = 5;
/** Janela da curva de crescimento. */
const GROWTH_WINDOW_MONTHS = 2;

/**
 * GET /api/cells/indicators?cellId=...
 * Indicadores de uma célula para o modal da tela Minha Célula (Líder de Célula ou acima):
 * - líderes em treinamento da célula;
 * - média de membros presentes nas últimas 5 reuniões;
 * - curva de crescimento: total presente (membros + convidados) por reunião nos últimos 2 meses;
 * - conclusão de cada etapa do Trilho de Liderança entre os membros da célula.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const deniedLevel = requireLevel(auth.actor, 2);
    if (deniedLevel) return deniedLevel;

    const cellId = req.nextUrl.searchParams.get('cellId');
    if (!cellId) {
      return NextResponse.json({ error: 'cellId é obrigatório.' }, { status: 400 });
    }
    const unitErr = await unitInChurch(auth.actor, cellId);
    if (unitErr) return unitErr;

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
    }

    const { data: unit } = await supabase.from('unidades').select('igreja_id').eq('id', cellId).maybeSingle();
    const churchId = unit?.igreja_id;

    const since = new Date();
    since.setMonth(since.getMonth() - GROWTH_WINDOW_MONTHS);
    const sinceStr = since.toISOString().slice(0, 10);

    const [trainingRes, lastMeetingsRes, growthRes, trackRes] = await Promise.all([
      supabase
        .from('membros')
        .select('id', { count: 'exact', head: true })
        .eq('unidade_id', cellId)
        .ilike('funcao', 'l_der em treinamento'),
      supabase
        .from('relatorios_semanais')
        .select('qtd_membros')
        .eq('unidade_id', cellId)
        .eq('houve_reuniao', true)
        .order('data_relatorio', { ascending: false })
        .limit(LAST_MEETINGS_FOR_AVERAGE),
      supabase
        .from('relatorios_semanais')
        .select('data_relatorio, qtd_membros, qtd_convidados')
        .eq('unidade_id', cellId)
        .eq('houve_reuniao', true)
        .gte('data_relatorio', sinceStr)
        .order('data_relatorio', { ascending: true }),
      supabase.rpc('indicators_trilho_resumo', { p_igreja_id: churchId, p_unidade_id: cellId }),
    ]);

    const lastMeetings = lastMeetingsRes.data || [];
    const averageMembers =
      lastMeetings.length > 0
        ? Math.round((lastMeetings.reduce((sum: number, r: any) => sum + (r.qtd_membros || 0), 0) / lastMeetings.length) * 10) / 10
        : null;

    const growth = (growthRes.data || []).map((r: any) => {
      const members = r.qtd_membros || 0;
      const guests = r.qtd_convidados || 0;
      return { date: r.data_relatorio as string, members, guests, total: members + guests };
    });

    const track = trackRes.data || {};

    return NextResponse.json(
      {
        leadersInTraining: trainingRes.count ?? 0,
        averageMembers,
        meetingsInAverage: lastMeetings.length,
        growth,
        track: {
          totalMembers: track.totalMembers ?? 0,
          steps: (track.steps ?? []).map((s: any) => ({
            id: s.id,
            title: s.title,
            completionCount: s.completionCount,
            completionPercent: s.completionPercent,
          })),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('Erro em GET /api/cells/indicators:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
