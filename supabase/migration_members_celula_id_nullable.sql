-- ==============================================================================
-- MIGRAÇÃO: Permitir Pastor/Membros temporariamente sem célula (celula_id nulo)
-- Execute no SQL Editor do Supabase se o cadastro acusar violação de NOT NULL em celula_id
-- ==============================================================================

-- 1. Remove restrição NOT NULL da coluna celula_id na tabela members
ALTER TABLE public.members ALTER COLUMN celula_id DROP NOT NULL;

-- 2. Atualiza a chave estrangeira para ON DELETE SET NULL
ALTER TABLE public.members DROP CONSTRAINT IF EXISTS members_celula_id_fkey;

ALTER TABLE public.members 
  ADD CONSTRAINT members_celula_id_fkey 
  FOREIGN KEY (celula_id) 
  REFERENCES public.cells(id) 
  ON DELETE SET NULL;
