import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * Endpoint administrativo para provisionar as colunas de células na tabela 'unidades',
 * migrar dados existentes da tabela 'celulas' e sincronizar o contador de membros.
 * POST /api/setup-unidades-schema
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const queries = [
      // 1. Adiciona as colunas na tabela unidades
      `ALTER TABLE public.unidades 
        ADD COLUMN IF NOT EXISTS dia_semana TEXT,
        ADD COLUMN IF NOT EXISTS dia_reuniao TEXT,
        ADD COLUMN IF NOT EXISTS horario TEXT,
        ADD COLUMN IF NOT EXISTS horario_reuniao TEXT,
        ADD COLUMN IF NOT EXISTS bairro TEXT,
        ADD COLUMN IF NOT EXISTS endereco TEXT,
        ADD COLUMN IF NOT EXISTS cep TEXT,
        ADD COLUMN IF NOT EXISTS cidade TEXT,
        ADD COLUMN IF NOT EXISTS estado TEXT,
        ADD COLUMN IF NOT EXISTS latitude NUMERIC,
        ADD COLUMN IF NOT EXISTS longitude NUMERIC,
        ADD COLUMN IF NOT EXISTS foto_url TEXT,
        ADD COLUMN IF NOT EXISTS quantidade_membros INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT now(),
        ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now();`,

      // 2. Migra dados da tabela celulas para unidades se celulas existir
      `DO $$
      BEGIN
        IF EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'celulas'
        ) THEN
          UPDATE public.unidades u
          SET 
            dia_semana = COALESCE(u.dia_semana, c.dia_semana, c.dia_reuniao),
            dia_reuniao = COALESCE(u.dia_reuniao, c.dia_reuniao, c.dia_semana),
            horario = COALESCE(u.horario, c.horario, c.horario_reuniao),
            horario_reuniao = COALESCE(u.horario_reuniao, c.horario_reuniao, c.horario),
            bairro = COALESCE(u.bairro, c.bairro),
            endereco = COALESCE(u.endereco, c.endereco),
            foto_url = COALESCE(u.foto_url, c.foto_url),
            latitude = COALESCE(u.latitude, c.latitude),
            longitude = COALESCE(u.longitude, c.longitude),
            atualizado_em = now()
          FROM public.celulas c
          WHERE c.unidade_id = u.id;
        END IF;
      END $$;`,

      // 3. Atualiza contagem real de membros
      `UPDATE public.unidades u
      SET quantidade_membros = COALESCE(
        (
          SELECT COUNT(*) 
          FROM public.membros m 
          WHERE m.unidade_id = u.id 
          AND (m.ativo IS NULL OR m.ativo = true)
        ),
        0
      );`,

      // 4. Cria Trigger e Função de Sincronização Automática
      `CREATE OR REPLACE FUNCTION public.sync_unidade_quantidade_membros()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
          IF OLD.unidade_id IS NOT NULL THEN
            UPDATE public.unidades
            SET 
              quantidade_membros = (
                SELECT COUNT(*) 
                FROM public.membros 
                WHERE unidade_id = OLD.unidade_id 
                AND (ativo IS NULL OR ativo = true)
              ),
              atualizado_em = now()
            WHERE id = OLD.unidade_id;
          END IF;
        END IF;

        IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
          IF NEW.unidade_id IS NOT NULL THEN
            UPDATE public.unidades
            SET 
              quantidade_membros = (
                SELECT COUNT(*) 
                FROM public.membros 
                WHERE unidade_id = NEW.unidade_id 
                AND (ativo IS NULL OR ativo = true)
              ),
              atualizado_em = now()
            WHERE id = NEW.unidade_id;
          END IF;
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;`,

      `DROP TRIGGER IF EXISTS trg_sync_unidade_membros ON public.membros;`,
      `CREATE TRIGGER trg_sync_unidade_membros
      AFTER INSERT OR UPDATE OR DELETE ON public.membros
      FOR EACH ROW EXECUTE FUNCTION public.sync_unidade_quantidade_membros();`,

      // 5. Índices de performance
      `CREATE INDEX IF NOT EXISTS idx_unidades_igreja_ativo ON public.unidades(igreja_id, ativo);`,
      `CREATE INDEX IF NOT EXISTS idx_unidades_pai_id ON public.unidades(pai_id);`,
      `CREATE INDEX IF NOT EXISTS idx_unidades_dia_semana ON public.unidades(dia_semana);`,
      `CREATE INDEX IF NOT EXISTS idx_membros_unidade_id ON public.membros(unidade_id);`,
    ];

    const results: any[] = [];
    for (const sql of queries) {
      try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        results.push({ sql: sql.slice(0, 50) + '...', data, error: error?.message || null });
      } catch (err: any) {
        results.push({ sql: sql.slice(0, 50) + '...', error: err?.message || 'RPC não disponível' });
      }
    }

    // Também executa sincronização direta via JavaScript como garantia
    try {
      const { data: units } = await supabase.from('unidades').select('id');
      if (units && units.length > 0) {
        const { data: members } = await supabase.from('membros').select('unidade_id').not('unidade_id', 'is', null);
        const countMap = new Map<string, number>();
        (members || []).forEach((m: any) => {
          if (m.unidade_id) {
            countMap.set(m.unidade_id, (countMap.get(m.unidade_id) || 0) + 1);
          }
        });

        for (const u of units) {
          const currentCount = countMap.get(u.id) || 0;
          await supabase.from('unidades').update({ quantidade_membros: currentCount }).eq('id', u.id);
        }
      }
    } catch (syncErr: any) {
      console.warn('Sincronização direta via JS:', syncErr?.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Migração de consolidação em unidades executada com sucesso.',
      results,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/setup-unidades-schema:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao processar schema.' }, { status: 500 });
  }
}
