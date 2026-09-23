-- ==============================================================================
-- MIGRAÇÃO SUPABASE: RENOMEAR track_steps PARA etapa_trilhos E ADICIONAR id_igreja
-- ==============================================================================
-- 1. Cria ou renomeia a tabela track_steps para etapa_trilhos
-- 2. Adiciona coluna id_igreja UUID REFERENCES public.churches(id)
-- 3. Atualiza referências em member_track_steps
-- 4. Remove a view ou tabela legada track_steps
-- ==============================================================================

DO $$
BEGIN
    -- Se track_steps existir como tabela e etapa_trilhos ainda não, renomeia
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'track_steps' AND table_type = 'BASE TABLE'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'etapa_trilhos'
    ) THEN
        ALTER TABLE public.track_steps RENAME TO etapa_trilhos;
    END IF;
END $$;

-- Garante que a tabela etapa_trilhos exista com a estrutura completa
CREATE TABLE IF NOT EXISTS public.etapa_trilhos (
    id SERIAL PRIMARY KEY,
    id_igreja UUID REFERENCES public.churches(id) ON DELETE CASCADE,
    numero_etapa INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    obrigatoria BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adiciona a coluna id_igreja caso a tabela tenha sido renomeada de track_steps
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'etapa_trilhos' AND column_name = 'id_igreja'
    ) THEN
        ALTER TABLE public.etapa_trilhos ADD COLUMN id_igreja UUID REFERENCES public.churches(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_etapa_trilhos_igreja ON public.etapa_trilhos(id_igreja);
CREATE INDEX IF NOT EXISTS idx_etapa_trilhos_numero ON public.etapa_trilhos(numero_etapa);

-- Remove view ou tabela legada track_steps do banco de dados
DROP VIEW IF EXISTS public.track_steps CASCADE;
DROP TABLE IF EXISTS public.track_steps CASCADE;

-- Habilita Row Level Security (RLS) na tabela etapa_trilhos
ALTER TABLE public.etapa_trilhos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total etapa_trilhos" ON public.etapa_trilhos;
DROP POLICY IF EXISTS "Acesso publico etapa_trilhos" ON public.etapa_trilhos;
CREATE POLICY "Acesso total etapa_trilhos" ON public.etapa_trilhos 
    FOR ALL USING (true) WITH CHECK (true);

-- Garante que member_track_steps tenha permissão e índices adequados
CREATE TABLE IF NOT EXISTS public.member_track_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membro_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    celula_id UUID REFERENCES public.cells(id) ON DELETE CASCADE,
    etapa_id INTEGER NOT NULL,
    concluida BOOLEAN NOT NULL DEFAULT false,
    concluida_em TEXT,
    observacoes TEXT,
    validado_por TEXT,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(membro_id, etapa_id)
);

ALTER TABLE public.member_track_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total member_track_steps" ON public.member_track_steps;
CREATE POLICY "Acesso total member_track_steps" ON public.member_track_steps 
    FOR ALL USING (true) WITH CHECK (true);

-- Popula etapas padrão caso a tabela esteja vazia
DO $$
DECLARE
    church_rec RECORD;
BEGIN
    -- Se não houver etapas cadastradas, insere etapas globais / por congregação
    IF NOT EXISTS (SELECT 1 FROM public.etapa_trilhos LIMIT 1) THEN
        -- Insere etapas padrão para cada igreja existente
        FOR church_rec IN SELECT id FROM public.churches LOOP
            INSERT INTO public.etapa_trilhos (id_igreja, numero_etapa, titulo, descricao, obrigatoria) VALUES
            (church_rec.id, 1, '1. Integração & Boas-Vindas', 'Recepção na célula, cadastro de dados e consolidação inicial do novo membro.', true),
            (church_rec.id, 2, '2. Batismo nas Águas', 'Profissão pública de fé e testemunho cristão perante a congregação.', true),
            (church_rec.id, 3, '3. Encontro com Deus', 'Fim de semana de cura interior, libertação e renovação no Espírito Santo.', true),
            (church_rec.id, 4, '4. Pós-Encontro & Maturidade', 'Aprofundamento na oração, disciplina do jejum e leitura bíblica diária.', true),
            (church_rec.id, 5, '5. Escola de Líderes / CTL', 'Curso de Treinamento de Líderes: capacitação bíblica e prática para liderança celular.', true),
            (church_rec.id, 6, '6. Líder em Treinamento & Envio', 'Prática de ministração, pastoreio de vidas e multiplicação frutífera de célula.', true);
        END LOOP;
        
        -- Caso não haja igrejas cadastradas ainda, insere com id_igreja = NULL como etapas template
        IF NOT FOUND THEN
            INSERT INTO public.etapa_trilhos (id_igreja, numero_etapa, titulo, descricao, obrigatoria) VALUES
            (NULL, 1, '1. Integração & Boas-Vindas', 'Recepção na célula, cadastro de dados e consolidação inicial do novo membro.', true),
            (NULL, 2, '2. Batismo nas Águas', 'Profissão pública de fé e testemunho cristão perante a congregação.', true),
            (NULL, 3, '3. Encontro com Deus', 'Fim de semana de cura interior, libertação e renovação no Espírito Santo.', true),
            (NULL, 4, '4. Pós-Encontro & Maturidade', 'Aprofundamento na oração, disciplina do jejum e leitura bíblica diária.', true),
            (NULL, 5, '5. Escola de Líderes / CTL', 'Curso de Treinamento de Líderes: capacitação bíblica e prática para liderança celular.', true),
            (NULL, 6, '6. Líder em Treinamento & Envio', 'Prática de ministração, pastoreio de vidas e multiplicação frutífera de célula.', true);
        END IF;
    END IF;
END $$;
