-- ==============================================================================
-- Migração: Presença dos Líderes no TADEL
-- Data: 2026-10-07
--
-- Cada igreja configura os seus horários de TADEL (um ou mais por semana) e quais
-- níveis da hierarquia precisam registrar presença. O líder registra presença
-- apertando um botão no app durante a janela de um dos horários; basta comparecer
-- a UM horário por semana (restrição única por membro + semana).
--
-- Acesso: RLS habilitado sem políticas para anon/authenticated. Todo acesso passa
-- pelas rotas /api/tadel*, que usam a service role e validam a sessão no servidor.
-- ==============================================================================

-- 1. Configuração geral do TADEL por igreja (1:1 com igrejas)
CREATE TABLE IF NOT EXISTS public.tadel_configuracoes (
    igreja_id UUID PRIMARY KEY REFERENCES public.igrejas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL DEFAULT 'TADEL',
    -- Níveis (nivel_tipo.id) cujos líderes devem registrar presença.
    -- NULL = padrão: os dois níveis mais baixos da hierarquia (ex.: Célula e Setor).
    niveis_participantes UUID[],
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Horários semanais do TADEL (N por igreja)
CREATE TABLE IF NOT EXISTS public.tadel_horarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0 = domingo ... 6 = sábado
    hora_inicio TIME NOT NULL,
    minutos_antes INT NOT NULL DEFAULT 30 CHECK (minutos_antes BETWEEN 0 AND 720),
    minutos_depois INT NOT NULL DEFAULT 120 CHECK (minutos_depois BETWEEN 0 AND 720),
    local TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tadel_horarios_igreja ON public.tadel_horarios(igreja_id);

-- 3. Presenças (1 por líder por semana)
CREATE TABLE IF NOT EXISTS public.tadel_presencas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    membro_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
    horario_id UUID REFERENCES public.tadel_horarios(id) ON DELETE SET NULL,
    -- Semana no padrão do app (domingo a sábado), identificada pelo ano/semana ISO
    -- da quarta-feira da semana — o mesmo critério do Relatório Semanal.
    ano_semana SMALLINT NOT NULL,
    numero_semana SMALLINT NOT NULL,
    data_encontro DATE NOT NULL,
    metodo TEXT NOT NULL DEFAULT 'app',
    registrado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_tadel_presenca_membro_semana UNIQUE (membro_id, ano_semana, numero_semana)
);

CREATE INDEX IF NOT EXISTS idx_tadel_presencas_igreja_semana
    ON public.tadel_presencas(igreja_id, ano_semana, numero_semana);

-- 4. RLS: bloqueia acesso direto (somente via API com service role)
ALTER TABLE public.tadel_configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tadel_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tadel_presencas ENABLE ROW LEVEL SECURITY;

-- 5. Permissão para configurar o TADEL (Pastor/Administrador já herdam todas)
INSERT INTO public.permissoes (codigo, nome, modulo, descricao)
VALUES (
    'tadel:manage',
    'Configurar TADEL',
    'Administração',
    'Definir horários do TADEL, níveis que registram presença e acompanhar a frequência dos líderes.'
)
ON CONFLICT (codigo) DO NOTHING;
