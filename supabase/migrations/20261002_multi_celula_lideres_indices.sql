-- ==============================================================================
-- Migração: Suporte e Otimização para Líderes de Múltiplas Células Simultâneas
-- Data: 2026-10-02
-- ==============================================================================

-- 1. Constraint / Índice Único para evitar duplicidade de vínculos ativos 
-- da mesma pessoa na MESMA unidade (mas permitindo que ela lidere N unidades distintas)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unidade_lideres_unico_ativo 
ON unidade_lideres (unidade_id, pessoa_id) 
WHERE ativo = true;

-- 2. Índice para consulta reversa rápida: quais unidades/células uma pessoa lidera
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_pessoa_ativo 
ON unidade_lideres (pessoa_id) 
WHERE ativo = true;

COMMENT ON INDEX idx_unidade_lideres_unico_ativo IS 'Garante que a mesma pessoa não tenha mais de um registro ativo na mesma unidade/célula.';
COMMENT ON INDEX idx_unidade_lideres_pessoa_ativo IS 'Otimiza consultas reversas para identificar todas as células lideradas por uma pessoa.';
