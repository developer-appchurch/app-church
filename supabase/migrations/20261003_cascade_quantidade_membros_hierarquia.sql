-- ==============================================================================
-- Migração: Propagação em Cascata da quantidade_membros para Unidades Superiores
-- Regra de Negócio: quantidade_membros de uma unidade folha (Célula) continua
-- sendo a contagem direta de membros vinculados (mantida pelo trigger já
-- existente). Para unidades superiores (Setor, Área, Distrito, ...), o valor
-- passa a ser a SOMA da quantidade_membros das unidades filhas diretas,
-- recalculada automaticamente e em cascata até a raiz sempre que uma célula
-- ganha ou perde membro, ou é transferida de setor.
-- ==============================================================================

-- 1. Função auxiliar: recalcula a quantidade_membros de uma unidade (como soma
--    dos filhos diretos ativos) e propaga a atualização para todos os
--    ancestrais, subindo um nível por vez até não haver mais pai_id.
CREATE OR REPLACE FUNCTION public.recalcular_quantidade_membros_cascata(p_unidade_id UUID)
RETURNS VOID AS $$
DECLARE
  v_atual_id UUID;
  v_pai_id UUID;
  v_tem_filhos BOOLEAN;
BEGIN
  v_atual_id := p_unidade_id;

  WHILE v_atual_id IS NOT NULL LOOP
    SELECT EXISTS (SELECT 1 FROM public.unidades WHERE pai_id = v_atual_id)
      INTO v_tem_filhos;

    -- Só recalcula como "soma dos filhos" se a unidade tiver filhos (ou seja,
    -- não é uma célula/folha). A folha mantém sua contagem direta de membros,
    -- já atualizada pelo trigger de public.membros.
    IF v_tem_filhos THEN
      UPDATE public.unidades
      SET
        quantidade_membros = (
          SELECT COALESCE(SUM(f.quantidade_membros), 0)
          FROM public.unidades f
          WHERE f.pai_id = v_atual_id AND f.ativo = true
        ),
        atualizado_em = now()
      WHERE id = v_atual_id;
    END IF;

    SELECT pai_id INTO v_pai_id FROM public.unidades WHERE id = v_atual_id;
    v_atual_id := v_pai_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualiza a função do trigger existente (public.sync_unidade_quantidade_membros)
--    para, após recalcular a unidade folha afetada, também propagar a
--    contagem para Setor, Área, Distrito etc. acima dela.
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

      PERFORM public.recalcular_quantidade_membros_cascata(NEW.unidade_id);
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

      PERFORM public.recalcular_quantidade_membros_cascata(OLD.unidade_id);
    END IF;
    RETURN OLD;

  -- CENÁRIO C: UPDATE (Transferência de célula/unidade ou alteração de função)
  ELSIF (TG_OP = 'UPDATE') THEN
    -- Somente altera quantidade_membros se a pessoa mudou de unidade (transferida ou desvinculada)
    -- Se apenas o cargo/função ou qualquer outro campo mudou na mesma unidade: NÃO altera quantidade_membros
    IF OLD.unidade_id IS DISTINCT FROM NEW.unidade_id THEN
      -- Decrementa/recalcula unidade antiga e propaga para seus ancestrais
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

        PERFORM public.recalcular_quantidade_membros_cascata(OLD.unidade_id);
      END IF;

      -- Incrementa/recalcula unidade nova e propaga para seus ancestrais
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

        PERFORM public.recalcular_quantidade_membros_cascata(NEW.unidade_id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger adicional: quando uma UNIDADE é transferida de pai (ex.: "Mover
--    Célula para outro Setor", ou um Setor que muda de Área), tanto a árvore
--    antiga quanto a nova precisam ter suas somas recalculadas em cascata.
CREATE OR REPLACE FUNCTION public.sync_quantidade_membros_ao_mudar_pai()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.pai_id IS DISTINCT FROM NEW.pai_id) THEN
    IF OLD.pai_id IS NOT NULL THEN
      PERFORM public.recalcular_quantidade_membros_cascata(OLD.pai_id);
    END IF;
    IF NEW.pai_id IS NOT NULL THEN
      PERFORM public.recalcular_quantidade_membros_cascata(NEW.pai_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_quantidade_membros_pai ON public.unidades;
CREATE TRIGGER trg_sync_quantidade_membros_pai
AFTER UPDATE ON public.unidades
FOR EACH ROW EXECUTE FUNCTION public.sync_quantidade_membros_ao_mudar_pai();

-- 4. Backfill: recalcula agora, para todas as unidades já existentes, a
--    quantidade_membros em cascata (folhas já estão corretas; propaga a soma
--    para cima, repetindo algumas vezes para cobrir hierarquias com várias
--    camadas — Célula -> Setor -> Área -> Distrito -> ...).
DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    UPDATE public.unidades pai
    SET
      quantidade_membros = COALESCE((
        SELECT SUM(f.quantidade_membros)
        FROM public.unidades f
        WHERE f.pai_id = pai.id AND f.ativo = true
      ), 0),
      atualizado_em = now()
    WHERE EXISTS (SELECT 1 FROM public.unidades f WHERE f.pai_id = pai.id);
  END LOOP;
END;
$$;
