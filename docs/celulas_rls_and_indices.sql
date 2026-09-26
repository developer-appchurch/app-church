-- =========================================================================
-- APPCHURCH: POLÍTICAS DE RLS (ROW LEVEL SECURITY) E ÍNDICES PARA CÉLULAS
-- =========================================================================

-- 1. Habilitar a extensão pg_trgm para busca textual rápida com ILIKE
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Habilitar RLS na tabela celulas e unidades
ALTER TABLE IF EXISTS celulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS unidades ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- POLICIES DE RLS: ISOLAMENTO ESTRITO POR CONGREGAÇÃO (igreja_id)
-- =========================================================================

-- Policy para SELECT em 'unidades':
-- Usuários autenticados só podem consultar unidades pertencentes à sua igreja vinculada
DROP POLICY IF EXISTS "unidades_select_church_isolation" ON unidades;
CREATE POLICY "unidades_select_church_isolation" ON unidades
FOR SELECT
TO authenticated
USING (
  igreja_id IN (
    SELECT m.igreja_id 
    FROM membros m 
    WHERE m.auth_user_id = auth.uid() OR m.id::text = auth.uid()::text
  )
  OR
  -- Administradores do sistema com role 'Administrador' têm acesso global
  EXISTS (
    SELECT 1 
    FROM membros m
    JOIN papeis p ON m.papel_id = p.id
    WHERE (m.auth_user_id = auth.uid() OR m.id::text = auth.uid()::text)
      AND (p.nome = 'Administrador' OR p.slug = 'administrador')
  )
);

-- Policy para SELECT em 'celulas':
-- O isolamento é garantido através do vínculo da unidade_id com a tabela unidades e a igreja do usuário
DROP POLICY IF EXISTS "celulas_select_church_isolation" ON celulas;
CREATE POLICY "celulas_select_church_isolation" ON celulas
FOR SELECT
TO authenticated
USING (
  unidade_id IN (
    SELECT u.id 
    FROM unidades u
    WHERE u.igreja_id IN (
      SELECT m.igreja_id 
      FROM membros m 
      WHERE m.auth_user_id = auth.uid() OR m.id::text = auth.uid()::text
    )
  )
  OR
  EXISTS (
    SELECT 1 
    FROM membros m
    JOIN papeis p ON m.papel_id = p.id
    WHERE (m.auth_user_id = auth.uid() OR m.id::text = auth.uid()::text)
      AND (p.nome = 'Administrador' OR p.slug = 'administrador')
  )
);

-- =========================================================================
-- ÍNDICES DE PERFORMANCE NO POSTGRESQL
-- =========================================================================

-- Índices compostos para filtros rápidos por igreja e status
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_ativo ON unidades(igreja_id, ativo);
CREATE INDEX IF NOT EXISTS idx_unidades_pai_id ON unidades(pai_id);
CREATE INDEX IF NOT EXISTS idx_celulas_unidade_id ON celulas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_celulas_dia_semana ON celulas(dia_semana);

-- Índices GIN com pg_trgm para buscas ultra-rápidas com ILIKE em nome e bairro
CREATE INDEX IF NOT EXISTS idx_unidades_nome_trgm ON unidades USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_celulas_bairro_trgm ON celulas USING gin (bairro gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_celulas_endereco_trgm ON celulas USING gin (endereco gin_trgm_ops);

-- Índices para junções com líderes
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_unidade ON unidade_lideres(unidade_id);
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_pessoa ON unidade_lideres(pessoa_id);
