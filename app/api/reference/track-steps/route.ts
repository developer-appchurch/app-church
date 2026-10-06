import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * Catálogo de etapas do trilho de liderança (etapas_trilha), globais + por igreja.
 * Cache compartilhado via CDN (Cache-Control: public + s-maxage), chave de cache
 * inclui o churchId pois o resultado pode variar por igreja.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId') || undefined;

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    let query = supabase.from('etapas_trilha').select('*');
    if (churchId) {
      query = query.or(`igreja_id.eq.${churchId},igreja_id.is.null`);
    }
    let { data, error } = await query.order('numero_etapa', { ascending: true });

    if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
      let legQuery = supabase.from('etapa_trilhos').select('*');
      if (churchId) {
        legQuery = legQuery.or(`id_igreja.eq.${churchId},id_igreja.is.null`);
      }
      const legRes = await legQuery.order('numero_etapa', { ascending: true });
      data = legRes.data;
      error = legRes.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
    const churchSpecific = churchId ? rows.filter((ts: any) => (ts.igreja_id || ts.id_igreja) === churchId) : [];
    const sourceList = churchSpecific.length > 0 ? churchSpecific : rows;

    const trackSteps = sourceList.map((ts: any) => ({
      id: ts.id,
      id_igreja: ts.igreja_id || ts.id_igreja,
      churchId: ts.igreja_id || ts.id_igreja,
      stepNumber: ts.numero_etapa,
      title: ts.titulo,
      description: ts.descricao || '',
      required: ts.obrigatoria ?? true,
    }));

    return NextResponse.json(
      { success: true, trackSteps },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/reference/track-steps:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
