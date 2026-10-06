import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * Tabela de papéis (papeis) — dados de referência globais, raramente alterados.
 * Cache compartilhado via CDN (Cache-Control: public + s-maxage).
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const ROLE_COLUMNS = 'id, nome, slug, descricao, nivel_hierarquia, cor_distintivo';
    let { data, error } = await supabase
      .from('papeis')
      .select(ROLE_COLUMNS)
      .order('nivel_hierarquia', { ascending: true })
      .order('nome', { ascending: true });

    if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
      const legRes = await supabase
        .from('roles')
        .select(ROLE_COLUMNS)
        .order('nivel_hierarquia', { ascending: true })
        .order('nome', { ascending: true });
      data = legRes.data;
      error = legRes.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const roles = (data || []).map((r: any) => ({
      id: r.id,
      name: r.nome,
      slug: r.slug,
      description: r.descricao,
      hierarchyLevel: r.nivel_hierarquia,
      badgeColor: r.cor_distintivo,
    }));

    return NextResponse.json(
      { success: true, roles },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/reference/roles:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
