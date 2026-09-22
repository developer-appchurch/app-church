import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { ChurchHierarchicalLevel } from '@/types';

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

    const { data: levelsData, error } = await supabase
      .from('nivel_tipo')
      .select('id, igreja_id, nome, ordem')
      .eq('igreja_id', churchId)
      .order('ordem', { ascending: true });

    if (error) {
      console.error('Erro ao buscar niveis hierárquicos:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = levelsData?.length || 0;
    const formattedLevels: ChurchHierarchicalLevel[] = (levelsData || []).map((lvl: any, index: number) => ({
      id: lvl.id,
      churchId: lvl.igreja_id,
      name: lvl.nome,
      order: lvl.ordem,
      isRoot: index === 0,
      isLeaf: index === total - 1,
    }));

    return NextResponse.json({
      success: true,
      levels: formattedLevels,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/hierarchy/levels:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
