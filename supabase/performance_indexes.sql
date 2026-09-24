-- ==============================================================================
-- APPCHURCH - OTIMIZAÇÃO DE ALTA PERFORMANCE PARA GRANDES VOLUMES (INDEXES)
-- Execute este script no SQL Editor do Supabase para acelerar buscas e relatórios
-- ==============================================================================

-- 1. ÍNDICES NA TABELA MEMBROS (Membros, Usuários, Frequência e Busca por Nome)
CREATE INDEX IF NOT EXISTS idx_membros_igreja_unidade 
  ON public.membros(igreja_id, unidade_id);

CREATE INDEX IF NOT EXISTS idx_membros_igreja_status 
  ON public.membros(igreja_id, status_frequencia);

CREATE INDEX IF NOT EXISTS idx_membros_login_igreja 
  ON public.membros(login, igreja_id);

CREATE INDEX IF NOT EXISTS idx_membros_busca_nome 
  ON public.membros(igreja_id, nome text_pattern_ops);

-- 2. ÍNDICES NA HIERARQUIA ORGANIZACIONAL (Unidades, Níveis e Células)
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_pai 
  ON public.unidades(igreja_id, pai_id) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_unidades_nivel 
  ON public.unidades(nivel_tipo_id);

CREATE INDEX IF NOT EXISTS idx_unidade_lideres_busca 
  ON public.unidade_lideres(unidade_id, pessoa_id) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_nivel_tipo_ordem 
  ON public.nivel_tipo(igreja_id, ordem ASC);

-- 3. ÍNDICES NO TRILHO DE LIDERANÇA (Alta volumetria de progresso)
CREATE INDEX IF NOT EXISTS idx_membro_etapas_busca 
  ON public.membro_etapas_trilha(membro_id, etapa_id, concluida);

CREATE INDEX IF NOT EXISTS idx_membro_etapas_unidade 
  ON public.membro_etapas_trilha(unidade_id, etapa_id);

CREATE INDEX IF NOT EXISTS idx_trilhas_lideranca_membro 
  ON public.trilhas_lideranca(membro_id);

CREATE INDEX IF NOT EXISTS idx_etapas_trilha_igreja_ordem 
  ON public.etapas_trilha(igreja_id, numero_etapa ASC);

-- 4. ÍNDICES NO FEED E MURAL DE AVISOS
CREATE INDEX IF NOT EXISTS idx_postagens_feed_igreja_data 
  ON public.postagens_feed(igreja_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_comentarios_post_data 
  ON public.comentarios_postagem(post_id, criado_em ASC);

CREATE INDEX IF NOT EXISTS idx_avisos_igreja_data 
  ON public.avisos(igreja_id, data_evento ASC);

-- Confirmação
DO $$
BEGIN
    RAISE NOTICE '>>> Índices de Alta Performance criados com sucesso!';
END $$;
