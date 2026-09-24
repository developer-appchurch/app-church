-- Script de Otimização e RLS: Níveis Organizacionais
-- Índices para navegação em árvore, junções e políticas RLS

-- 1. Criação dos índices recomendados (Passo 4)
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_pai ON unidades(igreja_id, pai_id);
CREATE INDEX IF NOT EXISTS idx_unidades_nivel_tipo ON unidades(nivel_tipo_id);
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_ativo ON unidades(igreja_id, ativo);
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_unidade ON unidade_lideres(unidade_id);
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_pessoa ON unidade_lideres(pessoa_id);

-- Índices da tabela unidade_cobertura
-- As colunas reais no banco são: unidade_principal_id e unidade_cobertura_id
CREATE INDEX IF NOT EXISTS idx_unidade_cobertura_principal ON unidade_cobertura(unidade_principal_id);
CREATE INDEX IF NOT EXISTS idx_unidade_cobertura_cobertura ON unidade_cobertura(unidade_cobertura_id);

-- Caso exista ambiente com a nomenclatura legada unidade_coberta_id:
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'unidade_cobertura' AND column_name = 'unidade_coberta_id'
    ) THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_unidade_cobertura_coberta ON unidade_cobertura(unidade_coberta_id);';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_membros_unidade_id ON membros(unidade_id);
CREATE INDEX IF NOT EXISTS idx_membros_igreja_id ON membros(igreja_id);

-- 2. Revisão das Políticas RLS (Passo 8)
-- Otimização: Uso de (select auth.uid()) escalar em vez de re-invocação direta de auth.uid()
-- que causava reavaliação a cada tupla nas consultas de árvore.

-- Tabela: unidades
ALTER TABLE IF EXISTS unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de unidades da igreja do usuario" ON unidades;
DROP POLICY IF EXISTS "Permitir insercao de unidades por lideres" ON unidades;
DROP POLICY IF EXISTS "Permitir gestao de unidades da igreja" ON unidades;

CREATE POLICY "Permitir leitura de unidades da igreja do usuario"
ON unidades FOR SELECT
USING (
  igreja_id IN (
    SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL -- Permite anon/dev mode em preview
);

CREATE POLICY "Permitir gestao de unidades da igreja"
ON unidades FOR ALL
USING (
  igreja_id IN (
    SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  igreja_id IN (
    SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

-- Tabela: celulas
ALTER TABLE IF EXISTS celulas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de celulas da igreja" ON celulas;
DROP POLICY IF EXISTS "Permitir gestao de celulas da igreja" ON celulas;

CREATE POLICY "Permitir leitura de celulas da igreja"
ON celulas FOR SELECT
USING (
  unidade_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "Permitir gestao de celulas da igreja"
ON celulas FOR ALL
USING (
  unidade_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  unidade_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
);

-- Tabela: unidade_lideres
ALTER TABLE IF EXISTS unidade_lideres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de lideres da unidade" ON unidade_lideres;
DROP POLICY IF EXISTS "Permitir gestao de lideres da unidade" ON unidade_lideres;

CREATE POLICY "Permitir leitura de lideres da unidade"
ON unidade_lideres FOR SELECT
USING (
  unidade_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "Permitir gestao de lideres da unidade"
ON unidade_lideres FOR ALL
USING (
  unidade_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  unidade_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
);

-- Tabela: nivel_tipo
ALTER TABLE IF EXISTS nivel_tipo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de niveis organizacionais" ON nivel_tipo;
DROP POLICY IF EXISTS "Permitir gestao de niveis organizacionais" ON nivel_tipo;

CREATE POLICY "Permitir leitura de niveis organizacionais"
ON nivel_tipo FOR SELECT
USING (
  igreja_id IN (
    SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "Permitir gestao de niveis organizacionais"
ON nivel_tipo FOR ALL
USING (
  igreja_id IN (
    SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  igreja_id IN (
    SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

-- Tabela: unidade_cobertura
ALTER TABLE IF EXISTS unidade_cobertura ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura de unidade_cobertura" ON unidade_cobertura;
DROP POLICY IF EXISTS "Permitir gestao de unidade_cobertura" ON unidade_cobertura;

CREATE POLICY "Permitir leitura de unidade_cobertura"
ON unidade_cobertura FOR SELECT
USING (
  unidade_principal_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "Permitir gestao de unidade_cobertura"
ON unidade_cobertura FOR ALL
USING (
  unidade_principal_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
)
WITH CHECK (
  unidade_principal_id IN (
    SELECT id FROM unidades WHERE igreja_id IN (
      SELECT igreja_id FROM membros WHERE id = (SELECT auth.uid())
    )
  )
  OR (SELECT auth.uid()) IS NULL
);
