-- ==============================================================================
-- Migração: Categorias de célula (Crianças, Adolescentes, Jovens, Adultos, Casais...)
-- Data: 2026-10-16
--
-- Cada igreja tem uma lista de categorias (editável em Configurações da Igreja) e cada
-- célula pode ter UMA categoria (opcional). Células já cadastradas ficam sem categoria
-- até alguém escolher uma.
--
-- Regras:
--   * Nome único por igreja (sem diferenciar maiúsculas/minúsculas).
--   * Categoria em uso não é apagada: desativa-se (ativo = false) e a célula continua
--     mostrando a categoria. Sem uso, pode ser excluída.
--   * Toda igreja já existente recebe as 5 categorias padrão; igrejas novas recebem
--     por gatilho ao serem criadas.
--
-- Acesso: RLS habilitado sem políticas para anon/authenticated. Todo acesso passa pelas
-- rotas /api/celulas/categorias, que usam a service role e validam sessão e permissão.
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ==============================================================================

-- 1. Tabela de categorias
CREATE TABLE IF NOT EXISTS public.celula_categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 40),
    ordem INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_celula_categorias_igreja_nome
    ON public.celula_categorias (igreja_id, lower(btrim(nome)));

CREATE INDEX IF NOT EXISTS idx_celula_categorias_igreja
    ON public.celula_categorias (igreja_id, ordem);

ALTER TABLE public.celula_categorias ENABLE ROW LEVEL SECURITY;

-- 2. Categoria da célula (coluna em unidades; só células usam)
ALTER TABLE public.unidades
    ADD COLUMN IF NOT EXISTS categoria_id UUID
    REFERENCES public.celula_categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_unidades_categoria
    ON public.unidades (categoria_id) WHERE categoria_id IS NOT NULL;

-- 3. Categorias padrão para as igrejas já existentes
INSERT INTO public.celula_categorias (igreja_id, nome, ordem)
SELECT i.id, c.nome, c.ordem
FROM public.igrejas i
CROSS JOIN (VALUES
    ('Crianças', 10),
    ('Adolescentes', 20),
    ('Jovens', 30),
    ('Adultos', 40),
    ('Casais', 50)
) AS c(nome, ordem)
ON CONFLICT DO NOTHING;

-- 4. Igrejas novas já nascem com as categorias padrão
CREATE OR REPLACE FUNCTION public.fn_celula_categorias_padrao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.celula_categorias (igreja_id, nome, ordem)
    VALUES
        (NEW.id, 'Crianças', 10),
        (NEW.id, 'Adolescentes', 20),
        (NEW.id, 'Jovens', 30),
        (NEW.id, 'Adultos', 40),
        (NEW.id, 'Casais', 50)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_celula_categorias_padrao ON public.igrejas;
CREATE TRIGGER trg_celula_categorias_padrao
    AFTER INSERT ON public.igrejas
    FOR EACH ROW EXECUTE FUNCTION public.fn_celula_categorias_padrao();

COMMENT ON TABLE public.celula_categorias IS
    'Categorias de célula por igreja (Crianças, Adolescentes, Jovens, Adultos, Casais...).';
COMMENT ON COLUMN public.unidades.categoria_id IS
    'Categoria da célula (opcional). NULL = sem categoria.';
