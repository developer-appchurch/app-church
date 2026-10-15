import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeCulto,
  friendlyDbError,
  isValidDate,
  isValidUuid,
  mapCount,
  parseCounts,
  parseNote,
  todayInSaoPaulo,
} from '@/lib/culto';

/**
 * Contagens de culto (uma por horário e data).
 * GET    -> ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=  lista (mais recentes primeiro)
 * POST   -> { scheduleId, date, adults, children, volunteers, conversions, reconciliations, guests, note? }
 * PATCH  -> { id, adults?, children?, ... , note? }   (horário e data não mudam: exclua e lance de novo)
 * DELETE -> ?id=...
 * Exige a permissão 'culto:gerenciar' (ou church:admin / Pastor / Administrador).
 * Total = adultos + crianças (calculado pelo banco); voluntários ficam à parte.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const auth = await authorizeCulto(req, sp.get('churchId'));
    if (auth instanceof NextResponse) return auth;
    const { supabase, churchId } = auth;

    const from = sp.get('from');
    const to = sp.get('to');
    if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
      return NextResponse.json({ error: 'Período inválido.' }, { status: 400 });
    }
    const limit = Math.min(Math.max(Number(sp.get('limit')) || 100, 1), 500);

    let query = supabase
      .from('culto_contagens')
      .select(
        'id, horario_id, data_culto, adultos, criancas, voluntarios, conversoes, reconciliacoes, convidados, total, observacao, atualizado_em'
      )
      .eq('igreja_id', churchId)
      .order('data_culto', { ascending: false })
      .limit(limit);
    if (from) query = query.gte('data_culto', from);
    if (to) query = query.lte('data_culto', to);

    const [countsRes, schedRes, campusRes] = await Promise.all([
      query,
      supabase.from('culto_horarios').select('id, campus_id, nome').eq('igreja_id', churchId),
      supabase.from('campus').select('id, nome').eq('igreja_id', churchId),
    ]);
    if (countsRes.error) throw countsRes.error;
    if (schedRes.error) throw schedRes.error;
    if (campusRes.error) throw campusRes.error;

    const scheduleById = new Map(
      (schedRes.data || []).map((s) => [s.id as string, { name: s.nome as string, campusId: s.campus_id as string }])
    );
    const campusName = new Map((campusRes.data || []).map((c) => [c.id as string, c.nome as string]));

    return NextResponse.json(
      { success: true, counts: (countsRes.data || []).map((r) => mapCount(r, scheduleById, campusName)) },
      { headers: NO_STORE }
    );
  } catch (err: any) {
    console.error('Erro em GET /api/culto/contagens:', err);
    const f = friendlyDbError(err);
    return NextResponse.json({ error: f.message }, { status: f.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await authorizeCulto(req, typeof body?.churchId === 'string' ? body.churchId : null);
    if (auth instanceof NextResponse) return auth;
    const { supabase, actor, churchId } = auth;

    if (!isValidUuid(body?.scheduleId)) return NextResponse.json({ error: 'Selecione o culto.' }, { status: 400 });
    if (!isValidDate(body?.date)) return NextResponse.json({ error: 'Data inválida.' }, { status: 400 });
    if (body.date > todayInSaoPaulo()) {
      return NextResponse.json({ error: 'Não é possível lançar a contagem de um culto que ainda não aconteceu.' }, { status: 400 });
    }

    const counts = parseCounts(body, false);
    if (typeof counts === 'string') return NextResponse.json({ error: counts }, { status: 400 });
    const note = parseNote(body.note);
    if (Array.isArray(note) && note.length > 0) return NextResponse.json({ error: note[0] }, { status: 400 });

    const { data: schedule } = await supabase
      .from('culto_horarios')
      .select('id, ativo')
      .eq('id', body.scheduleId)
      .eq('igreja_id', churchId)
      .maybeSingle();
    if (!schedule) return NextResponse.json({ error: 'Culto não encontrado nesta igreja.' }, { status: 404 });
    if (!schedule.ativo) return NextResponse.json({ error: 'Este culto está desativado.' }, { status: 400 });

    const { data, error } = await supabase
      .from('culto_contagens')
      .insert({
        igreja_id: churchId,
        horario_id: body.scheduleId,
        data_culto: body.date,
        ...counts,
        observacao: Array.isArray(note) ? null : note,
        lancado_por: actor.memberId,
        atualizado_por: actor.memberId,
      })
      .select('id')
      .single();
    if (error) {
      const f = friendlyDbError(error);
      return NextResponse.json(
        { error: error.code === '23505' ? 'Este culto já tem contagem lançada nesta data. Edite o lançamento existente.' : f.message },
        { status: f.status }
      );
    }
    return NextResponse.json({ success: true, id: data.id }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em POST /api/culto/contagens:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await authorizeCulto(req, typeof body?.churchId === 'string' ? body.churchId : null);
    if (auth instanceof NextResponse) return auth;
    const { supabase, actor, churchId } = auth;

    if (!isValidUuid(body?.id)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
    const counts = parseCounts(body, true);
    if (typeof counts === 'string') return NextResponse.json({ error: counts }, { status: 400 });

    const update: Record<string, any> = { ...counts, atualizado_por: actor.memberId, atualizado_em: new Date().toISOString() };
    if (body.note !== undefined) {
      const note = parseNote(body.note);
      if (Array.isArray(note)) {
        if (note.length > 0) return NextResponse.json({ error: note[0] }, { status: 400 });
      } else {
        update.observacao = note;
      }
    }

    const { data, error } = await supabase
      .from('culto_contagens')
      .update(update)
      .eq('id', body.id)
      .eq('igreja_id', churchId)
      .select('id');
    if (error) {
      const f = friendlyDbError(error);
      return NextResponse.json({ error: f.message }, { status: f.status });
    }
    if (!data || data.length === 0) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em PATCH /api/culto/contagens:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const auth = await authorizeCulto(req, sp.get('churchId'));
    if (auth instanceof NextResponse) return auth;
    const { supabase, churchId } = auth;

    const id = sp.get('id');
    if (!isValidUuid(id)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });

    const { data, error } = await supabase
      .from('culto_contagens')
      .delete()
      .eq('id', id)
      .eq('igreja_id', churchId)
      .select('id');
    if (error) {
      const f = friendlyDbError(error);
      return NextResponse.json({ error: f.message }, { status: f.status });
    }
    if (!data || data.length === 0) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em DELETE /api/culto/contagens:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
