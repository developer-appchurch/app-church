-- ==============================================================================
-- Migração: presenças dos relatórios preservam membros excluídos
-- Data: 2026-10-08
--
-- Antes: excluir um membro apagava (CASCADE) as presenças dele nos relatórios
-- semanais, e o gatilho trg_sync_qtd_membros recalculava a "qtd. de membros" dos
-- relatórios antigos — alterando o histórico.
--
-- Agora: a presença guarda o nome do membro (nome_membro) e, quando o membro é
-- excluído, o vínculo fica nulo (ON DELETE SET NULL). O relatório antigo mantém a
-- mesma contagem e exibe "Fulano (excluído)".
--
-- RODAR ANTES de publicar a versão do app que lê a coluna nome_membro.
-- ==============================================================================

-- 1. Nova chave própria (a chave antiga incluía membro_id, que agora pode ficar nulo)
ALTER TABLE public.relatorio_presencas ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE public.relatorio_presencas SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.relatorio_presencas ALTER COLUMN id SET NOT NULL;

-- 2. Nome do membro guardado na presença (preenchido com os dados atuais)
ALTER TABLE public.relatorio_presencas ADD COLUMN IF NOT EXISTS nome_membro TEXT;
UPDATE public.relatorio_presencas rp
SET nome_membro = m.nome
FROM public.membros m
WHERE m.id = rp.membro_id AND rp.nome_membro IS NULL;

-- 3. Troca a chave primária e mantém a unicidade (relatório, membro)
ALTER TABLE public.relatorio_presencas DROP CONSTRAINT IF EXISTS relatorio_presencas_pkey;
ALTER TABLE public.relatorio_presencas ADD CONSTRAINT relatorio_presencas_pkey PRIMARY KEY (id);
ALTER TABLE public.relatorio_presencas ALTER COLUMN membro_id DROP NOT NULL;
ALTER TABLE public.relatorio_presencas
  ADD CONSTRAINT uq_relatorio_presencas_relatorio_membro UNIQUE (relatorio_id, membro_id);
CREATE INDEX IF NOT EXISTS idx_relatorio_presencas_relatorio ON public.relatorio_presencas(relatorio_id);

-- 4. Excluir membro deixa a presença sem vínculo (em vez de apagá-la)
ALTER TABLE public.relatorio_presencas DROP CONSTRAINT IF EXISTS relatorio_presencas_membro_id_fkey;
ALTER TABLE public.relatorio_presencas
  ADD CONSTRAINT relatorio_presencas_membro_id_fkey
  FOREIGN KEY (membro_id) REFERENCES public.membros(id) ON DELETE SET NULL;

-- 5. Preenche nome_membro automaticamente em toda nova presença
CREATE OR REPLACE FUNCTION public.fn_relatorio_presenca_nome_membro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.membro_id IS NOT NULL THEN
    SELECT nome INTO NEW.nome_membro FROM public.membros WHERE id = NEW.membro_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_relatorio_presenca_nome_membro ON public.relatorio_presencas;
CREATE TRIGGER trg_relatorio_presenca_nome_membro
  BEFORE INSERT ON public.relatorio_presencas
  FOR EACH ROW EXECUTE FUNCTION public.fn_relatorio_presenca_nome_membro();
