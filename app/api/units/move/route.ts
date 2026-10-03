import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * PATCH /api/units/move
 * Move uma célula (ou qualquer unidade folha) para outro setor da mesma
 * igreja. Mecânica real: UPDATE unidades SET pai_id = newParentId WHERE
 * id = unitId AND igreja_id = churchId. O FK composto
 * fk_unidades_pai_igreja já garante no banco que o novo pai pertence à
 * mesma igreja; aqui validamos também que o novo pai está no mesmo nível
 * hierárquico do pai atual (não permite "pular" níveis por engano).
 *
 * Não altera membros.unidade_id nem unidade_lideres — os membros e
 * líderes vinculados continuam os mesmos, só a posição da célula na
 * árvore organizacional muda.
 *
 * Body: { unitId, churchId, newParentId } — move uma única célula (modo original)
 * Body: { unitIds: string[], churchId, newParentId } — move várias células de uma
 *   vez (usado em "Mover para outro Setor" em lote, ex: multiplicação de setor)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { unitId, unitIds, churchId, newParentId } = body || {};

    // ===== Modo EM LOTE: várias células de uma vez (unitIds) =====
    if (Array.isArray(unitIds) && unitIds.length > 0) {
      if (!churchId || !newParentId) {
        return NextResponse.json(
          { error: 'churchId e newParentId são obrigatórios.' },
          { status: 400 }
        );
      }

      const supabaseBulk = getSupabaseServerClient();
      if (!supabaseBulk) {
        return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
      }

      const { data: newParentBulk, error: parentErrBulk } = await supabaseBulk
        .from('unidades')
        .select('id, nome, nivel_tipo_id, igreja_id')
        .eq('id', newParentId)
        .eq('igreja_id', churchId)
        .maybeSingle();

      if (parentErrBulk || !newParentBulk) {
        return NextResponse.json({ error: 'Setor de destino não encontrado nesta igreja.' }, { status: 404 });
      }

      const movedIds: string[] = [];
      const skipped: { id: string; reason: string }[] = [];

      for (const id of unitIds) {
        const { data: unitBulk, error: unitErrBulk } = await supabaseBulk
          .from('unidades')
          .select('id, pai_id, igreja_id')
          .eq('id', id)
          .eq('igreja_id', churchId)
          .maybeSingle();

        if (unitErrBulk || !unitBulk) {
          skipped.push({ id, reason: 'Célula não encontrada.' });
          continue;
        }

        if (unitBulk.pai_id === newParentId) {
          skipped.push({ id, reason: 'Já está neste setor.' });
          continue;
        }

        if (unitBulk.pai_id) {
          const { data: currentParentBulk } = await supabaseBulk
            .from('unidades')
            .select('nivel_tipo_id')
            .eq('id', unitBulk.pai_id)
            .maybeSingle();

          if (currentParentBulk && currentParentBulk.nivel_tipo_id !== newParentBulk.nivel_tipo_id) {
            skipped.push({ id, reason: 'Setor de destino em nível hierárquico diferente.' });
            continue;
          }
        }

        movedIds.push(id);
      }

      if (movedIds.length === 0) {
        return NextResponse.json(
          { error: skipped[0]?.reason || 'Nenhuma célula pôde ser movida.', skipped },
          { status: 400 }
        );
      }

      const { error: updateErrBulk } = await supabaseBulk
        .from('unidades')
        .update({ pai_id: newParentId })
        .eq('igreja_id', churchId)
        .in('id', movedIds);

      if (updateErrBulk) {
        return NextResponse.json({ error: updateErrBulk.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        movedIds,
        skipped,
        parentId: newParentId,
        parentName: newParentBulk.nome,
      });
    }

    // ===== Modo ÚNICO: uma célula (unitId) — comportamento original, inalterado =====
    if (!unitId || !churchId || !newParentId) {
      return NextResponse.json(
        { error: 'unitId, churchId e newParentId são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data: unit, error: unitErr } = await supabase
      .from('unidades')
      .select('id, nome, pai_id, nivel_tipo_id, igreja_id')
      .eq('id', unitId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    if (unitErr || !unit) {
      return NextResponse.json({ error: 'Célula/unidade não encontrada.' }, { status: 404 });
    }

    const { data: newParent, error: parentErr } = await supabase
      .from('unidades')
      .select('id, nome, nivel_tipo_id, igreja_id')
      .eq('id', newParentId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    if (parentErr || !newParent) {
      return NextResponse.json({ error: 'Setor de destino não encontrado nesta igreja.' }, { status: 404 });
    }

    if (unit.pai_id === newParentId) {
      return NextResponse.json({ error: 'Esta célula já está neste setor.' }, { status: 400 });
    }

    // Garante que o destino é do mesmo nível hierárquico do pai atual (ex: Setor -> Setor),
    // evitando pendurar a célula direto em uma Área/Distrito por engano.
    if (unit.pai_id) {
      const { data: currentParent } = await supabase
        .from('unidades')
        .select('nivel_tipo_id')
        .eq('id', unit.pai_id)
        .maybeSingle();

      if (currentParent && currentParent.nivel_tipo_id !== newParent.nivel_tipo_id) {
        return NextResponse.json(
          { error: 'O setor de destino precisa estar no mesmo nível hierárquico do setor atual.' },
          { status: 400 }
        );
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from('unidades')
      .update({ pai_id: newParentId })
      .eq('id', unitId)
      .eq('igreja_id', churchId)
      .select('id, pai_id')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      unit: {
        id: updated.id,
        parentId: updated.pai_id,
        parentName: newParent.nome,
      },
    });
  } catch (err: any) {
    console.error('Erro na rota /api/units/move PATCH:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao mover célula.' },
      { status: 500 }
    );
  }
}
