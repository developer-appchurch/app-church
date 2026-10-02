-- ==============================================================================
-- Migração: Suporte e Otimização para Líderes de Múltiplas Células Simultâneas
-- Data: 2026-10-02
-- ==============================================================================

-- 1. Constraint de integridade no banco para evitar duplicidade de vínculos ativos na mesma unidade
CREATE UNIQUE INDEX IF NOT EXISTS idx_unidade_lideres_unico_ativo 
ON unidade_lideres (unidade_id, pessoa_id) 
WHERE ativo = true;

-- 2. Novo índice para consulta reversa: quais unidades/células uma pessoa lidera
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_pessoa_ativo 
ON unidade_lideres (pessoa_id) 
WHERE ativo = true;
