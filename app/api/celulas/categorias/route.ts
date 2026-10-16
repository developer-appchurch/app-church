import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireSession, resolveChurchId, forbiddenChurch, requireAnyPermission } from '@/lib/requireSession';

/**
 * Categorias de célula da igreja (Crianças, Adolescentes, Jovens, Adultos, Casais...).
 * GET    ?churchId=...            -> { categories: [{ id, name, order, active, usageCount }] }
 * POST   { churchId, name }       -> cria
 * PATCH  { churchId, id, name?, active? } -> renomeia / ativa / desativa
 * DELETE ?churchId=...&id=...     -> exclui (só se nenhuma célula usar; senão, desative)
 * Qualquer usuário logado da igreja pode LER (para preencher o campo nas células);
 * criar, editar e excluir exigem 'church:admin' (Pastor/Administrador já herdam).
 */

const NO_STORE = { 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseName(value: unknown): string | null {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 40 ? name : null;
}

async function context(req: NextRequest, churchIdRaw: unknown, write: boolean) {
  const auth = await requireSession(req);
  if (auth.error) return { error: auth.error } as const;
  const churchId = resolveChurchId(auth.actor, typeof churchIdRaw === 'string' ? churchIdRaw : null);
  if (!churchId) return { error: forbiddenChurch() } as const;
  if (write) {
    const denied = await requireAnyPermission(auth.actor, ['church:admin']);
    if (denied) return { error: denied } as const;
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: 'Servidor de banco de dados não configurado.' }, { status: 500 }) } as const;
  }
  return { supabase, churchId } as const;
}

export async function GET(req: NextRequest) {
  try {
    const ctx = await context(req, req.nextUrl.searchParams.get('churchId'), false);
    if ('error' in ctx) return ctx.error;
    const { supabase, churchId } = ctx;

    const [catRes, useRes] = await Promise.all([
      supabase
        .from('celula_categorias')
        .select('id, nome, ordem, ativo')
        .eq('igreja_id', churchId)
        .order('ordem')
        .order('nome'),
      supabase.from('unidades').select('categoria_id').eq('igreja_id', churchId).not('categoria_id', 'is', null),
    ]);
    if (catRes.error) throw catRes.error;
    if (useRes.error) throw useRes.error;

    const usage = new Map<string, number>();
    (useRes.data || []).forEach((r: any) => usage.set(r.categoria_id, (usage.get(r.categoria_id) || 0) + 1));

    const categories = (catRes.data || []).map((c: any) => ({
      id: c.id as string,
      name: c.nome as string,
      order: c.ordem as number,
      active: Boolean(c.ativo),
      usageCount: usage.get(c.id) || 0,
    }));
    return NextResponse.json({ success: true, categories }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em GET /api/celulas/categorias:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao carregar categorias.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ctx = await context(req, body?.churchId, true);
    if ('error' in ctx) return ctx.error;
    const { supabase, churchId } = ctx;

    const name = parseName(body?.name);
    if (!name) return NextResponse.json({ error: 'Informe o nome da categoria (até 40 caracteres).' }, { status: 400 });

    const { data: last } = await supabase
      .from('celula_categorias')
      .select('ordem')
      .eq('igreja_id', churchId)
      .order('ordem', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from('celula_categorias')
      .insert({ igreja_id: churchId, nome: name, ordem: ((last as any)?.ordem ?? 0) + 10 })
      .select('id')
      .single();
    if (error) {
      return NextResponse.json(
        { error: error.code === '23505' ? 'Já existe uma categoria com esse nome.' : error.message },
        { status: error.code === '23505' ? 409 : 500 }
      );
    }
    return NextResponse.json({ success: true, id: data.id }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em POST /api/celulas/categorias:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao criar categoria.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ctx = await context(req, body?.churchId, true);
    if ('error' in ctx) return ctx.error;
    const { supabase, churchId } = ctx;

    if (typeof body?.id !== 'string' || !UUID.test(body.id)) {
      return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 });
    }
    const update: Record<string, any> = { atualizado_em: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = parseName(body.name);
      if (!name) return NextResponse.json({ error: 'Informe o nome da categoria (até 40 caracteres).' }, { status: 400 });
      update.nome = name;
    }
    if (typeof body.active === 'boolean') update.ativo = body.active;
    if (Object.keys(update).length === 1) {
      return NextResponse.json({ error: 'Nada para alterar.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('celula_categorias')
      .update(update)
      .eq('id', body.id)
      .eq('igreja_id', churchId)
      .select('id')
      .maybeSingle();
    if (error) {
      return NextResponse.json(
        { error: error.code === '23505' ? 'Já existe uma categoria com esse nome.' : error.message },
        { status: error.code === '23505' ? 409 : 500 }
      );
    }
    if (!data) return NextResponse.json({ error: 'Categoria não encontrada.' }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em PATCH /api/celulas/categorias:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao atualizar categoria.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await context(req, req.nextUrl.searchParams.get('churchId'), true);
    if ('error' in ctx) return ctx.error;
    const { supabase, churchId } = ctx;

    const id = req.nextUrl.searchParams.get('id') || '';
    if (!UUID.test(id)) return NextResponse.json({ error: 'Categoria inválida.' }, { status: 400 });

    const { count } = await supabase
      .from('unidades')
      .select('id', { count: 'exact', head: true })
      .eq('igreja_id', churchId)
      .eq('categoria_id', id);
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: `${count} célula(s) usam esta categoria. Desative-a em vez de excluir.` },
        { status: 409 }
      );
    }

    const { error } = await supabase.from('celula_categorias').delete().eq('id', id).eq('igreja_id', churchId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (err: any) {
    console.error('Erro em DELETE /api/celulas/categorias:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao excluir categoria.' }, { status: 500 });
  }
}
