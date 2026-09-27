-- =====================================================================================
-- MIGRATION: CONSOLIDAÇÃO DE CÉLULAS NA TABELA UNIDADES & SINCRONIZAÇÃO DE MEMBROS
-- =====================================================================================
-- Transfere todos os atributos e relacionamentos de células exclusivamente para a tabela 
-- 'unidades', eliminando dependências da tabela 'celulas' e mantendo a contagem 
-- de membros ('quantidade_membros') 100% atualizada e atualizável automaticamente.
-- =====================================================================================

-- 1. ADICIONA COLUNAS EXCLUSIVAS DE CÉLULAS NA TABELA UNIDADES (SE NÃO EXISTIREM)
ALTER TABLE public.unidades 
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
  ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT now();

-- 2. MIGRA OS DADOS EXISTENTES DA TABELA 'celulas' PARA 'unidades'
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'celulas'
  ) THEN
    UPDATE public.unidades u
    SET 
      dia_semana = COALESCE(u.dia_semana, c.dia_semana, c.dia_reuniao, 'Quinta-feira'),
      dia_reuniao = COALESCE(u.dia_reuniao, c.dia_reuniao, c.dia_semana, 'Quinta-feira'),
      horario = COALESCE(u.horario, c.horario, c.horario_reuniao, '19:30'),
      horario_reuniao = COALESCE(u.horario_reuniao, c.horario_reuniao, c.horario, '19:30'),
      bairro = COALESCE(u.bairro, c.bairro, 'Bairro Central'),
      endereco = COALESCE(u.endereco, c.endereco, 'Endereço da Célula'),
      foto_url = COALESCE(u.foto_url, c.foto_url),
      latitude = COALESCE(u.latitude, c.latitude),
      longitude = COALESCE(u.longitude, c.longitude),
      quantidade_membros = COALESCE(
        (SELECT COUNT(*) FROM public.membros m WHERE m.unidade_id = u.id AND (m.ativo IS NULL OR m.ativo = true)),
        c.quantidade_membros,
        0
      ),
      atualizado_em = now()
    FROM public.celulas c
    WHERE c.unidade_id = u.id;
  END IF;
END $$;

-- 3. RECALCULA E ATUALIZA A QUANTIDADE REAL DE MEMBROS EM TODAS AS UNIDADES
UPDATE public.unidades u
SET quantidade_membros = COALESCE(
  (
    SELECT COUNT(*) 
    FROM public.membros m 
    WHERE m.unidade_id = u.id 
    AND (m.ativo IS NULL OR m.ativo = true)
  ),
  0
);

-- 4. CRIAÇÃO DE FUNÇÃO E TRIGGER PARA SINCRONIZAÇÃO AUTOMÁTICA DE MEMBROS NA TABELA UNIDADES
CREATE OR REPLACE FUNCTION public.sync_unidade_quantidade_membros()
RETURNS TRIGGER AS $$
BEGIN
  -- Se um membro foi desvinculado, excluído ou mudou de unidade, atualiza a unidade antiga
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

  -- Se um membro foi inserido, vinculado ou reativado, atualiza a nova unidade
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove o trigger antigo se existir e cria novamente
DROP TRIGGER IF EXISTS trg_sync_unidade_membros ON public.membros;
CREATE TRIGGER trg_sync_unidade_membros
AFTER INSERT OR UPDATE OR DELETE ON public.membros
FOR EACH ROW EXECUTE FUNCTION public.sync_unidade_quantidade_membros();

-- 5. CRIAÇÃO DE ÍNDICES DE ALTA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_ativo ON public.unidades(igreja_id, ativo);
CREATE INDEX IF NOT EXISTS idx_unidades_pai_id ON public.unidades(pai_id);
CREATE INDEX IF NOT EXISTS idx_unidades_dia_semana ON public.unidades(dia_semana);
CREATE INDEX IF NOT EXISTS idx_membros_unidade_id ON public.membros(unidade_id);
CREATE INDEX IF NOT EXISTS idx_membros_igreja_unidade ON public.membros(igreja_id, unidade_id);

-- 6. REMOÇÃO DAS RESTRIÇÕES DE CHAVE ESTRANGEIRA DE 'celulas' CASO EXISTAM
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'celulas'
  ) THEN
    -- Desabilita foreign keys antigas para que nada dependa exclusivamente de 'celulas'
    ALTER TABLE public.celulas DROP CONSTRAINT IF EXISTS celulas_unidade_id_fkey;
  END IF;
END $$;
