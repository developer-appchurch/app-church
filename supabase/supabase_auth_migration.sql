-- ==============================================================================
-- APPCHURCH - MIGRAÇÃO PARA SUPABASE AUTH, COLUNA AUTH_USER_ID E RESTRIÇÃO DE SENHA_HASH
-- Execute este script no SQL Editor do Supabase Dashboard
-- ==============================================================================

-- 1. ADICIONAR COLUNA membros.auth_user_id VINCULADA AO auth.users
ALTER TABLE IF EXISTS public.membros 
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_membros_auth_user_id 
  ON public.membros(auth_user_id);

-- 2. RESTRINGIR A LEITURA DE senha_hash PARA anon E authenticated (GRANT POR COLUNA)
-- Revoga o SELECT total da tabela membros para as roles públicas
REVOKE SELECT ON public.membros FROM anon, authenticated;

-- Concede SELECT estrito apenas nas colunas necessárias da aplicação (SEM senha_hash)
GRANT SELECT (
  id, 
  igreja_id, 
  unidade_id, 
  papel_id, 
  funcao, 
  nome, 
  login, 
  bairro, 
  aniversario, 
  telefone, 
  email, 
  status_frequencia, 
  percentual_frequencia, 
  url_avatar, 
  observacoes, 
  criado_em, 
  atualizado_em, 
  auth_user_id
) ON public.membros TO anon, authenticated;

-- Permite INSERT/UPDATE pelas roles autenticadas conforme regras existentes
GRANT INSERT, UPDATE, DELETE ON public.membros TO authenticated;
GRANT ALL ON public.membros TO service_role;

-- 3. REMOVER senha_hash DA VIEW members
DROP VIEW IF EXISTS public.members;

CREATE OR REPLACE VIEW public.members AS
  SELECT 
    id, 
    igreja_id, 
    unidade_id, 
    papel_id, 
    funcao, 
    nome, 
    login, 
    bairro, 
    aniversario, 
    telefone, 
    email, 
    status_frequencia, 
    percentual_frequencia, 
    url_avatar, 
    observacoes, 
    criado_em, 
    atualizado_em, 
    auth_user_id
  FROM public.membros;

GRANT SELECT ON public.members TO anon, authenticated;

-- ==============================================================================
-- 4. DIAGNÓSTICO DE POLÍTICAS RLS ABERTAS QUE PODERÃO SER FECHADAS NO FUTURO
-- (Conforme requisito: Não alterar o RLS nesta etapa, apenas listar para a próxima)
--
-- Atualmente abertas / permissivas com fallback para anon / login próprio:
--  - public.postagens_feed:
--      * "Leitura de postagens da igreja" -> Permite acesso se auth.uid() IS NULL
--      * "Insercao de postagens na igreja" -> Permite acesso se auth.uid() IS NULL
--      * "Exclusao de postagens" -> Permite acesso se auth.uid() IS NULL
--  - public.comentarios_postagem:
--      * "Leitura de comentarios" -> USING (true)
--      * "Insercao de comentarios" -> WITH CHECK (true)
--      * "Exclusao de comentarios" -> Permite se auth.uid() IS NULL
--  - public.curtidas:
--      * "Acesso total curtidas" -> USING (true) WITH CHECK (true)
--  - public.membros:
--      * Políticas com (SELECT auth.uid()) IS NULL
--
-- Próximo passo após todos os membros migrarem:
--  - Substituir auth.uid() IS NULL por estrito:
--      membros.auth_user_id = (SELECT auth.uid())
-- ==============================================================================

DO $$
BEGIN
  RAISE NOTICE '>>> Migração para Supabase Auth aplicada com sucesso!';
  RAISE NOTICE '>>> Coluna auth_user_id adicionada e senha_hash protegida contra leitura direta.';
END $$;
