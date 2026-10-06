import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * Lista pública de igrejas (dados de referência, baixa cardinalidade).
 * Cache compartilhado via CDN (Cache-Control: public + s-maxage) para evitar
 * que cada aba/usuário repita a mesma consulta direto no Supabase.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 200);
    const offset = Number(searchParams.get('offset')) || 0;

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const CHURCH_COLUMNS = 'id, nome, slug, cnpj, cidade, estado, url_logo';
    let { data, error } = await supabase
      .from('igrejas')
      .select(CHURCH_COLUMNS)
      .order('nome')
      .range(offset, offset + limit - 1);

    if (error && (error.code === '42P01' || error.message?.includes('does not exist') || error.code === '42703')) {
      const legRes = await supabase
        .from('churches')
        .select(CHURCH_COLUMNS)
        .order('nome')
        .range(offset, offset + limit - 1);
      data = legRes.data;
      error = legRes.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const churches = (data || []).map((c: any) => ({
      id: c.id,
      name: c.nome,
      slug: c.slug,
      cnpj: c.cnpj || undefined,
      city: c.cidade,
      state: c.estado,
      logoUrl: c.url_logo,
    }));

    return NextResponse.json(
      { success: true, churches },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/reference/churches:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
