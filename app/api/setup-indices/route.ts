import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * Cria os índices otimizados no banco Supabase:
 * 1. membros(igreja_id, nome, id)
 * 2. membros(unidade_id)
 * 3. membros(papel_id)
 * 4. Extensão pg_trgm e índice trigram em membros(nome)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const sqlQueries = [
      `CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
      `CREATE INDEX IF NOT EXISTS idx_membros_igreja_nome_id ON membros(igreja_id, nome, id);`,
      `CREATE INDEX IF NOT EXISTS idx_membros_unidade_id ON membros(unidade_id);`,
      `CREATE INDEX IF NOT EXISTS idx_membros_papel_id ON membros(papel_id);`,
      `CREATE INDEX IF NOT EXISTS idx_membros_nome_trgm ON membros USING gin (nome gin_trgm_ops);`,
      `CREATE INDEX IF NOT EXISTS idx_unidades_igreja_ativo ON unidades(igreja_id, ativo);`,
      `CREATE INDEX IF NOT EXISTS idx_unidades_igreja_pai ON unidades(igreja_id, pai_id);`,
      `CREATE INDEX IF NOT EXISTS idx_unidades_nivel_tipo ON unidades(nivel_tipo_id);`,
      `CREATE INDEX IF NOT EXISTS idx_unidade_lideres_unidade ON unidade_lideres(unidade_id);`,
      `CREATE INDEX IF NOT EXISTS idx_unidade_lideres_pessoa ON unidade_lideres(pessoa_id);`,
      `CREATE INDEX IF NOT EXISTS idx_unidade_cobertura_principal ON unidade_cobertura(unidade_principal_id);`,
      `CREATE INDEX IF NOT EXISTS idx_unidade_cobertura_cobertura ON unidade_cobertura(unidade_cobertura_id);`,
      `CREATE INDEX IF NOT EXISTS idx_celulas_unidade_id ON celulas(unidade_id);`,
      `CREATE INDEX IF NOT EXISTS idx_celulas_dia_semana ON celulas(dia_semana);`,
      `CREATE INDEX IF NOT EXISTS idx_celulas_bairro_trgm ON celulas USING gin (bairro gin_trgm_ops);`,
      `CREATE INDEX IF NOT EXISTS idx_celulas_endereco_trgm ON celulas USING gin (endereco gin_trgm_ops);`,
    ];

    const results: any[] = [];

    for (const sql of sqlQueries) {
      try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        results.push({ sql, data, error: error?.message || null });
      } catch (err: any) {
        results.push({ sql, error: err?.message || 'rpc not available' });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Índices processados.',
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
