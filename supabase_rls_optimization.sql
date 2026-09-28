-- =====================================================================================
-- SCRIPT DE OTIMIZAÇÃO DE PERFORMANCE, ÍNDICES COMPOSTOS E RLS CONSOLIDADO: APPCHURCH
-- =====================================================================================

-- 1. ÍNDICES DE ALTA PERFORMANCE PARA CONSULTAS E PAGINAÇÃO POR CURSOR
-- Índice composto para listagem de unidades ativas ordenadas por nome
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_ativo_nome 
ON public.unidades(igreja_id, ativo, nome);

-- Índice composto para navegação hierárquica e busca de ancestrais
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_pai 
ON public.unidades(igreja_id, pai_id);

-- Índice para filtragem por tipo de nível organizacional
CREATE INDEX IF NOT EXISTS idx_unidades_nivel_tipo 
ON public.unidades(nivel_tipo_id);

-- Índice para busca de linhagem/criação de células (unidade_criadora_id)
CREATE INDEX IF NOT EXISTS idx_unidades_unidade_criadora_id 
ON public.unidades(unidade_criadora_id);

-- Índices compostos para tabela de líderes
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_unidade_ativo 
ON public.unidade_lideres(unidade_id, ativo);

CREATE INDEX IF NOT EXISTS idx_unidade_lideres_pessoa_ativo 
ON public.unidade_lideres(pessoa_id, ativo);

-- Índices compostos para membros: paginação por cursor (nome, id) com filtro por igreja
CREATE INDEX IF NOT EXISTS idx_membros_igreja_nome_id 
ON public.membros(igreja_id, nome, id);

-- Índice para consulta de membros vinculados a uma unidade
CREATE INDEX IF NOT EXISTS idx_membros_unidade_id 
ON public.membros(unidade_id);

CREATE INDEX IF NOT EXISTS idx_membros_igreja_unidade 
ON public.membros(igreja_id, unidade_id);

-- 2. GARANTIA DE FOREIGN KEY PARA JUNÇÕES EMBUTIDAS (POSTGREST SINGLE-QUERY JOIN)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unidade_lideres_pessoa_id_fkey'
      AND conrelid = 'public.unidade_lideres'::regclass
  ) THEN
    ALTER TABLE public.unidade_lideres
      ADD CONSTRAINT unidade_lideres_pessoa_id_fkey
      FOREIGN KEY (pessoa_id)
      REFERENCES public.membros(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 3. POLÍTICAS RLS OTIMIZADAS (USO DE SUBQUERY ESCALAR (SELECT auth.uid()))
-- Reduz drasticamente o custo de reavaliação de políticas por tupla.

-- Tabela: unidades
ALTER TABLE IF EXISTS public.unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de unidades da igreja do usuario" ON public.unidades;
DROP POLICY IF EXISTS "Permitir insercao de unidades por lideres" ON public.unidades;
DROP POLICY IF EXISTS "Permitir gestao de unidades da igreja" ON public.unidades;
DROP POLICY IF EXISTS "Acesso a unidades" ON public.unidades;

CREATE POLICY "unidades_igreja_select"
ON public.unidades FOR SELECT
USING (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "unidades_igreja_all"
ON public.unidades FOR ALL
USING (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

-- Tabela: unidade_lideres
ALTER TABLE IF EXISTS public.unidade_lideres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de lideres da unidade" ON public.unidade_lideres;
DROP POLICY IF EXISTS "Permitir gestao de lideres da unidade" ON public.unidade_lideres;
DROP POLICY IF EXISTS "Acesso a unidade_lideres" ON public.unidade_lideres;

CREATE POLICY "unidade_lideres_select"
ON public.unidade_lideres FOR SELECT
USING (
  unidade_id IN (
    SELECT id FROM public.unidades WHERE igreja_id IN (
      SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "unidade_lideres_all"
ON public.unidade_lideres FOR ALL
USING (
  unidade_id IN (
    SELECT id FROM public.unidades WHERE igreja_id IN (
      SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  unidade_id IN (
    SELECT id FROM public.unidades WHERE igreja_id IN (
      SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
);

-- Tabela: membros
ALTER TABLE IF EXISTS public.membros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de membros da igreja" ON public.membros;
DROP POLICY IF EXISTS "Permitir gestao de membros da igreja" ON public.membros;
DROP POLICY IF EXISTS "Acesso a membros" ON public.membros;

CREATE POLICY "membros_igreja_select"
ON public.membros FOR SELECT
USING (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "membros_igreja_all"
ON public.membros FOR ALL
USING (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

-- Tabela: nivel_tipo
ALTER TABLE IF EXISTS public.nivel_tipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de niveis organizacionais" ON public.nivel_tipo;
DROP POLICY IF EXISTS "Permitir gestao de niveis organizacionais" ON public.nivel_tipo;
DROP POLICY IF EXISTS "Acesso a nivel_tipo" ON public.nivel_tipo;

CREATE POLICY "nivel_tipo_select"
ON public.nivel_tipo FOR SELECT
USING (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "nivel_tipo_all"
ON public.nivel_tipo FOR ALL
USING (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);
