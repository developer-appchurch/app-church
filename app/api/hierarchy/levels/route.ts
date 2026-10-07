import { NextRequest, NextResponse } from 'next/server';
import { requireSession, resolveChurchId, forbiddenChurch } from '@/lib/requireSession';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { ChurchHierarchicalLevel } from '@/types';
import crypto from 'crypto';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const churchId = resolveChurchId(auth.actor, searchParams.get('churchId'));
    if (searchParams.get('churchId') && !churchId) return forbiddenChurch();

    if (!churchId) {
      return NextResponse.json({ error: 'Parâmetro churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    let { data: levelsData, error } = await supabase
      .from('nivel_tipo')
      .select('id, igreja_id, nome, ordem')
      .eq('igreja_id', churchId)
      .order('ordem', { ascending: true });

    if (error) {
      console.error('Erro ao buscar niveis hierárquicos:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Se a igreja não tiver níveis cadastrados, provisiona automaticamente os 4 níveis padrão
    if (!levelsData || levelsData.length === 0) {
      const defaultLevels = [
        { id: generateUUID(), igreja_id: churchId, nome: 'Distrito', ordem: 10 },
        { id: generateUUID(), igreja_id: churchId, nome: 'Área', ordem: 20 },
        { id: generateUUID(), igreja_id: churchId, nome: 'Setor', ordem: 30 },
        { id: generateUUID(), igreja_id: churchId, nome: 'Célula', ordem: 40 },
      ];

      const { data: inserted, error: insertErr } = await supabase
        .from('nivel_tipo')
        .insert(defaultLevels)
        .select('id, igreja_id, nome, ordem')
        .order('ordem', { ascending: true });

      if (!insertErr && inserted && inserted.length > 0) {
        levelsData = inserted;
      } else {
        levelsData = defaultLevels;
      }
    }

    const total = levelsData.length;
    const formattedLevels: ChurchHierarchicalLevel[] = levelsData.map((lvl: any, index: number) => ({
      id: lvl.id,
      churchId: lvl.igreja_id,
      name: lvl.nome,
      order: lvl.ordem,
      isRoot: index === 0,
      isLeaf: index === total - 1,
    }));

    return NextResponse.json(
      {
        success: true,
        levels: formattedLevels,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/hierarchy/levels:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
