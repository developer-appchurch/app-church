-- =====================================================================================
-- MIGRATION: CONSOLIDAÇÃO DE CÉLULAS NA TABELA UNIDADES & SINCRONIZAÇÃO DE MEMBROS
-- =====================================================================================

-- 1. ADICIONA COLUNAS EXCLUSIVAS DE CÉLULAS E LINHAGEM (UNIDADE CRIADORA) NA TABELA UNIDADES
ALTER TABLE public.unidades 
  ADD COLUMN IF NOT EXISTS unidade_criadora_id UUID,
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

-- Garante constraint de valor não-negativo
ALTER TABLE public.unidades
  DROP CONSTRAINT IF EXISTS unidades_quantidade_membros_check;

ALTER TABLE public.unidades
  ADD CONSTRAINT unidades_quantidade_membros_check
  CHECK (quantidade_membros >= 0);

-- 2. CRIA A RESTRIÇÃO GARANTINDO QUE A UNIDADE CRIADORA PERTENÇA À MESMA IGREJA
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_unidades_unidade_criadora_igreja'
      AND conrelid = 'public.unidades'::regclass
  ) THEN
    ALTER TABLE public.unidades
      ADD CONSTRAINT fk_unidades_unidade_criadora_igreja
      FOREIGN KEY (unidade_criadora_id, igreja_id)
      REFERENCES public.unidades(id, igreja_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. ÍNDICE PARA CONSULTAR RAPIDAMENTE AS CÉLULAS ORIGINADAS DE UMA UNIDADE
CREATE INDEX IF NOT EXISTS idx_unidades_unidade_criadora_id
ON public.unidades(unidade_criadora_id);

-- 2. MIGRA OS DADOS EXISTENTES DA TABELA 'celulas' PARA 'unidades'
-- (corrigido: 'celulas' só tem dia_semana/horario; 'membros' não tem coluna 'ativo')
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'celulas'
  ) THEN
    UPDATE public.unidades u
    SET 
      dia_semana = COALESCE(u.dia_semana, c.dia_semana, 'Quinta-feira'),
      dia_reuniao = COALESCE(u.dia_reuniao, c.dia_semana, 'Quinta-feira'),
      horario = COALESCE(u.horario, c.horario, '19:30'),
      horario_reuniao = COALESCE(u.horario_reuniao, c.horario, '19:30'),
      bairro = COALESCE(u.bairro, c.bairro, 'Bairro Central'),
      endereco = COALESCE(u.endereco, c.endereco, 'Endereço da Célula'),
      quantidade_membros = COALESCE(
        (SELECT COUNT(*) FROM public.membros m WHERE m.unidade_id = u.id),
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
  ),
  0
);

-- 4. CRIAÇÃO DE FUNÇÃO E TRIGGER PARA SINCRONIZAÇÃO AUTOMÁTICA DE MEMBROS NA TABELA UNIDADES
CREATE OR REPLACE FUNCTION public.atualizar_quantidade_membros_unidade()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- INSERT
    IF TG_OP = 'INSERT' THEN
        IF NEW.unidade_id IS NOT NULL THEN
            UPDATE public.unidades
            SET quantidade_membros = quantidade_membros + 1,
                atualizado_em = NOW()
            WHERE id = NEW.unidade_id;
        END IF;
        RETURN NEW;
    END IF;

    -- DELETE
    IF TG_OP = 'DELETE' THEN
        IF OLD.unidade_id IS NOT NULL THEN
            UPDATE public.unidades
            SET quantidade_membros = GREATEST(quantidade_membros - 1, 0),
                atualizado_em = NOW()
            WHERE id = OLD.unidade_id;
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE
    IF TG_OP = 'UPDATE' THEN
        IF OLD.unidade_id IS DISTINCT FROM NEW.unidade_id THEN
            IF OLD.unidade_id IS NOT NULL THEN
                UPDATE public.unidades
                SET quantidade_membros = GREATEST(quantidade_membros - 1, 0),
                    atualizado_em = NOW()
                WHERE id = OLD.unidade_id;
            END IF;

            IF NEW.unidade_id IS NOT NULL THEN
                UPDATE public.unidades
                SET quantidade_membros = quantidade_membros + 1,
                    atualizado_em = NOW()
                WHERE id = NEW.unidade_id;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualizar_quantidade_membros_unidade ON public.membros;
DROP TRIGGER IF EXISTS trg_sync_unidade_membros ON public.membros;

CREATE TRIGGER trg_atualizar_quantidade_membros_unidade
AFTER INSERT OR DELETE OR UPDATE OF unidade_id
ON public.membros
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_quantidade_membros_unidade();

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
    ALTER TABLE public.celulas DROP CONSTRAINT IF EXISTS celulas_unidade_id_fkey;
  END IF;
END $$;
