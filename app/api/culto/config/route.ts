import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeCulto,
  CULTO_CONFIG_PERMISSION_CODES,
  friendlyDbError,
  isValidUuid,
  mapSchedule,
} from '@/lib/culto';

/**
 * Campus e horários de culto da igreja (Configurações da Igreja › Cultos).
 * GET    -> { campuses: [{ id, name, active, schedules: [...] }] }
 * POST   -> { type: 'campus', name } | { type: 'schedule', campusId, name, dayOfWeek, time }
 * PATCH  -> { type: 'campus', id, name?, active? } | { type: 'schedule', id, name?, dayOfWeek?, time?, active? }
 * DELETE -> ?type=campus|schedule&id=...   (só se não houver lançamentos / horários ligados)
 * Exige a permissão 'culto:configurar' (Configurar Cultos), church:admin, Pastor ou Administrador —
 * o Gestor de Culto (culto:gerenciar) só lança contagens e NÃO altera campus nem horários.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

function parseName(value: unknown): string | null {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 80 ? name : null;
}

function parseScheduleFields(body: any, partial: boolean): Record<string, any> | string {
  const out: Record<string, any> = {};
  if (body.name !== undefined || !partial) {
    const name = parseName(body.name);
    if (!name) return 'Informe o nome do culto (até 80 caracteres).';
    out.nome = name;
  }
  if (body.dayOfWeek !== undefined || !partial) {
    const day = Number(body.dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) return 'Dia da semana inválido.';
    out.dia_semana = day;
  }
  if (body.time !== undefined || !partial) {
    const time = String(body.time || '');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Horário inválido (use HH:mm).';
    out.hora = time;
  }
  if (partial && typeof body.active === 'boolean') out.ativo = body.active;
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeCulto(req, req.nextUrl.searchParams.get('churchId'), CULTO_CONFIG_PERMISSION_CODES);
    if (auth instanceof NextResponse) return auth;
    const { supabase, churchId } = auth;

    const [campusRes, schedRes] = await Promise.all([
      supabase.from('campus').select('id, nome, ativo').eq('igreja_id', churchId).order('nome'),
      supabase
        .from('culto_horarios')
        .select('id, campus_id, nome, dia_semana, hora, ativo')
        .eq('igreja_id', churchId)
        .order('dia_semana')
        .order('hora'),
    ]);
    if (campusRes.error) throw campusRes.error;
    if (schedRes.error) throw schedRes.error;

    const schedules = (schedRes.data || []).map(mapSchedule);
    const campuses = (campusRes.data || []).map((c) => ({
      id: c.id as string,
      name: c.nome as string,
      active: Boolean(c.ativo),
      schedules: schedules.filter((s) => s.campusId === c.id),
    }));
    return NextResponse.json({ success: true, campuses }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em GET /api/culto/config:', err);
    const f = friendlyDbError(err);
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await authorizeCulto(
      req,
      typeof body?.churchId === 'string' ? body.churchId : null,
      CULTO_CONFIG_PERMISSION_CODES
    );
    if (auth instanceof NextResponse) return auth;
    const { supabase, churchId } = auth;

    if (body?.type === 'campus') {
      const name = parseName(body.name);
      if (!name) return NextResponse.json({ error: 'Informe o nome do campus (até 80 caracteres).' }, { status: 400 });
      const { data, error } = await supabase
        .from('campus')
        .insert({ igreja_id: churchId, nome: name })
        .select('id')
        .single();
      if (error) {
        const f = friendlyDbError(error);
        return NextResponse.json(
          { error: error.code === '23505' ? 'Já existe um campus com esse nome.' : f.message },
          { status: f.status }
        );
      }
      return NextResponse.json({ success: true, id: data.id }, { headers: NO_STORE });
    }

    if (body?.type === 'schedule') {
      if (!isValidUuid(body.campusId)) return NextResponse.json({ error: 'Campus inválido.' }, { status: 400 });
      const fields = parseScheduleFields(body, false);
      if (typeof fields === 'string') return NextResponse.json({ error: fields }, { status: 400 });

      const { data: campus } = await supabase
        .from('campus')
        .select('id')
        .eq('id', body.campusId)
        .eq('igreja_id', churchId)
        .maybeSingle();
      if (!campus) return NextResponse.json({ error: 'Campus não encontrado nesta igreja.' }, { status: 404 });

      const { data, error } = await supabase
        .from('culto_horarios')
        .insert({ igreja_id: churchId, campus_id: body.campusId, ...fields })
        .select('id')
        .single();
      if (error) {
        const f = friendlyDbError(error);
        return NextResponse.json(
          { error: error.code === '23505' ? 'Este campus já tem um culto nesse dia e horário.' : f.message },
          { status: f.status }
        );
      }
      return NextResponse.json({ success: true, id: data.id }, { headers: NO_STORE });
    }

    return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });
  } catch (err: any) {
    console.error('Erro em POST /api/culto/config:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await authorizeCulto(
      req,
      typeof body?.churchId === 'string' ? body.churchId : null,
      CULTO_CONFIG_PERMISSION_CODES
    );
    if (auth instanceof NextResponse) return auth;
    const { supabase, churchId } = auth;

    if (!isValidUuid(body?.id)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    const now = new Date().toISOString();

    if (body.type === 'campus') {
      const update: Record<string, any> = { atualizado_em: now };
      if (body.name !== undefined) {
        const name = parseName(body.name);
        if (!name) return NextResponse.json({ error: 'Informe o nome do campus (até 80 caracteres).' }, { status: 400 });
        update.nome = name;
      }
      if (typeof body.active === 'boolean') update.ativo = body.active;
      const { data, error } = await supabase
        .from('campus')
        .update(update)
        .eq('id', body.id)
        .eq('igreja_id', churchId)
        .select('id');
      if (error) {
        const f = friendlyDbError(error);
        return NextResponse.json(
          { error: error.code === '23505' ? 'Já existe um campus com esse nome.' : f.message },
          { status: f.status }
        );
      }
      if (!data || data.length === 0) return NextResponse.json({ error: 'Campus não encontrado.' }, { status: 404 });
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    }

    if (body.type === 'schedule') {
      const fields = parseScheduleFields(body, true);
      if (typeof fields === 'string') return NextResponse.json({ error: fields }, { status: 400 });
      const { data, error } = await supabase
        .from('culto_horarios')
        .update({ ...fields, atualizado_em: now })
        .eq('id', body.id)
        .eq('igreja_id', churchId)
        .select('id');
      if (error) {
        const f = friendlyDbError(error);
        return NextResponse.json(
          { error: error.code === '23505' ? 'Este campus já tem um culto nesse dia e horário.' : f.message },
          { status: f.status }
        );
      }
      if (!data || data.length === 0) return NextResponse.json({ error: 'Horário não encontrado.' }, { status: 404 });
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    }

    return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });
  } catch (err: any) {
    console.error('Erro em PATCH /api/culto/config:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const auth = await authorizeCulto(req, sp.get('churchId'), CULTO_CONFIG_PERMISSION_CODES);
    if (auth instanceof NextResponse) return auth;
    const { supabase, churchId } = auth;

    const id = sp.get('id');
    const type = sp.get('type');
    if (!isValidUuid(id)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    if (type !== 'campus' && type !== 'schedule') return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });

    const { data, error } = await supabase
      .from(type === 'campus' ? 'campus' : 'culto_horarios')
      .delete()
      .eq('id', id)
      .eq('igreja_id', churchId)
      .select('id');
    if (error) {
      const f = friendlyDbError(error);
      return NextResponse.json(
        {
          error:
            error.code === '23503'
              ? type === 'campus'
                ? 'Este campus tem horários cadastrados. Desative-o em vez de excluir.'
                : 'Este culto já tem contagens lançadas. Desative-o em vez de excluir, para manter o histórico.'
              : f.message,
        },
        { status: f.status }
      );
    }
    if (!data || data.length === 0) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em DELETE /api/culto/config:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
