-- ==============================================================================
-- Migração: Contagem de Cultos (Fase 1 — tabelas e permissão)
-- Data: 2026-10-15
--
-- Cada igreja cadastra seus CAMPUS e, em cada campus, os HORÁRIOS de culto
-- (ex.: "Domingo 9h"). A cada culto realizado, o Gestor de Culto lança UMA
-- contagem com: adultos, crianças, voluntários, conversões, reconciliações e
-- convidados.
--
-- Regras de negócio:
--   * Total = adultos + crianças. Voluntários ficam À PARTE (não entram no total).
--   * Uma contagem por horário e data (não dá para lançar o mesmo culto duas vezes).
--   * Horário/campus nunca são apagados se já têm contagens: desativa-se (ativo = false),
--     para o histórico e os gráficos continuarem corretos.
--   * Lançar/editar dados exige a permissão especial 'culto:gerenciar' (independe de cargo).
--     Pastor/Administrador já herdam todas as permissões.
--   * Ver histórico e gráficos: mesmo público da tela Indicadores da Igreja (API checa).
--
-- Acesso: RLS habilitado sem políticas para anon/authenticated. Todo acesso passa pelas
-- rotas /api/culto/*, que usam a service role e validam sessão e permissão no servidor.
-- Idempotente: pode ser executada mais de uma vez sem erro.
-- ==============================================================================

-- 1. Campus (N por igreja)
CREATE TABLE IF NOT EXISTS public.campus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 80),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- permite que horários referenciem (campus, igreja) e nunca cruzem igrejas
    CONSTRAINT campus_id_igreja_uk UNIQUE (id, igreja_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campus_igreja_nome
    ON public.campus (igreja_id, lower(btrim(nome)));

-- 2. Horários de culto de cada campus
CREATE TABLE IF NOT EXISTS public.culto_horarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL,
    campus_id UUID NOT NULL,
    nome TEXT NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 80),
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo ... 6 = sábado
    hora TIME NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT culto_horarios_campus_fk
        FOREIGN KEY (campus_id, igreja_id) REFERENCES public.campus (id, igreja_id) ON DELETE RESTRICT,
    CONSTRAINT culto_horarios_id_igreja_uk UNIQUE (id, igreja_id),
    CONSTRAINT culto_horarios_campus_dia_hora_uk UNIQUE (campus_id, dia_semana, hora)
);

CREATE INDEX IF NOT EXISTS idx_culto_horarios_igreja ON public.culto_horarios (igreja_id, ativo);

-- 3. Contagens (uma por horário e data)
CREATE TABLE IF NOT EXISTS public.culto_contagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL,
    horario_id UUID NOT NULL,
    data_culto DATE NOT NULL,
    adultos INTEGER NOT NULL DEFAULT 0 CHECK (adultos BETWEEN 0 AND 100000),
    criancas INTEGER NOT NULL DEFAULT 0 CHECK (criancas BETWEEN 0 AND 100000),
    voluntarios INTEGER NOT NULL DEFAULT 0 CHECK (voluntarios BETWEEN 0 AND 100000),
    conversoes INTEGER NOT NULL DEFAULT 0 CHECK (conversoes BETWEEN 0 AND 100000),
    reconciliacoes INTEGER NOT NULL DEFAULT 0 CHECK (reconciliacoes BETWEEN 0 AND 100000),
    convidados INTEGER NOT NULL DEFAULT 0 CHECK (convidados BETWEEN 0 AND 100000),
    -- Total calculado pelo banco: adultos + crianças (voluntários ficam à parte)
    total INTEGER GENERATED ALWAYS AS (adultos + criancas) STORED,
    observacao TEXT CHECK (observacao IS NULL OR char_length(observacao) <= 500),
    lancado_por UUID REFERENCES public.membros(id) ON DELETE SET NULL,
    atualizado_por UUID REFERENCES public.membros(id) ON DELETE SET NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT culto_contagens_horario_fk
        FOREIGN KEY (horario_id, igreja_id) REFERENCES public.culto_horarios (id, igreja_id) ON DELETE RESTRICT,
    CONSTRAINT culto_contagens_horario_data_uk UNIQUE (horario_id, data_culto)
);

CREATE INDEX IF NOT EXISTS idx_culto_contagens_igreja_data
    ON public.culto_contagens (igreja_id, data_culto DESC);

-- 4. RLS: bloqueia acesso direto (somente via API com service role)
ALTER TABLE public.campus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culto_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.culto_contagens ENABLE ROW LEVEL SECURITY;

-- 5. Permissão especial: Gestor de Culto (concedida a pessoas, sem depender de cargo)
INSERT INTO public.permissoes (codigo, nome, modulo, descricao)
VALUES (
    'culto:gerenciar',
    'Gestor de Culto',
    'Cultos',
    'Cadastrar campus e horários de culto e lançar a contagem de pessoas de cada culto.'
)
ON CONFLICT (codigo) DO NOTHING;
