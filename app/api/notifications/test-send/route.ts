import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { sendPushNotification } from '@/lib/pushService';

/**
 * POST /api/notifications/test-send
 * Dispara uma notificação push de teste para os líderes de uma célula específica.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cellName = body.cellName || 'Adoneiros';

    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    }

    // 1. Busca a unidade/célula
    const { data: units, error: uErr } = await supabase
      .from('unidades')
      .select('id, nome, igreja_id')
      .ilike('nome', `%${cellName}%`)
      .limit(1);

    if (uErr || !units || units.length === 0) {
      return NextResponse.json({ error: `Célula "${cellName}" não encontrada.` }, { status: 404 });
    }

    const cell = units[0];

    // 2. Busca líderes
    const { data: leadersData } = await supabase
      .from('unidade_lideres')
      .select('pessoa_id, papel')
      .eq('unidade_id', cell.id);

    const leaderIds = (leadersData || []).map((l: any) => l.pessoa_id).filter(Boolean);

    if (leaderIds.length === 0) {
      return NextResponse.json({ error: `Nenhum líder encontrado para a célula "${cell.nome}".` }, { status: 404 });
    }

    // 3. Busca dispositivos dos líderes
    const { data: devices } = await supabase
      .from('dispositivos_push')
      .select('*')
      .in('membro_id', leaderIds)
      .eq('ativo', true);

    if (!devices || devices.length === 0) {
      return NextResponse.json({
        warning: `Líderes encontrados, mas nenhum dispositivo push ativo registrado ainda no banco.`,
        leaderIds,
      });
    }

    const title = '🔔 Relatório pendente';
    const message = `O relatório da célula ${cell.nome} referente à semana passada ainda não foi lançado. Clique para lançar agora!`;
    const deepLinkUrl = `/?screen=reports&cellId=${encodeURIComponent(cell.id)}&openModal=true`;

    const sendResults: any[] = [];
    for (const dev of devices) {
      const res = await sendPushNotification(
        {
          endpoint: dev.endpoint,
          keys: {
            p256dh: dev.p256dh,
            auth: dev.auth,
          },
        },
        {
          title,
          body: message,
          icon: '/android-chrome-192x192.png',
          badge: '/android-chrome-192x192.png',
          tag: `pending-report-${cell.id}`,
          data: {
            url: deepLinkUrl,
            cellId: cell.id,
            cellName: cell.nome,
            type: 'relatorio_pendente',
          },
        }
      );
      sendResults.push({ deviceId: dev.id, plataforma: dev.plataforma, result: res });
    }

    return NextResponse.json({
      success: true,
      cell: cell.nome,
      cellId: cell.id,
      devicesNotified: sendResults.filter((r) => r.result.success).length,
      sendResults,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
