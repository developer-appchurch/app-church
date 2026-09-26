import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

/**
 * Endpoint administrativo para provisionar o schema de notificações no Supabase.
 * Executa as instruções DDL caso a função rpc('exec_sql') esteja disponível,
 * ou retorna o SQL para execução no painel do Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient() || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const queries = [
      `CREATE TABLE IF NOT EXISTS public.dispositivos_push (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        membro_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        plataforma TEXT,
        ativo BOOLEAN NOT NULL DEFAULT true,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
      );`,

      `CREATE INDEX IF NOT EXISTS idx_dispositivos_push_membro 
       ON public.dispositivos_push(membro_id) WHERE ativo = true;`,

      `CREATE INDEX IF NOT EXISTS idx_dispositivos_push_endpoint 
       ON public.dispositivos_push(endpoint);`,

      `CREATE TABLE IF NOT EXISTS public.notificacoes_relatorios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
        unidade_id UUID NOT NULL,
        ano_iso INT NOT NULL,
        numero_semana INT NOT NULL,
        data_inicio_semana DATE NOT NULL,
        data_fim_semana DATE NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'relatorio_pendente',
        canal TEXT NOT NULL DEFAULT 'push',
        titulo TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        enviada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        lida_em TIMESTAMPTZ,
        sucesso BOOLEAN NOT NULL DEFAULT true,
        erro TEXT,
        CONSTRAINT unq_notificacao_pendencia_semana UNIQUE (usuario_id, unidade_id, ano_iso, numero_semana)
      );`,

      `CREATE INDEX IF NOT EXISTS idx_notificacoes_relatorios_lookup 
       ON public.notificacoes_relatorios(usuario_id, unidade_id, ano_iso, numero_semana);`,

      `CREATE INDEX IF NOT EXISTS idx_notificacoes_relatorios_enviada 
       ON public.notificacoes_relatorios(enviada_em DESC);`,
    ];

    const results: any[] = [];
    for (const sql of queries) {
      try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        results.push({ sql: sql.slice(0, 40) + '...', data, error: error?.message || null });
      } catch (err: any) {
        results.push({ sql: sql.slice(0, 40) + '...', error: err?.message || 'RPC não disponível' });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Schema de notificações processado.',
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
