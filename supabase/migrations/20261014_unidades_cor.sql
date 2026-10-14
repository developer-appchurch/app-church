-- ==============================================================================
-- Migração: cor das unidades (Área, Setor, Distrito...) no Organograma
--
-- Guarda a cor escolhida pelo líder da unidade (ou pelo Administrador) para o
-- Organograma da tela "Indicadores da Igreja". NULL = usa a cor padrão do app.
-- As células não têm cor própria: sempre repetem a cor do seu setor.
--
-- Formato aceito: hexadecimal de 6 dígitos com '#', ex.: #d63a12.
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ==============================================================================

ALTER TABLE public.unidades
  ADD COLUMN IF NOT EXISTS cor TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unidades_cor_hex_chk'
      AND conrelid = 'public.unidades'::regclass
  ) THEN
    ALTER TABLE public.unidades
      ADD CONSTRAINT unidades_cor_hex_chk
      CHECK (cor IS NULL OR cor ~ '^#[0-9a-fA-F]{6}$');
  END IF;
END $$;

COMMENT ON COLUMN public.unidades.cor IS
  'Cor (#RRGGBB) da unidade no Organograma. NULL = cor padrão. Células usam a cor do setor.';
