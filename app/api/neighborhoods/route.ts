import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

function normalizeKey(value: string): string {
  return (value || '').trim().toLowerCase();
}

/**
 * GET /api/neighborhoods?churchId=...
 * Lista o catálogo de bairros da igreja, com a contagem de membros + células
 * que hoje usam aquele nome (comparação case-insensitive / trim), para a tela
 * de "Configurações da Igreja" saber quantos registros seriam afetados ao
 * editar ou desativar um bairro.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');

    if (!churchId) {
      return NextResponse.json({ error: 'Parâmetro churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data: neighborhoods, error: nbError } = await supabase
      .from('bairros')
      .select('id, igreja_id, nome, ativo, criado_em')
      .eq('igreja_id', churchId)
      .order('nome', { ascending: true });

    if (nbError) {
      return NextResponse.json({ error: nbError.message }, { status: 500 });
    }

    // Conta uso atual (membros + células) por nome normalizado, para exibir
    // "N cadastros usando este bairro" sem precisar de FK.
    const usageCount = new Map<string, number>();

    const { data: memberRows } = await supabase
      .from('membros')
      .select('bairro')
      .eq('igreja_id', churchId)
      .not('bairro', 'is', null);

    (memberRows || []).forEach((row: any) => {
      const key = normalizeKey(row.bairro);
      if (!key) return;
      usageCount.set(key, (usageCount.get(key) || 0) + 1);
    });

    const { data: cellRows } = await supabase
      .from('celulas')
      .select('bairro, unidade:unidades!inner(igreja_id)')
      .eq('unidade.igreja_id', churchId)
      .not('bairro', 'is', null);

    (cellRows || []).forEach((row: any) => {
      const key = normalizeKey(row.bairro);
      if (!key) return;
      usageCount.set(key, (usageCount.get(key) || 0) + 1);
    });

    const result = (neighborhoods || []).map((n: any) => ({
      id: n.id,
      churchId: n.igreja_id,
      name: n.nome,
      active: n.ativo,
      usageCount: usageCount.get(normalizeKey(n.nome)) || 0,
      createdAt: n.criado_em,
    }));

    return NextResponse.json({ success: true, neighborhoods: result });
  } catch (err: any) {
    console.error('Erro na rota /api/neighborhoods GET:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao listar bairros.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/neighborhoods
 * Cria um novo bairro no catálogo da igreja.
 * Body: { churchId: string, name: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { churchId, name } = body || {};

    const cleanName = (name || '').trim();
    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }
    if (!cleanName) {
      return NextResponse.json({ error: 'Informe um nome de bairro válido.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('bairros')
      .insert({ igreja_id: churchId, nome: cleanName })
      .select('id, igreja_id, nome, ativo, criado_em')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Já existe um bairro chamado "${cleanName}" cadastrado nesta igreja.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      neighborhood: {
        id: data.id,
        churchId: data.igreja_id,
        name: data.nome,
        active: data.ativo,
        usageCount: 0,
        createdAt: data.criado_em,
      },
    });
  } catch (err: any) {
    console.error('Erro na rota /api/neighborhoods POST:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao criar bairro.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/neighborhoods
 * Renomeia e/ou ativa/desativa (soft delete) um bairro existente.
 * Body: { id: string, name?: string, active?: boolean }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, active } = body || {};

    if (!id) {
      return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (typeof name === 'string') {
      const cleanName = name.trim();
      if (!cleanName) {
        return NextResponse.json({ error: 'Informe um nome de bairro válido.' }, { status: 400 });
      }
      updates.nome = cleanName;
    }
    if (typeof active === 'boolean') {
      updates.ativo = active;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhuma alteração informada.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('bairros')
      .update(updates)
      .eq('id', id)
      .select('id, igreja_id, nome, ativo, criado_em')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Já existe um bairro com esse nome cadastrado nesta igreja.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      neighborhood: {
        id: data.id,
        churchId: data.igreja_id,
        name: data.nome,
        active: data.ativo,
        createdAt: data.criado_em,
      },
    });
  } catch (err: any) {
    console.error('Erro na rota /api/neighborhoods PATCH:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao atualizar bairro.' },
      { status: 500 }
    );
  }
}
