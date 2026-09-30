-- ==============================================================================
-- Migração: Sincronização Automática da quantidade_membros em public.unidades
-- Regra de Negócio: Toda pessoa vinculada à célula (unidade_id) é contada,
-- independentemente de possuir função de Líder, Auxiliar, Discipulador ou Membro.
-- ==============================================================================

-- 1. Garante que a coluna quantidade_membros e índices existem na tabela unidades
ALTER TABLE public.unidades 
  ADD COLUMN IF NOT EXISTS quantidade_membros INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_membros_unidade_id ON public.membros(unidade_id);
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_ativo ON public.unidades(igreja_id, ativo);

-- 2. Atualiza imediatamente o total de membros vinculados para todas as unidades existentes
UPDATE public.unidades u
SET 
  quantidade_membros = COALESCE(
    (
      SELECT COUNT(*) 
      FROM public.membros m 
      WHERE m.unidade_id = u.id
    ),
    0
  ),
  atualizado_em = now();

-- 3. Função do Trigger de Sincronização Automática
CREATE OR REPLACE FUNCTION public.sync_unidade_quantidade_membros()
RETURNS TRIGGER AS $$
BEGIN
  -- CENÁRIO A: INSERT de uma pessoa vinculada a uma célula/unidade
  IF (TG_OP = 'INSERT') THEN
    IF NEW.unidade_id IS NOT NULL THEN
      UPDATE public.unidades
      SET 
        quantidade_membros = (
          SELECT COUNT(*) 
          FROM public.membros 
          WHERE unidade_id = NEW.unidade_id
        ),
        atualizado_em = now()
      WHERE id = NEW.unidade_id;
    END IF;
    RETURN NEW;

  -- CENÁRIO B: DELETE de uma pessoa que estava vinculada a uma célula/unidade
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.unidade_id IS NOT NULL THEN
      UPDATE public.unidades
      SET 
        quantidade_membros = (
          SELECT COUNT(*) 
          FROM public.membros 
          WHERE unidade_id = OLD.unidade_id
        ),
        atualizado_em = now()
      WHERE id = OLD.unidade_id;
    END IF;
    RETURN OLD;

  -- CENÁRIO C: UPDATE (Transferência ou alteração de função)
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Somente altera quantidade_membros se a pessoa mudou de unidade (transferida ou desvinculada)
    -- Se apenas o cargo/função ou qualquer outro campo mudou na mesma unidade: NÃO altera quantidade_membros
    IF OLD.unidade_id IS DISTINCT FROM NEW.unidade_id THEN
      -- Decrementa/recalcula unidade antiga
      IF OLD.unidade_id IS NOT NULL THEN
        UPDATE public.unidades
        SET 
          quantidade_membros = (
            SELECT COUNT(*) 
            FROM public.membros 
            WHERE unidade_id = OLD.unidade_id
          ),
          atualizado_em = now()
        WHERE id = OLD.unidade_id;
      END IF;

      -- Incrementa/recalcula unidade nova
      IF NEW.unidade_id IS NOT NULL THEN
        UPDATE public.unidades
        SET 
          quantidade_membros = (
            SELECT COUNT(*) 
            FROM public.membros 
            WHERE unidade_id = NEW.unidade_id
          ),
          atualizado_em = now()
        WHERE id = NEW.unidade_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Criação do Trigger na tabela public.membros
DROP TRIGGER IF EXISTS trg_sync_unidade_membros ON public.membros;
CREATE TRIGGER trg_sync_unidade_membros
AFTER INSERT OR UPDATE OR DELETE ON public.membros
FOR EACH ROW EXECUTE FUNCTION public.sync_unidade_quantidade_membros();
