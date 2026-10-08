import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { INITIAL_TRACK_STEPS } from '@/data/initialData';
import { requireSession, resolveChurchId, forbiddenChurch, requireAnyPermission } from '@/lib/requireSession';

type DbStepRow = {
  id: number;
  igreja_id: string | null;
  numero_etapa: number;
  titulo: string;
  descricao: string | null;
  obrigatoria: boolean;
};

function mapStep(row: DbStepRow, progressCount = 0) {
  return {
    id: row.id,
    churchId: row.igreja_id,
    stepNumber: row.numero_etapa,
    title: row.titulo,
    description: row.descricao || '',
    required: row.obrigatoria,
    progressCount,
  };
}

/**
 * Garante que a igreja tenha suas próprias linhas em etapas_trilha.
 * Se ela já tem (igreja_id = churchId), retorna essas.
 * Senão, clona das linhas globais (igreja_id IS NULL) se existirem,
 * ou do fallback fixo INITIAL_TRACK_STEPS caso contrário — e grava a
 * cópia com igreja_id = churchId, para que a edição de uma igreja nunca
 * afete outra igreja ou o padrão global da plataforma.
 */
async function ensureChurchOwnSteps(supabase: any, churchId: string): Promise<DbStepRow[]> {
  const { data: ownRows, error: ownErr } = await supabase
    .from('etapas_trilha')
    .select('id, igreja_id, numero_etapa, titulo, descricao, obrigatoria')
    .eq('igreja_id', churchId)
    .order('numero_etapa', { ascending: true });

  if (ownErr) throw new Error(ownErr.message);
  if (ownRows && ownRows.length > 0) return ownRows;

  // Sem linhas próprias ainda: busca o padrão global (igreja_id IS NULL)
  const { data: globalRows, error: globalErr } = await supabase
    .from('etapas_trilha')
    .select('id, igreja_id, numero_etapa, titulo, descricao, obrigatoria')
    .is('igreja_id', null)
    .order('numero_etapa', { ascending: true });

  if (globalErr) throw new Error(globalErr.message);

  const source =
    globalRows && globalRows.length > 0
      ? globalRows.map((r: DbStepRow) => ({
          numero_etapa: r.numero_etapa,
          titulo: r.titulo,
          descricao: r.descricao,
          obrigatoria: r.obrigatoria,
        }))
      : INITIAL_TRACK_STEPS.map((s) => ({
          numero_etapa: s.stepNumber,
          titulo: s.title,
          descricao: s.description,
          obrigatoria: s.required,
        }));

  const toInsert = source.map((s: any) => ({ ...s, igreja_id: churchId }));

  const { data: inserted, error: insertErr } = await supabase
    .from('etapas_trilha')
    .insert(toInsert)
    .select('id, igreja_id, numero_etapa, titulo, descricao, obrigatoria');

  if (insertErr) throw new Error(insertErr.message);

  return (inserted || []).sort((a: DbStepRow, b: DbStepRow) => a.numero_etapa - b.numero_etapa);
}

async function getProgressCounts(supabase: any, stepIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (stepIds.length === 0) return counts;

  const { data } = await supabase
    .from('membro_etapas_trilha')
    .select('etapa_id')
    .in('etapa_id', stepIds);

  (data || []).forEach((row: any) => {
    counts.set(row.etapa_id, (counts.get(row.etapa_id) || 0) + 1);
  });
  return counts;
}

/**
 * GET /api/track-steps?churchId=...
 * Lista as etapas efetivas da igreja (próprias > globais > fallback fixo),
 * cada uma com progressCount (quantos membros já têm registro de progresso
 * naquela etapa), usado pela tela para avisar antes de excluir.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');
    if (churchId && !resolveChurchId(auth.actor, churchId)) return forbiddenChurch();
    if (!churchId) {
      return NextResponse.json({ error: 'Parâmetro churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data: ownRows, error: ownErr } = await supabase
      .from('etapas_trilha')
      .select('id, igreja_id, numero_etapa, titulo, descricao, obrigatoria')
      .eq('igreja_id', churchId)
      .order('numero_etapa', { ascending: true });

    if (ownErr) {
      return NextResponse.json({ error: ownErr.message }, { status: 500 });
    }

    let rows: DbStepRow[] = ownRows || [];
    let isCustomized = rows.length > 0;

    if (!isCustomized) {
      const { data: globalRows, error: globalErr } = await supabase
        .from('etapas_trilha')
        .select('id, igreja_id, numero_etapa, titulo, descricao, obrigatoria')
        .is('igreja_id', null)
        .order('numero_etapa', { ascending: true });

      if (globalErr) {
        return NextResponse.json({ error: globalErr.message }, { status: 500 });
      }
      rows = globalRows || [];
    }

    if (rows.length === 0) {
      // Fallback fixo: nem a igreja nem a plataforma têm linhas no banco ainda.
      // Não existem ids reais, então progressCount é sempre 0 aqui.
      const steps = INITIAL_TRACK_STEPS.map((s) => ({
        id: s.id,
        churchId: null,
        stepNumber: s.stepNumber,
        title: s.title,
        description: s.description,
        required: s.required,
        progressCount: 0,
      }));
      return NextResponse.json({ success: true, steps, isCustomized: false });
    }

    const progressCounts = await getProgressCounts(supabase, rows.map((r) => r.id));
    const steps = rows.map((r) => mapStep(r, progressCounts.get(r.id) || 0));

    return NextResponse.json({ success: true, steps, isCustomized });
  } catch (err: any) {
    console.error('Erro na rota /api/track-steps GET:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao listar etapas do trilho.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/track-steps
 * Cria uma nova etapa ao final do trilho da igreja.
 * Body: { churchId, title, description, required }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const permErr = await requireAnyPermission(auth.actor, ['track:manage', 'church:admin']);
    if (permErr) return permErr;
    const body = await req.json();
    const { churchId, title, description, required } = body || {};
    if (churchId && !resolveChurchId(auth.actor, churchId)) return forbiddenChurch();

    const cleanTitle = (title || '').trim();
    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }
    if (!cleanTitle) {
      return NextResponse.json({ error: 'Informe um título para a etapa.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const ownRows = await ensureChurchOwnSteps(supabase, churchId);
    const nextNumber = ownRows.length > 0 ? Math.max(...ownRows.map((r) => r.numero_etapa)) + 1 : 1;

    const { data: inserted, error: insertErr } = await supabase
      .from('etapas_trilha')
      .insert({
        igreja_id: churchId,
        numero_etapa: nextNumber,
        titulo: cleanTitle,
        descricao: (description || '').trim() || null,
        obrigatoria: required !== false,
      })
      .select('id, igreja_id, numero_etapa, titulo, descricao, obrigatoria')
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, step: mapStep(inserted, 0) });
  } catch (err: any) {
    console.error('Erro na rota /api/track-steps POST:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao criar etapa.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/track-steps
 * Dois usos, diferenciados pelo campo "action":
 *  - action: 'update' — edita título/descrição/obrigatória de uma etapa (por stepNumber)
 *  - action: 'reorder' — troca a posição de uma etapa com a vizinha (direction: 'up' | 'down')
 * Sempre garante antes que a igreja já tenha linhas próprias (clona se precisar).
 * Body: { churchId, stepNumber, action, title?, description?, required?, direction? }
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const permErr = await requireAnyPermission(auth.actor, ['track:manage', 'church:admin']);
    if (permErr) return permErr;
    const body = await req.json();
    const { churchId, stepNumber, action } = body || {};
    if (churchId && !resolveChurchId(auth.actor, churchId)) return forbiddenChurch();

    if (!churchId || typeof stepNumber !== 'number') {
      return NextResponse.json({ error: 'churchId e stepNumber são obrigatórios.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const ownRows = await ensureChurchOwnSteps(supabase, churchId);
    const target = ownRows.find((r) => r.numero_etapa === stepNumber);
    if (!target) {
      return NextResponse.json({ error: 'Etapa não encontrada.' }, { status: 404 });
    }

    if (action === 'reorder') {
      const { direction } = body;
      const neighborNumber = direction === 'up' ? stepNumber - 1 : stepNumber + 1;
      const neighbor = ownRows.find((r) => r.numero_etapa === neighborNumber);
      if (!neighbor) {
        return NextResponse.json({ error: 'Não há etapa vizinha nessa direção.' }, { status: 400 });
      }

      const { error: err1 } = await supabase
        .from('etapas_trilha')
        .update({ numero_etapa: neighborNumber })
        .eq('id', target.id);
      if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });

      const { error: err2 } = await supabase
        .from('etapas_trilha')
        .update({ numero_etapa: stepNumber })
        .eq('id', neighbor.id);
      if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });

      return NextResponse.json({ success: true });
    }

    // action === 'update' (padrão)
    const { title, description, required } = body;
    const updates: Record<string, any> = {};
    if (typeof title === 'string') {
      const cleanTitle = title.trim();
      if (!cleanTitle) {
        return NextResponse.json({ error: 'Informe um título para a etapa.' }, { status: 400 });
      }
      updates.titulo = cleanTitle;
    }
    if (typeof description === 'string') {
      updates.descricao = description.trim() || null;
    }
    if (typeof required === 'boolean') {
      updates.obrigatoria = required;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhuma alteração informada.' }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('etapas_trilha')
      .update(updates)
      .eq('id', target.id)
      .select('id, igreja_id, numero_etapa, titulo, descricao, obrigatoria')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, step: mapStep(updated, 0) });
  } catch (err: any) {
    console.error('Erro na rota /api/track-steps PATCH:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao atualizar etapa.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/track-steps
 * Exclui uma etapa. Se houver membros com progresso registrado nela, exige
 * confirmDataLoss: true explícito (a tela mostra um aviso com a contagem
 * antes de deixar o usuário confirmar) — a exclusão em cascata apagaria o
 * histórico desses membros (ON DELETE CASCADE em membro_etapas_trilha).
 * Body: { churchId, stepNumber, confirmDataLoss? }
 */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const permErr = await requireAnyPermission(auth.actor, ['track:manage', 'church:admin']);
    if (permErr) return permErr;
    const body = await req.json();
    const { churchId, stepNumber, confirmDataLoss } = body || {};
    if (churchId && !resolveChurchId(auth.actor, churchId)) return forbiddenChurch();

    if (!churchId || typeof stepNumber !== 'number') {
      return NextResponse.json({ error: 'churchId e stepNumber são obrigatórios.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const ownRows = await ensureChurchOwnSteps(supabase, churchId);
    const target = ownRows.find((r) => r.numero_etapa === stepNumber);
    if (!target) {
      return NextResponse.json({ error: 'Etapa não encontrada.' }, { status: 404 });
    }

    const progressCounts = await getProgressCounts(supabase, [target.id]);
    const progressCount = progressCounts.get(target.id) || 0;

    if (progressCount > 0 && !confirmDataLoss) {
      return NextResponse.json(
        {
          error: 'Esta etapa tem progresso registrado.',
          requiresConfirmation: true,
          progressCount,
        },
        { status: 409 }
      );
    }

    const { error: deleteErr } = await supabase.from('etapas_trilha').delete().eq('id', target.id);
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    // Renumera as etapas restantes para não deixar buracos na sequência
    const remaining = ownRows.filter((r) => r.id !== target.id).sort((a, b) => a.numero_etapa - b.numero_etapa);
    for (let i = 0; i < remaining.length; i++) {
      const correctNumber = i + 1;
      if (remaining[i].numero_etapa !== correctNumber) {
        await supabase.from('etapas_trilha').update({ numero_etapa: correctNumber }).eq('id', remaining[i].id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Erro na rota /api/track-steps DELETE:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao excluir etapa.' },
      { status: 500 }
    );
  }
}
