import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { sendPushNotification } from '@/lib/pushService';
import { requireSession, requireLevel } from '@/lib/requireSession';

/**
 * POST /api/notifications/test-send
 * Dispara uma notificação push de teste para os líderes de uma célula específica ou para o próprio usuário/dispositivo.
 */
export async function POST(req: NextRequest) {
  try {
    // Disparo de teste: somente Pastor/Administrador, e sempre limitado à própria igreja.
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const lvlErr = requireLevel(auth.actor, 6);
    if (lvlErr) return lvlErr;
    const actorChurchId = auth.actor.isSystemAdmin ? null : auth.actor.churchId;
    if (!auth.actor.isSystemAdmin && !actorChurchId) {
      return NextResponse.json({ error: 'Acesso negado a esta igreja.' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const cellName = body.cellName;
    const cellId = body.cellId;
    const targetUserId = body.targetUserId;
    const customTitle = body.title;
    const customMessage = body.message;
    const notificationType = body.type || 'relatorio_pendente';

    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    }

    let devices: any[] = [];
    let cellInfo: any = null;
    let deepLinkUrl = '/?screen=feed';

    // 1. Caso seja teste direto para um usuário específico (ex: admin logado)
    if (targetUserId) {
      if (actorChurchId) {
        const { data: tgt } = await supabase.from('membros').select('igreja_id').eq('id', targetUserId).maybeSingle();
        if (!tgt || tgt.igreja_id !== actorChurchId) {
          return NextResponse.json({ error: 'Acesso negado a esta igreja.' }, { status: 403 });
        }
      }
      const { data: userDevices } = await supabase
        .from('dispositivos_push')
        .select('*')
        .eq('membro_id', targetUserId)
        .eq('ativo', true);

      if (userDevices && userDevices.length > 0) {
        devices = userDevices;
      }
    }

    // 2. Caso seja teste por célula (ou se não encontrou dispositivo específico do usuário)
    if (devices.length === 0 && (cellId || cellName)) {
      let unitsQuery = supabase
        .from('unidades')
        .select('id, nome, igreja_id');

      if (actorChurchId) unitsQuery = unitsQuery.eq('igreja_id', actorChurchId);
      if (cellId) {
        unitsQuery = unitsQuery.eq('id', cellId);
      } else if (cellName) {
        unitsQuery = unitsQuery.ilike('nome', `%${cellName}%`);
      }

      const { data: units, error: uErr } = await unitsQuery.limit(1);

      if (!uErr && units && units.length > 0) {
        cellInfo = units[0];
        deepLinkUrl = `/?screen=reports&cellId=${encodeURIComponent(cellInfo.id)}&openModal=true`;

        const { data: leadersData } = await supabase
          .from('unidade_lideres')
          .select('pessoa_id, papel')
          .eq('unidade_id', cellInfo.id);

        const leaderIds = (leadersData || []).map((l: any) => l.pessoa_id).filter(Boolean);

        if (leaderIds.length > 0) {
          const { data: cellDevices } = await supabase
            .from('dispositivos_push')
            .select('*')
            .in('membro_id', leaderIds)
            .eq('ativo', true);

          if (cellDevices && cellDevices.length > 0) {
            devices = cellDevices;
          }
        }
      }
    }

    // 3. Fallback: Se ainda não tiver nenhum dispositivo, busca todos os dispositivos ativos da congregação
    if (devices.length === 0) {
      let churchMemberIds: string[] | null = null;
      if (actorChurchId) {
        const { data: churchMembers } = await supabase
          .from('membros')
          .select('id')
          .eq('igreja_id', actorChurchId)
          .limit(5000);
        churchMemberIds = (churchMembers || []).map((m: any) => m.id);
      }
      let fallbackQuery = supabase.from('dispositivos_push').select('*').eq('ativo', true);
      if (churchMemberIds) fallbackQuery = fallbackQuery.in('membro_id', churchMemberIds);
      const { data: allActiveDevices } = await fallbackQuery
        .order('criado_em', { ascending: false })
        .limit(10);

      devices = allActiveDevices || [];
    }

    if (devices.length === 0) {
      return NextResponse.json({
        warning: 'Nenhum dispositivo push ativo encontrado no banco de dados. Ative as notificações no navegador/PWA primeiro para registrar seu dispositivo.',
        devicesCount: 0,
      });
    }

    const title = customTitle || (cellInfo ? '🔔 Relatório pendente' : '🔔 Teste de Notificação AppChurch');
    const message =
      customMessage ||
      (cellInfo
        ? `O relatório da célula ${cellInfo.nome} referente à semana passada ainda não foi lançado. Clique para lançar agora!`
        : `Notificação push de teste enviada pelo Administrador do Sistema.`);

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
          tag: cellInfo ? `pending-report-${cellInfo.id}` : `test-admin-${Date.now()}`,
          data: {
            url: deepLinkUrl,
            cellId: cellInfo?.id,
            cellName: cellInfo?.nome,
            type: notificationType,
          },
        }
      );
      sendResults.push({ deviceId: dev.id, plataforma: dev.plataforma, result: res });
    }

    return NextResponse.json({
      success: true,
      target: cellInfo ? `Célula ${cellInfo.nome}` : targetUserId ? 'Usuário Logado' : 'Dispositivos Ativos',
      cell: cellInfo?.nome,
      cellId: cellInfo?.id,
      devicesNotified: sendResults.filter((r) => r.result.success).length,
      totalDevices: devices.length,
      sendResults,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
