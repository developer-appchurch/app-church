import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getPreviousWeekRange } from '@/lib/dateUtils';
import { sendPushNotification } from '@/lib/pushService';

export interface PendingReportItem {
  cellId: string;
  cellName: string;
  churchId: string;
  leaderId: string;
  leaderName: string;
  leaderLogin?: string;
  devicesCount: number;
}

export interface CheckPendingReportsResult {
  success: boolean;
  timestamp: string;
  reminderStage: string;
  week: {
    startDate: string;
    endDate: string;
    isoYear: number;
    isoWeek: number;
    label: string;
  };
  totalActiveCells: number;
  cellsWithReport: number;
  cellsPending: number;
  notificationsSent: number;
  notificationsSkippedDuplicate: number;
  devicesNotified: number;
  devicesFailedOrExpired: number;
  pendingList: PendingReportItem[];
  errors: string[];
}

// Cache em memória para garantir idempotência mesmo antes da migration de notificacoes_relatorios
const inMemoryNotifiedCache = new Set<string>();

/**
 * Valida a autorização de execução do Cron
 */
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Se CRON_SECRET não estiver configurado no ambiente, permite a execução
    return true;
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const querySecret = req.nextUrl.searchParams.get('secret');

  return token === cronSecret || querySecret === cronSecret;
}

/**
 * Endpoint de verificação e envio automático de lembretes de relatórios pendentes.
 * Executa tanto em GET (para testes rápidos de browser/webhook) quanto em POST.
 */
export async function GET(req: NextRequest) {
  return handleCheckPendingReports(req);
}

export async function POST(req: NextRequest) {
  return handleCheckPendingReports(req);
}

async function handleCheckPendingReports(req: NextRequest): Promise<NextResponse> {
  const startTime = new Date();

  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: 'Não autorizado. Forneça o token correto em Authorization: Bearer <CRON_SECRET>.' },
      { status: 401 }
    );
  }

  const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Banco de dados Supabase não configurado.' },
      { status: 500 }
    );
  }

  // 1. Identificar o intervalo da semana anterior (Domingo a Sábado)
  // Permite passar ?refDate=YYYY-MM-DD para simulação/testes
  const customRefDateStr = req.nextUrl.searchParams.get('refDate');
  const refDate = customRefDateStr ? new Date(customRefDateStr) : new Date();
  const week = getPreviousWeekRange(refDate);

  // Estágio do lembrete: '1' = segunda-feira (1º aviso), '2' = quarta-feira (2º aviso/cobrança).
  // Cada estágio é independente: se o relatório continuar pendente, o líder recebe os dois
  // avisos na mesma semana (a chave de idempotência abaixo inclui o estágio).
  const reminderStageParam = req.nextUrl.searchParams.get('stage');
  const reminderStage = reminderStageParam === '2' ? '2' : '1';

  const errors: string[] = [];
  let totalActiveCells = 0;
  let cellsWithReportCount = 0;
  let notificationsSent = 0;
  let notificationsSkippedDuplicate = 0;
  let devicesNotified = 0;
  let devicesFailedOrExpired = 0;
  const pendingList: PendingReportItem[] = [];

  try {
    // 2. Buscar todas as células ativas da congregação
    // Procura primeiro em 'unidades_organizacionais' / 'unidades', depois fallback para 'cells'
    let rawCells: any[] = [];
    let cellsError: any = null;

    // Consulta a tabela principal de unidades no Supabase
    let unitQuery = supabase
      .from('unidades')
      .select('id, igreja_id, nome, pai_id')
      .eq('ativo', true);

    let { data: units, error: uErr } = await unitQuery;
    if ((!units || units.length === 0) || (uErr && uErr.message.includes('column'))) {
      const allUnitsRes = await supabase
        .from('unidades')
        .select('*');
      if (!allUnitsRes.error && allUnitsRes.data) {
        units = allUnitsRes.data;
        uErr = null;
      }
    }

    if (units && units.length > 0) {
      rawCells = units.map((u: any) => ({
        id: u.id,
        nome: u.nome,
        igreja_id: u.igreja_id,
        dia_reuniao: u.dia_semana || u.dia_reuniao || 'Terça-feira',
      }));
    } else {
      // Tenta tabela unidades_organizacionais se unidades não existir
      const unitsOrgRes = await supabase
        .from('unidades_organizacionais')
        .select('id, nome, igreja_id');

      if (!unitsOrgRes.error && unitsOrgRes.data && unitsOrgRes.data.length > 0) {
        rawCells = unitsOrgRes.data.map((u: any) => ({
          id: u.id,
          nome: u.nome,
          igreja_id: u.igreja_id,
          dia_reuniao: 'Terça-feira',
        }));
      } else {
        cellsError = uErr || unitsOrgRes.error;
      }
    }

    if (cellsError && rawCells.length === 0) {
      return NextResponse.json(
        { error: `Erro ao buscar células no banco: ${cellsError.message}` },
        { status: 500 }
      );
    }

    totalActiveCells = rawCells.length;
    if (totalActiveCells === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nenhuma célula ativa encontrada para verificação.',
        week,
        totalActiveCells: 0,
        cellsWithReport: 0,
        cellsPending: 0,
        notificationsSent: 0,
        notificationsSkippedDuplicate: 0,
        devicesNotified: 0,
        devicesFailedOrExpired: 0,
        pendingList: [],
        errors: [],
      });
    }

    const cellIds = rawCells.map((c) => c.id).filter(Boolean);

    // 3. Buscar relatórios lançados referentes à semana anterior em 'relatorios_semanais'
    // Critério:
    // data_relatorio entre startDate e endDate
    // OU ano_iso = week.isoYear E numero_semana = week.isoWeek
    let submittedCellIds = new Set<string>();

    const { data: reportsByDate } = await supabase
      .from('relatorios_semanais')
      .select('unidade_id, data_relatorio, ano_iso, numero_semana')
      .gte('data_relatorio', week.startDate)
      .lte('data_relatorio', week.endDate)
      .in('unidade_id', cellIds);

    (reportsByDate || []).forEach((r: any) => {
      if (r.unidade_id) submittedCellIds.add(r.unidade_id);
    });

    const { data: reportsByIso } = await supabase
      .from('relatorios_semanais')
      .select('unidade_id')
      .eq('ano_iso', week.isoYear)
      .eq('numero_semana', week.isoWeek)
      .in('unidade_id', cellIds);

    (reportsByIso || []).forEach((r: any) => {
      if (r.unidade_id) submittedCellIds.add(r.unidade_id);
    });

    cellsWithReportCount = submittedCellIds.size;

    // 4. Identificar células pendentes (ativas que NÃO lançaram relatório)
    const pendingCells = rawCells.filter((c) => !submittedCellIds.has(c.id));

    if (pendingCells.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Excelente! Todas as células ativas já lançaram seus relatórios da semana anterior.',
        week,
        totalActiveCells,
        cellsWithReport: cellsWithReportCount,
        cellsPending: 0,
        notificationsSent: 0,
        notificationsSkippedDuplicate: 0,
        devicesNotified: 0,
        devicesFailedOrExpired: 0,
        pendingList: [],
        errors: [],
      });
    }

    // 5. Identificar os líderes responsáveis de cada célula pendente
    // Busca em 'unidade_lideres' e 'membros'
    const pendingCellIds = pendingCells.map((c) => c.id);

    // Mapeamento: unidade_id -> lista de líderes (id, nome, login)
    const cellLeadersMap = new Map<
      string,
      Array<{ id: string; nome: string; login?: string }>
    >();

    // 5a. Consulta 'unidade_lideres'
    const { data: leadersData } = await supabase
      .from('unidade_lideres')
      .select('unidade_id, pessoa_id, papel')
      .in('unidade_id', pendingCellIds);

    const leaderPessoaIds = (leadersData || []).map((l: any) => l.pessoa_id).filter(Boolean);
    const memberDetailsMap = new Map<string, { id: string; nome: string; login?: string }>();

    if (leaderPessoaIds.length > 0) {
      const { data: memberRows } = await supabase
        .from('membros')
        .select('id, nome, login')
        .in('id', leaderPessoaIds);

      (memberRows || []).forEach((m: any) => {
        memberDetailsMap.set(m.id, { id: m.id, nome: m.nome || 'Líder', login: m.login });
      });
    }

    (leadersData || []).forEach((item: any) => {
      const member = memberDetailsMap.get(item.pessoa_id);
      if (item.unidade_id && member) {
        const list = cellLeadersMap.get(item.unidade_id) || [];
        if (!list.some((l) => l.id === member.id)) {
          list.push(member);
          cellLeadersMap.set(item.unidade_id, list);
        }
      }
    });

    // 5b. Fallback: busca em 'membros' com papel de líder ou função associada à célula
    const cellsWithoutLeader = pendingCells.filter(
      (c) => !cellLeadersMap.has(c.id) || cellLeadersMap.get(c.id)!.length === 0
    );

    if (cellsWithoutLeader.length > 0) {
      const neededCellIds = cellsWithoutLeader.map((c) => c.id);
      const { data: memberLeaders } = await supabase
        .from('membros')
        .select('id, nome, login, unidade_id, funcao')
        .in('unidade_id', neededCellIds);

      (memberLeaders || []).forEach((m: any) => {
        const isLeader =
          m.funcao?.toLowerCase().includes('líder') ||
          m.funcao?.toLowerCase().includes('lider');
        if (m.unidade_id) {
          const list = cellLeadersMap.get(m.unidade_id) || [];
          // Se for líder explícito ou for o primeiro membro cadastrado na célula
          if (isLeader || list.length === 0) {
            list.push({ id: m.id, nome: m.nome, login: m.login });
            cellLeadersMap.set(m.unidade_id, list);
          }
        }
      });
    }

    // 6. Verificar idempotência na tabela 'notificacoes_relatorios' e cache em memória
    // Se a tabela existir, busca quais líderes já foram notificados para esta mesma semana e célula
    const alreadyNotifiedKeys = new Set<string>(inMemoryNotifiedCache);
    try {
      const { data: existingNotifications, error: notifErr } = await supabase
        .from('notificacoes_relatorios')
        .select('usuario_id, unidade_id, ano_iso, numero_semana, tipo')
        .eq('ano_iso', week.isoYear)
        .eq('numero_semana', week.isoWeek);

      if (!notifErr && existingNotifications) {
        existingNotifications.forEach((n: any) => {
          // O "tipo" guarda o estágio do lembrete (1º aviso de segunda vs 2º aviso/cobrança
          // de quarta), então cada estágio controla sua própria idempotência: se o relatório
          // continuar pendente, o líder pode receber os dois avisos na mesma semana.
          alreadyNotifiedKeys.add(`${n.usuario_id}_${n.unidade_id}_${n.ano_iso}_${n.numero_semana}_${n.tipo}`);
        });
      }
    } catch (e: any) {
      console.warn('[Cron] Tabela notificacoes_relatorios ainda não criada ou inacessível:', e.message);
    }

    // 7. Buscar todos os dispositivos push ativos dos líderes das células pendentes
    const allLeaderIds: string[] = [];
    pendingCells.forEach((cell) => {
      const leaders = cellLeadersMap.get(cell.id) || [];
      leaders.forEach((l) => {
        if (!allLeaderIds.includes(l.id)) {
          allLeaderIds.push(l.id);
        }
      });
    });

    const devicesByLeader = new Map<string, any[]>();
    if (allLeaderIds.length > 0) {
      try {
        const { data: devices } = await supabase
          .from('dispositivos_push')
          .select('id, membro_id, endpoint, p256dh, auth, plataforma')
          .in('membro_id', allLeaderIds)
          .eq('ativo', true);

        (devices || []).forEach((d: any) => {
          const list = devicesByLeader.get(d.membro_id) || [];
          list.push(d);
          devicesByLeader.set(d.membro_id, list);
        });
      } catch (e: any) {
        console.warn('[Cron] Tabela dispositivos_push ainda não criada ou vazia:', e.message);
      }
    }

    // 8. Processar o envio das notificações para cada líder de cada célula pendente
    for (const cell of pendingCells) {
      const leaders = cellLeadersMap.get(cell.id) || [];

      if (leaders.length === 0) {
        errors.push(`A célula "${cell.nome}" (ID: ${cell.id}) está ativa mas não possui líder atribuído.`);
        pendingList.push({
          cellId: cell.id,
          cellName: cell.nome || 'Sem nome',
          churchId: cell.igreja_id,
          leaderId: '',
          leaderName: 'Sem líder responsável',
          devicesCount: 0,
        });
        continue;
      }

      for (const leader of leaders) {
        const notificationType = reminderStage === '2' ? 'relatorio_pendente_cobranca' : 'relatorio_pendente';
        const idempotencyKey = `${leader.id}_${cell.id}_${week.isoYear}_${week.isoWeek}_${notificationType}`;

        // Checa se já recebeu este MESMO estágio de notificação para esta pendência
        // (o 1º aviso de segunda e o 2º de quarta são independentes entre si)
        if (alreadyNotifiedKeys.has(idempotencyKey)) {
          notificationsSkippedDuplicate++;
          continue;
        }

        const leaderDevices = devicesByLeader.get(leader.id) || [];
        pendingList.push({
          cellId: cell.id,
          cellName: cell.nome,
          churchId: cell.igreja_id,
          leaderId: leader.id,
          leaderName: leader.nome,
          leaderLogin: leader.login,
          devicesCount: leaderDevices.length,
        });

        // Monta a mensagem exata conforme os requisitos da especificação.
        // No 2º aviso (quarta), o tom é de cobrança, já que o líder já tinha sido avisado na segunda.
        const cellNameLabel = cell.nome ? `da célula ${cell.nome}` : 'da sua célula';
        const notificationTitle = reminderStage === '2' ? '⚠️ Relatório ainda pendente' : '🔔 Relatório pendente';
        const notificationBody =
          reminderStage === '2'
            ? `O relatório ${cellNameLabel} referente à semana passada ainda não foi lançado. Por favor, lance o quanto antes!`
            : `O relatório ${cellNameLabel} referente à semana passada ainda não foi lançado. Clique para lançar agora!`;

        // Deep link direto para a tela de relatórios com abertura imediata do formulário
        const deepLinkUrl = `/?screen=reports&cellId=${encodeURIComponent(cell.id)}&openModal=true&targetWeek=${week.startDate}`;

        let pushDelivered = false;
        let pushError = '';

        // Dispara para todos os dispositivos registrados do líder (celular, tablet, desktop)
        for (const device of leaderDevices) {
          const pushResult = await sendPushNotification(
            {
              endpoint: device.endpoint,
              keys: {
                p256dh: device.p256dh,
                auth: device.auth,
              },
            },
            {
              title: notificationTitle,
              body: notificationBody,
              icon: '/android-chrome-192x192.png',
              badge: '/android-chrome-192x192.png',
              tag: `pending-report-${cell.id}-${reminderStage}`,
              data: {
                url: deepLinkUrl,
                cellId: cell.id,
                cellName: cell.nome,
                type: notificationType,
                targetWeek: week.startDate,
              },
            }
          );

          if (pushResult.success) {
            devicesNotified++;
            pushDelivered = true;
          } else {
            devicesFailedOrExpired++;
            if (pushResult.expired) {
              // Dispositivo expirou ou desinstalou o app: desativa no banco de dados
              await supabase
                .from('dispositivos_push')
                .update({ ativo: false, atualizado_em: new Date().toISOString() })
                .eq('id', device.id);
            }
            pushError = pushResult.error || 'Falha no envio push';
          }
        }

        // Grava no histórico de notificações para garantir idempotência absoluta
        try {
          await supabase.from('notificacoes_relatorios').insert([
            {
              usuario_id: leader.id,
              unidade_id: cell.id,
              ano_iso: week.isoYear,
              numero_semana: week.isoWeek,
              data_inicio_semana: week.startDate,
              data_fim_semana: week.endDate,
              tipo: notificationType,
              canal: 'push',
              titulo: notificationTitle,
              mensagem: notificationBody,
              enviada_em: new Date().toISOString(),
              sucesso: pushDelivered || leaderDevices.length === 0,
              erro: pushError || (leaderDevices.length === 0 ? 'Líder não possui dispositivos cadastrados' : null),
            },
          ]);
          alreadyNotifiedKeys.add(idempotencyKey);
          inMemoryNotifiedCache.add(idempotencyKey);
        } catch (dbErr: any) {
          console.warn('[Cron] Aviso ao registrar em notificacoes_relatorios:', dbErr.message);
          alreadyNotifiedKeys.add(idempotencyKey);
          inMemoryNotifiedCache.add(idempotencyKey);
        }

        notificationsSent++;
      }
    }

    const durationMs = Date.now() - startTime.getTime();
    console.log(
      `[Cron] Verificação concluída (estágio ${reminderStage}) em ${durationMs}ms: ${pendingCells.length} células pendentes, ${notificationsSent} lembretes gerados.`
    );

    const result: CheckPendingReportsResult = {
      success: true,
      timestamp: new Date().toISOString(),
      reminderStage,
      week,
      totalActiveCells,
      cellsWithReport: cellsWithReportCount,
      cellsPending: pendingCells.length,
      notificationsSent,
      notificationsSkippedDuplicate,
      devicesNotified,
      devicesFailedOrExpired,
      pendingList,
      errors,
    };

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[Cron] Erro fatal durante a verificação de relatórios pendentes:', err);
    return NextResponse.json(
      {
        error: 'Erro durante a verificação de relatórios pendentes',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
