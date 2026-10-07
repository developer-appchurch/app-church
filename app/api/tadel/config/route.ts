import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  canManageTadel,
  getTadelSessionMember,
  loadChurchLevels,
  loadTadelConfig,
  mapScheduleRow,
  resolveParticipatingLevelIds,
  type TadelSessionMember,
} from '@/lib/tadel';
import type { TadelConfigResponse } from '@/types';

/**
 * Configuração do TADEL da igreja (aba "TADEL" em Configurações da Igreja).
 * GET    -> nome, níveis participantes e horários
 * PUT    -> { name?, participatingLevelIds? (null = padrão) }
 * POST   -> cria horário { dayOfWeek, startTime, minutesBefore?, minutesAfter?, location? }
 * PATCH  -> atualiza horário { id, ...campos, active? }
 * DELETE -> ?id=... remove horário (presenças antigas são mantidas)
 */

type Authorized = { supabase: SupabaseClient; member: TadelSessionMember } | NextResponse;

async function authorize(req: NextRequest, churchIdHint: string | null): Promise<Authorized> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
  }
  const member = await getTadelSessionMember(req, supabase, churchIdHint);
  if (!member) {
    return NextResponse.json({ error: 'Sessão inválida. Faça login novamente.' }, { status: 401 });
  }
  if (!(await canManageTadel(supabase, member))) {
    return NextResponse.json({ error: 'Você não tem permissão para configurar o TADEL.' }, { status: 403 });
  }
  return { supabase, member };
}

function parseScheduleFields(body: any, partial: boolean): Record<string, any> | string {
  const out: Record<string, any> = {};

  if (body.dayOfWeek !== undefined || !partial) {
    const day = Number(body.dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) return 'Dia da semana inválido.';
    out.dia_semana = day;
  }
  if (body.startTime !== undefined || !partial) {
    const time = String(body.startTime || '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Horário inválido (use HH:mm).';
    out.hora_inicio = time;
  }
  for (const [key, column] of [
    ['minutesBefore', 'minutos_antes'],
    ['minutesAfter', 'minutos_depois'],
  ] as const) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isInteger(value) || value < 0 || value > 720) return 'Janela de check-in inválida (0 a 720 minutos).';
    out[column] = value;
  }
  if (body.location !== undefined) out.local = String(body.location || '').trim() || null;
  if (partial && typeof body.active === 'boolean') out.ativo = body.active;

  return out;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req, req.nextUrl.searchParams.get('churchId'));
    if (auth instanceof NextResponse) return auth;
    const { supabase, member } = auth;

    const [config, levels] = await Promise.all([
      loadTadelConfig(supabase, member.churchId, true),
      loadChurchLevels(supabase, member.churchId),
    ]);

    const response: TadelConfigResponse = {
      name: config.name,
      participatingLevelIds: resolveParticipatingLevelIds(levels, config.configuredLevelIds),
      usingDefaultLevels: config.configuredLevelIds === null,
      levels,
      schedules: config.schedules,
    };
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    console.error('Erro em GET /api/tadel/config:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) || {};
    const auth = await authorize(req, body.churchId || null);
    if (auth instanceof NextResponse) return auth;
    const { supabase, member } = auth;

    const updates: Record<string, any> = {
      igreja_id: member.churchId,
      atualizado_em: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name || name.length > 40) {
        return NextResponse.json({ error: 'Informe um nome de até 40 caracteres.' }, { status: 400 });
      }
      updates.nome = name;
    }

    if (body.participatingLevelIds !== undefined) {
      if (body.participatingLevelIds === null) {
        updates.niveis_participantes = null;
      } else {
        const levels = await loadChurchLevels(supabase, member.churchId);
        const valid = new Set(levels.map((l) => l.id));
        const ids = Array.isArray(body.participatingLevelIds)
          ? body.participatingLevelIds.filter((id: any) => typeof id === 'string' && valid.has(id))
          : [];
        if (ids.length === 0) {
          return NextResponse.json({ error: 'Selecione pelo menos um nível.' }, { status: 400 });
        }
        updates.niveis_participantes = ids;
      }
    }

    const { error } = await supabase.from('tadel_configuracoes').upsert(updates, { onConflict: 'igreja_id' });
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Erro em PUT /api/tadel/config:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) || {};
    const auth = await authorize(req, body.churchId || null);
    if (auth instanceof NextResponse) return auth;
    const { supabase, member } = auth;

    const fields = parseScheduleFields(body, false);
    if (typeof fields === 'string') {
      return NextResponse.json({ error: fields }, { status: 400 });
    }

    // Garante a linha de configuração (marca o início da contagem de frequência)
    await supabase
      .from('tadel_configuracoes')
      .upsert({ igreja_id: member.churchId }, { onConflict: 'igreja_id', ignoreDuplicates: true });

    const { data, error } = await supabase
      .from('tadel_horarios')
      .insert({ ...fields, igreja_id: member.churchId })
      .select('id, dia_semana, hora_inicio, minutos_antes, minutos_depois, local, ativo')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, schedule: mapScheduleRow(data) });
  } catch (err: any) {
    console.error('Erro em POST /api/tadel/config:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) || {};
    const auth = await authorize(req, body.churchId || null);
    if (auth instanceof NextResponse) return auth;
    const { supabase, member } = auth;

    if (!body.id) {
      return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 });
    }
    const fields = parseScheduleFields(body, true);
    if (typeof fields === 'string') {
      return NextResponse.json({ error: fields }, { status: 400 });
    }
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nenhuma alteração informada.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tadel_horarios')
      .update(fields)
      .eq('id', body.id)
      .eq('igreja_id', member.churchId)
      .select('id, dia_semana, hora_inicio, minutos_antes, minutos_depois, local, ativo')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, schedule: mapScheduleRow(data) });
  } catch (err: any) {
    console.error('Erro em PATCH /api/tadel/config:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const auth = await authorize(req, params.get('churchId'));
    if (auth instanceof NextResponse) return auth;
    const { supabase, member } = auth;

    const id = params.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('tadel_horarios')
      .delete()
      .eq('id', id)
      .eq('igreja_id', member.churchId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Erro em DELETE /api/tadel/config:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
