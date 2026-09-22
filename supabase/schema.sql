-- ==============================================================================
-- APPCHURCH - SCHEMA RELACIONAL PARA SUPABASE (POSTGRESQL)
-- Versão com IDs Únicos (UUID) e Integridade Relacional Nativa
-- ==============================================================================
-- Estrutura relacional contendo:
-- 1. Extensões UUID (uuid-ossp / pgcrypto)
-- 2. Tabela de Igrejas (churches) - Multi-Tenant com ID UUID
-- 3. Tabela de Funções (roles) - Hierarquia e badges com ID UUID
-- 4. Tabela de Permissões (permissions) + Mapeamento (role_permissions) com IDs UUID
-- 5. Tabela de Células (cells) - Vínculo por igreja_id UUID
-- 6. Tabela de Membros (members) - Vínculo obrigatório a igreja_id e celula_id UUID
-- 7. Tabela de Trilho de Liderança (track_steps) + Progresso (member_track_steps & leadership_tracks)
-- 8. Tabelas de Comunhão (feed_posts & post_comments & announcements) com IDs UUID
-- 9. Views Relacionais e RLS (Row Level Security)
-- 10. Seed inicial com UUIDs determinísticos
-- ==============================================================================

-- 0. Habilitar extensões para geração de UUIDs únicos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpar views anteriores (se existirem)
DROP VIEW IF EXISTS public.vw_member_leadership_track CASCADE;
DROP VIEW IF EXISTS public.vw_cell_members_full CASCADE;

-- ==============================================================================
-- 1. TABELA DE IGREJAS (MULTI-TENANT / CONGREGAÇÕES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.churches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    cnpj TEXT,
    cidade TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'CE',
    url_logo TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS cnpj TEXT;

-- ==============================================================================
-- 2. TABELA DE FUNÇÕES (ROLES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT UNIQUE NOT NULL, -- ex: 'Pastor', 'Líder de Setor', 'Líder de Célula', 'Membro'
    slug TEXT UNIQUE NOT NULL,
    descricao TEXT,
    nivel_hierarquia INTEGER DEFAULT 1, -- 1: Membro, 2: Líder Treinamento, 3: Líder Célula, 4: Líder Setor, 5: Pastor
    cor_distintivo TEXT DEFAULT '#0a2540',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3. TABELA DE PERMISSÕES (PERMISSIONS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL, -- ex: 'cell:manage', 'track:update', 'feed:post'
    nome TEXT NOT NULL,
    modulo TEXT NOT NULL, -- 'Célula', 'Membros', 'Frequência', 'Trilho', 'Relatórios', 'Feed', 'Admin'
    descricao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Relação Função <-> Permissões (Define permissões herdadas por cada Função)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    funcao_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permissao_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (funcao_id, permissao_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_funcao ON public.role_permissions(funcao_id);

-- ==============================================================================
-- 4. TABELA DE CÉLULAS (LIFEGROUPS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    nome_lider TEXT NOT NULL,
    nome_setor TEXT NOT NULL,
    endereco TEXT NOT NULL,
    dia_reuniao TEXT NOT NULL, -- ex: 'Quinta-feira'
    horario_reuniao TEXT NOT NULL, -- ex: '19:30'
    quantidade_membros INTEGER DEFAULT 0,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cells_igreja_id ON public.cells(igreja_id);
CREATE INDEX IF NOT EXISTS idx_cells_nome ON public.cells(nome);

-- ==============================================================================
-- 5. TABELA DE MEMBROS (MEMBERS)
-- Pertencem a uma Igreja (igreja_id) e a uma Célula (celula_id) com ID Único UUID
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    celula_id UUID REFERENCES public.cells(id) ON DELETE SET NULL,
    funcao_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
    funcao TEXT NOT NULL DEFAULT 'Membro', -- Nome da função desnormalizado para consultas ágeis
    nome TEXT NOT NULL,
    login TEXT UNIQUE, -- Login exclusivo para autenticação na aplicação (não pode repetir)
    senha_hash TEXT, -- Senha criptografada ou texto de acesso para validação no login
    bairro TEXT,
    aniversario TEXT, -- formato dd/MM
    telefone TEXT,
    email TEXT,
    status_frequencia TEXT NOT NULL DEFAULT 'green', -- 'green' (alta), 'yellow' (atenção), 'red' (crítica), 'black' (afastado)
    percentual_frequencia INTEGER NOT NULL DEFAULT 100,
    url_avatar TEXT,
    observacoes TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantir colunas adicionadas mesmo caso a tabela já exista anteriormente
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'members') THEN
        ALTER TABLE public.members ALTER COLUMN celula_id DROP NOT NULL;
        ALTER TABLE public.members ADD COLUMN IF NOT EXISTS login TEXT UNIQUE;
        ALTER TABLE public.members ADD COLUMN IF NOT EXISTS senha_hash TEXT;
        ALTER TABLE public.members ADD COLUMN IF NOT EXISTS status_frequencia TEXT NOT NULL DEFAULT 'green';
        ALTER TABLE public.members ADD COLUMN IF NOT EXISTS percentual_frequencia INTEGER NOT NULL DEFAULT 100;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_members_igreja_id ON public.members(igreja_id);
CREATE INDEX IF NOT EXISTS idx_members_celula_id ON public.members(celula_id);
CREATE INDEX IF NOT EXISTS idx_members_funcao_id ON public.members(funcao_id);
CREATE INDEX IF NOT EXISTS idx_members_login ON public.members(login);

-- Permissões personalizadas por membro (exceções além da função padrão)
CREATE TABLE IF NOT EXISTS public.member_permissions (
    membro_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    permissao_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    concedida BOOLEAN NOT NULL DEFAULT true,
    concedida_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (membro_id, permissao_id)
);

CREATE INDEX IF NOT EXISTS idx_member_permissions_membro ON public.member_permissions(membro_id);

-- ==============================================================================
-- 6. TABELA DE TRILHO DE LIDERANÇA (TRACK_STEPS & MEMBER_TRACK_STEPS)
-- ==============================================================================

-- Catálogo oficial das etapas do Trilho
CREATE TABLE IF NOT EXISTS public.track_steps (
    id INTEGER PRIMARY KEY, -- 1 a 6
    numero_etapa INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    obrigatoria BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Registro individual de cada etapa realizada pelo Membro
CREATE TABLE IF NOT EXISTS public.member_track_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membro_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    celula_id UUID NOT NULL REFERENCES public.cells(id) ON DELETE CASCADE,
    etapa_id INTEGER NOT NULL REFERENCES public.track_steps(id) ON DELETE CASCADE,
    concluida BOOLEAN NOT NULL DEFAULT false,
    concluida_em TEXT, -- Data de conclusão (dd/MM/AAAA)
    observacoes TEXT,
    validado_por TEXT, -- Líder ou Pastor que validou a etapa
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(membro_id, etapa_id)
);

CREATE INDEX IF NOT EXISTS idx_member_track_steps_membro ON public.member_track_steps(membro_id);
CREATE INDEX IF NOT EXISTS idx_member_track_steps_celula ON public.member_track_steps(celula_id);

-- Visão agregada do Trilho por Membro
CREATE TABLE IF NOT EXISTS public.leadership_tracks (
    membro_id UUID PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
    igreja_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    celula_id UUID NOT NULL REFERENCES public.cells(id) ON DELETE CASCADE,
    etapa_atual_id INTEGER NOT NULL DEFAULT 1,
    quantidade_etapas_concluidas INTEGER NOT NULL DEFAULT 0,
    quantidade_total_etapas INTEGER NOT NULL DEFAULT 6,
    percentual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'em_andamento', -- 'iniciante', 'em_andamento', 'formado'
    dados_etapas JSONB NOT NULL DEFAULT '[]'::jsonb,
    observacoes TEXT,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leadership_tracks_celula ON public.leadership_tracks(celula_id);
CREATE INDEX IF NOT EXISTS idx_leadership_tracks_igreja ON public.leadership_tracks(igreja_id);

-- ==============================================================================
-- 7. TABELAS DE COMUNHÃO & AVISOS (FEED & ANNOUNCEMENTS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.feed_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    celula_id UUID REFERENCES public.cells(id) ON DELETE SET NULL,
    nome_celula TEXT NOT NULL,
    nome_autor TEXT NOT NULL,
    funcao_autor TEXT NOT NULL,
    avatar_autor TEXT,
    legenda TEXT NOT NULL,
    url_imagem TEXT,
    categoria TEXT DEFAULT 'Célula',
    quantidade_curtidas INTEGER DEFAULT 0,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feed_posts_igreja ON public.feed_posts(igreja_id);

CREATE TABLE IF NOT EXISTS public.post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    nome_autor TEXT NOT NULL,
    funcao_autor TEXT NOT NULL,
    avatar_autor TEXT,
    conteudo TEXT NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments(post_id);

CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    url_imagem TEXT,
    nome_autor TEXT NOT NULL,
    funcao_autor TEXT NOT NULL,
    avatar_autor TEXT,
    data_evento TEXT,
    horario_evento TEXT,
    localizacao TEXT,
    categoria TEXT NOT NULL DEFAULT 'Geral',
    importante BOOLEAN DEFAULT false,
    quantidade_confirmados INTEGER DEFAULT 0,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_igreja ON public.announcements(igreja_id);

-- ==============================================================================
-- 8. FUNÇÕES RPC E VIEWS RELACIONAIS (CONSULTAS PRONTAS)
-- ==============================================================================

-- Função RPC para atualizar a contagem de membros de uma célula automaticamente
CREATE OR REPLACE FUNCTION public.increment_cell_member_count(cell_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.cells
    SET quantidade_membros = (SELECT count(*) FROM public.members WHERE celula_id = cell_id)
    WHERE id = cell_id;
END;
$$;

-- View Completa: Célula -> Membro -> Função -> Permissões -> Trilho
CREATE OR REPLACE VIEW public.vw_cell_members_full AS
SELECT 
    m.id AS membro_id,
    m.nome AS nome_membro,
    m.login,
    m.bairro,
    m.aniversario,
    m.telefone,
    m.email,
    m.status_frequencia,
    m.percentual_frequencia,
    c.id AS celula_id,
    c.nome AS nome_celula,
    c.nome_setor,
    c.igreja_id,
    r.id AS funcao_id,
    r.nome AS nome_funcao,
    r.nivel_hierarquia,
    COALESCE(lt.etapa_atual_id, 1) AS etapa_atual_trilho_id,
    COALESCE(lt.percentual, 0) AS percentual_trilho,
    COALESCE(lt.quantidade_etapas_concluidas, 0) AS etapas_trilho_concluidas,
    COALESCE(
        (SELECT jsonb_agg(p.codigo)
         FROM public.role_permissions rp
         JOIN public.permissions p ON p.id = rp.permissao_id
         WHERE rp.funcao_id = r.id), '[]'::jsonb
    ) AS codigos_permissoes_funcao
FROM public.members m
JOIN public.cells c ON c.id = m.celula_id
LEFT JOIN public.roles r ON r.id = m.funcao_id
LEFT JOIN public.leadership_tracks lt ON lt.membro_id = m.id;

-- View de Detalhes do Trilho por Membro
CREATE OR REPLACE VIEW public.vw_member_leadership_track AS
SELECT
    m.id AS membro_id,
    m.nome AS nome_membro,
    c.nome AS nome_celula,
    ts.id AS etapa_id,
    ts.numero_etapa,
    ts.titulo AS titulo_etapa,
    ts.descricao AS descricao_etapa,
    COALESCE(mts.concluida, false) AS concluida,
    mts.concluida_em,
    mts.observacoes AS observacoes_etapa,
    mts.validado_por
FROM public.members m
JOIN public.cells c ON c.id = m.celula_id
CROSS JOIN public.track_steps ts
LEFT JOIN public.member_track_steps mts ON mts.membro_id = m.id AND mts.etapa_id = ts.id
ORDER BY m.nome, ts.numero_etapa;

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_track_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leadership_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
DROP POLICY IF EXISTS "Leitura pública de igrejas" ON public.churches;
DROP POLICY IF EXISTS "Acesso a igrejas" ON public.churches;
DROP POLICY IF EXISTS "Leitura pública de funções" ON public.roles;
DROP POLICY IF EXISTS "Acesso a funções" ON public.roles;
DROP POLICY IF EXISTS "Leitura pública de permissões" ON public.permissions;
DROP POLICY IF EXISTS "Acesso a permissões" ON public.permissions;
DROP POLICY IF EXISTS "Leitura pública de permissões por função" ON public.role_permissions;
DROP POLICY IF EXISTS "Acesso a permissões por função" ON public.role_permissions;
DROP POLICY IF EXISTS "Leitura pública do catálogo de trilho" ON public.track_steps;
DROP POLICY IF EXISTS "Acesso ao catálogo de trilho" ON public.track_steps;
DROP POLICY IF EXISTS "Acesso a células por igreja" ON public.cells;
DROP POLICY IF EXISTS "Acesso a membros por célula/igreja" ON public.members;
DROP POLICY IF EXISTS "Acesso a permissões de membros" ON public.member_permissions;
DROP POLICY IF EXISTS "Acesso a etapas de trilho dos membros" ON public.member_track_steps;
DROP POLICY IF EXISTS "Acesso ao resumo de trilho dos membros" ON public.leadership_tracks;
DROP POLICY IF EXISTS "Acesso a posts do feed" ON public.feed_posts;
DROP POLICY IF EXISTS "Acesso a comentários" ON public.post_comments;
DROP POLICY IF EXISTS "Acesso a anúncios" ON public.announcements;

CREATE POLICY "Acesso a igrejas" ON public.churches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a funções" ON public.roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a permissões" ON public.permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a permissões por função" ON public.role_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso ao catálogo de trilho" ON public.track_steps FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Acesso a células por igreja" ON public.cells FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a membros por célula/igreja" ON public.members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a permissões de membros" ON public.member_permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a etapas de trilho dos membros" ON public.member_track_steps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso ao resumo de trilho dos membros" ON public.leadership_tracks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a posts do feed" ON public.feed_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a comentários" ON public.post_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a anúncios" ON public.announcements FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 10. DADOS INICIAIS (SEED COM IDENTIFICADORES ÚNICOS UUID)
-- ==============================================================================

-- 10.1 Igrejas (Multi-Tenant)
INSERT INTO public.churches (id, nome, slug, cidade, estado)
VALUES 
    ('a1000000-0000-0000-0000-000000000001', 'Paz Church Sobral', 'sobral', 'Sobral', 'CE'),
    ('a1000000-0000-0000-0000-000000000002', 'Paz Church Jaibaras', 'jaibaras', 'Jaibaras (Sobral)', 'CE'),
    ('a1000000-0000-0000-0000-000000000003', 'Paz Church Forquilha', 'forquilha', 'Forquilha', 'CE')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- 10.2 Tabela de Funções (Roles)
INSERT INTO public.roles (id, nome, slug, descricao, nivel_hierarquia, cor_distintivo)
VALUES
    ('b2000000-0000-0000-0000-000000000001', 'Pastor', 'pastor', 'Pastoreio geral, supervisão de redes e liderança espiritual.', 5, '#1e3a8a'),
    ('b2000000-0000-0000-0000-000000000002', 'Supervisor', 'supervisor', 'Supervisão de múltiplos setores e áreas de expansão.', 5, '#1e3a8a'),
    ('b2000000-0000-0000-0000-000000000003', 'Líder de Setor', 'lider-setor', 'Coordenação e mentoria de um grupo de células.', 4, '#052447'),
    ('b2000000-0000-0000-0000-000000000004', 'Líder de Célula', 'lider-celula', 'Liderança ativa, pastoreio semanal e multiplicação.', 3, '#6b21a8'),
    ('b2000000-0000-0000-0000-000000000005', 'Líder em Treinamento', 'lider-treinamento', 'Auxílio na liderança, preparação ministerial e CTL.', 2, '#0284c7'),
    ('b2000000-0000-0000-0000-000000000006', 'Anfitrião', 'anfitriao', 'Responsável pela recepção e acolhimento no lar da célula.', 1, '#059669'),
    ('b2000000-0000-0000-0000-000000000007', 'Secretário', 'secretario', 'Controle de frequência, relatórios e datas de aniversário.', 1, '#d97706'),
    ('b2000000-0000-0000-0000-000000000008', 'Intercessor', 'intercessor', 'Ministério de oração e cobertura espiritual da célula.', 1, '#dc2626'),
    ('b2000000-0000-0000-0000-000000000009', 'Membro', 'membro', 'Membro ativo participante dos encontros semanais.', 1, '#0a2540')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao;

-- 10.3 Tabela de Permissões (Permissions)
INSERT INTO public.permissions (id, codigo, nome, modulo, descricao)
VALUES
    ('c3000000-0000-0000-0000-000000000001', 'cell:view', 'Visualizar Célula', 'Célula', 'Visualizar informações da própria célula.'),
    ('c3000000-0000-0000-0000-000000000002', 'cell:manage', 'Gerenciar Célula', 'Célula', 'Editar horários, endereço e dados da célula.'),
    ('c3000000-0000-0000-0000-000000000003', 'member:create', 'Adicionar Membros', 'Membros', 'Cadastrar novos membros na célula.'),
    ('c3000000-0000-0000-0000-000000000004', 'member:edit', 'Editar Membros', 'Membros', 'Alterar dados de membros da célula.'),
    ('c3000000-0000-0000-0000-000000000005', 'member:delete', 'Remover Membros', 'Membros', 'Arquivar ou excluir membros da célula.'),
    ('c3000000-0000-0000-0000-000000000006', 'attendance:view', 'Ver Frequência', 'Frequência', 'Visualizar histórico de frequência dos membros.'),
    ('c3000000-0000-0000-0000-000000000007', 'attendance:edit', 'Lançar Frequência', 'Frequência', 'Alterar status e percentual de frequência semanal.'),
    ('c3000000-0000-0000-0000-000000000008', 'track:view', 'Visualizar Trilho', 'Trilho', 'Ver etapas do trilho de liderança dos membros.'),
    ('c3000000-0000-0000-0000-000000000009', 'track:update', 'Avançar Etapas do Trilho', 'Trilho', 'Marcar etapas do trilho como concluídas.'),
    ('c3000000-0000-0000-0000-000000000010', 'reports:view', 'Visualizar Relatórios', 'Relatórios', 'Acessar relatórios de multiplicação e frequência.'),
    ('c3000000-0000-0000-0000-000000000011', 'feed:post', 'Publicar no Feed', 'Feed', 'Compartilhar fotos e testemunhos no feed da igreja.'),
    ('c3000000-0000-0000-0000-000000000012', 'announcements:manage', 'Publicar Avisos Gerais', 'Admin', 'Postar comunicados oficiais para toda a congregação.')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- 10.4 Mapeamento de Funções x Permissões (role_permissions)
INSERT INTO public.role_permissions (funcao_id, permissao_id)
VALUES
    -- Líder de Setor
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000002'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000003'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000004'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000005'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000006'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000007'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000008'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000009'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000010'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000011'),
    ('b2000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000012'),

    -- Líder de Célula
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000002'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000003'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000004'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000006'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000007'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000008'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000009'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000010'),
    ('b2000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000011'),

    -- Líder em Treinamento
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000003'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000006'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000007'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000008'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000011'),

    -- Secretário
    ('b2000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000003'),
    ('b2000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000006'),
    ('b2000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000007'),

    -- Membro
    ('b2000000-0000-0000-0000-000000000009', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000009', 'c3000000-0000-0000-0000-000000000008'),
    ('b2000000-0000-0000-0000-000000000009', 'c3000000-0000-0000-0000-000000000011')
ON CONFLICT (funcao_id, permissao_id) DO NOTHING;

-- 10.5 Catálogo Oficial das 6 Etapas do Trilho
INSERT INTO public.track_steps (id, numero_etapa, titulo, descricao, obrigatoria)
VALUES
    (1, 1, 'Integração & Boas-Vindas', 'Recepção na célula, cadastro de dados e consolidação inicial do novo membro.', true),
    (2, 2, 'Batismo nas Águas', 'Profissão pública de fé e testemunho cristão perante a congregação.', true),
    (3, 3, 'Encontro com Deus', 'Fim de semana de cura interior, libertação e renovação no Espírito Santo.', true),
    (4, 4, 'Pós-Encontro & Maturidade', 'Aprofundamento na oração, disciplina do jejum e leitura bíblica diária.', true),
    (5, 5, 'Escola de Líderes / CTL', 'Curso de Treinamento de Líderes: capacitação bíblica e prática para liderança celular.', true),
    (6, 6, 'Líder em Treinamento & Envio', 'Prática de ministração, pastoreio de vidas e multiplicação frutífera de célula.', true)
ON CONFLICT (id) DO UPDATE SET titulo = EXCLUDED.titulo, descricao = EXCLUDED.descricao;

-- 10.6 Tabela de Células (Sobral e Jaibaras com UUID)
INSERT INTO public.cells (id, igreja_id, nome, nome_lider, nome_setor, endereco, dia_reuniao, horario_reuniao, quantidade_membros)
VALUES
    ('d4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Adonai', 'Junio Fonteles', 'Fire', 'Rua Sumaré, 245 - Junco', 'Quinta-feira', '19:30', 12),
    ('d4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Shalom', 'Priscila Vasconcelos', 'Fire', 'Av. Perimetral, 810 - Centro', 'Sexta-feira', '20:00', 9),
    ('d4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Betel', 'Marcos Vinícius', 'Radicais', 'Rua das Flores, 112 - Expectativa', 'Sábado', '18:00', 14),
    ('d4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'Emanuel', 'Carlos Mendes', 'Setor Central', 'Rua Principal, 150 - Jaibaras', 'Quinta-feira', '19:30', 10),
    ('d4000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'Maranata', 'Francisca Sousa', 'Setor Alto', 'Rua São José, 78 - Jaibaras', 'Sexta-feira', '19:00', 8)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, nome_lider = EXCLUDED.nome_lider;

-- 10.7 Tabela de Membros (Com ID Único UUID, Login Exclusivo e Senha de Acesso)
INSERT INTO public.members (
    id, igreja_id, celula_id, funcao_id, funcao, nome, login, senha_hash, bairro, aniversario, telefone, status_frequencia, percentual_frequencia, observacoes
)
VALUES
    ('e5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'Líder de Setor', 'Junio Fonteles', 'jfonteles', '123456', 'Junco', '13/09', '(88) 99801-4422', 'green', 100, 'Líder de Setor e anfitrião da célula.'),
    ('e5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'Líder de Setor', 'Raiane Plácido', 'raiane.placido', '123456', 'Junco', '08/03', '(88) 99712-8811', 'green', 100, 'Líder de Setor, discipuladora e louvor.'),
    ('e5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'Andrine Rodrigues', 'andrine.rodrigues', '123456', 'Novo Recanto', '15/03', '(88) 99656-7845', 'green', 90, 'Presente em todas as reuniões.'),
    ('e5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000005', 'Líder em Treinamento', 'Jamilly Costa', 'jamilly.costa', '123456', 'Domingos Olímpio', '10/07', '(88) 99888-2121', 'green', 95, 'Fazendo Escola de Líderes módulo 3.'),
    ('e5000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'José Filho', 'jose.filho', '123456', 'Dom Expedito', '08/04', '(88) 99777-3344', 'green', 90, 'Muito pontual e atuante no quebra-gelo.'),
    ('e5000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'Gleice Kelly', 'gleice.kelly', '123456', 'Parque Silvana', '26/04', '(88) 99666-5544', 'green', 90, 'Atuante no lanche e recepção.'),
    ('e5000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'Davi Melo', 'davi.melo', '123456', 'Junco', '15/05', '(88) 99444-1122', 'green', 95, 'Ministro de louvor da célula.'),
    ('e5000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'Adriana Gama', 'adriana.gama', '123456', 'Centro', '22/05', '(88) 99222-3344', 'green', 85, 'Discipulanda da Raiane.'),
    ('e5000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'Danillo Fernandes', 'danillo.fernandes', '123456', 'Junco', '01/06', '(88) 99333-7788', 'green', 90, 'Participa do ministério de teatro.'),
    ('e5000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000005', 'Líder em Treinamento', 'Caio Pantaleão', 'caio.pantaleao', '123456', 'Campo dos Velhos', '06/06', '(88) 99111-2233', 'green', 95, 'Preparando-se para multiplicação.'),
    ('e5000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'Lara Beatriz', 'lara.beatriz', '123456', 'Sintra', '12/06', '(88) 99822-1199', 'green', 90, 'Participante do grupo de dança.'),
    ('e5000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'Maria Clara', 'maria.clara', '123456', 'Pedrinhas', '20/06', '(88) 99744-5566', 'green', 85, 'Batizada recentemente.')
ON CONFLICT (id) DO UPDATE SET 
    funcao_id = EXCLUDED.funcao_id,
    funcao = EXCLUDED.funcao,
    nome = EXCLUDED.nome,
    login = EXCLUDED.login,
    senha_hash = EXCLUDED.senha_hash,
    bairro = EXCLUDED.bairro,
    telefone = EXCLUDED.telefone,
    status_frequencia = EXCLUDED.status_frequencia,
    percentual_frequencia = EXCLUDED.percentual_frequencia;

-- 10.8 Etapas do Trilho dos Membros (member_track_steps)
INSERT INTO public.member_track_steps (id, membro_id, celula_id, etapa_id, concluida, concluida_em, observacoes, validado_por)
VALUES
    ('f6000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000001', 1, true, '12/03/2024', 'Recepção e consolidação', 'Junio Fonteles'),
    ('f6000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000001', 2, true, '18/05/2024', 'Batizada na Igreja Sede', 'Pr. Local'),
    ('f6000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000001', 3, true, '14/08/2024', '44º Encontro com Deus', 'Junio Fonteles'),
    ('f6000000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000001', 4, true, '20/11/2024', '10 lições de maturidade concluídas', 'Raiane Plácido'),
    ('f6000000-0000-0000-0000-000000000005', 'e5000000-0000-0000-0000-000000000010', 'd4000000-0000-0000-0000-000000000001', 1, true, '10/01/2024', 'Cadastrado e integrado', 'Junio Fonteles'),
    ('f6000000-0000-0000-0000-000000000006', 'e5000000-0000-0000-0000-000000000010', 'd4000000-0000-0000-0000-000000000001', 2, true, '20/03/2024', 'Batismo nas águas', 'Pr. Local'),
    ('f6000000-0000-0000-0000-000000000007', 'e5000000-0000-0000-0000-000000000010', 'd4000000-0000-0000-0000-000000000001', 3, true, '15/07/2024', 'Encontro com Deus realizado', 'Junio Fonteles'),
    ('f6000000-0000-0000-0000-000000000008', 'e5000000-0000-0000-0000-000000000010', 'd4000000-0000-0000-0000-000000000001', 4, true, '10/10/2024', 'Pós-Encontro concluído', 'Junio Fonteles')
ON CONFLICT (membro_id, etapa_id) DO UPDATE SET 
    concluida = EXCLUDED.concluida,
    concluida_em = EXCLUDED.concluida_em,
    observacoes = EXCLUDED.observacoes;

-- 10.9 Resumo do Trilho por Membro (leadership_tracks)
INSERT INTO public.leadership_tracks (
    membro_id, igreja_id, celula_id, etapa_atual_id, quantidade_etapas_concluidas, quantidade_total_etapas, percentual, status
)
VALUES
    ('e5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 5, 4, 6, 67, 'em_andamento'),
    ('e5000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 5, 4, 6, 67, 'em_andamento'),
    ('e5000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 4, 3, 6, 50, 'em_andamento'),
    ('e5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 6, 6, 6, 100, 'formado'),
    ('e5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 6, 6, 6, 100, 'formado')
ON CONFLICT (membro_id) DO UPDATE SET 
    etapa_atual_id = EXCLUDED.etapa_atual_id,
    quantidade_etapas_concluidas = EXCLUDED.quantidade_etapas_concluidas,
    percentual = EXCLUDED.percentual;

-- 10.10 Posts Iniciais do Feed (feed_posts)
INSERT INTO public.feed_posts (
    id, igreja_id, celula_id, nome_celula, nome_autor, funcao_autor, avatar_autor, legenda, categoria, quantidade_curtidas
)
VALUES
    (
        '77000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001',
        'd4000000-0000-0000-0000-000000000001',
        'Adonai',
        'Junio Fonteles',
        'Líder de Setor',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        'Noite tremenda de comunhão e oração fervorosa na Célula Adonai! Tivemos a presença de 2 novos visitantes que aceitaram a Cristo. Deus é fiel!',
        'Célula',
        12
    ),
    (
        '77000000-0000-0000-0000-000000000002',
        'a1000000-0000-0000-0000-000000000001',
        'd4000000-0000-0000-0000-000000000002',
        'Shalom',
        'Priscila Vasconcelos',
        'Líder de Célula',
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
        'Estudo maravilhoso sobre o Fruto do Espírito na Casa da Irmã Cláudia. Comunhão doce e coração cheio de gratidão!',
        'Comunhão',
        8
    )
ON CONFLICT (id) DO NOTHING;

-- 10.11 Comentários Iniciais (post_comments)
INSERT INTO public.post_comments (
    id, post_id, nome_autor, funcao_autor, avatar_autor, conteudo
)
VALUES
    (
        '88000000-0000-0000-0000-000000000001',
        '77000000-0000-0000-0000-000000000001',
        'Raiane Plácido',
        'Líder de Setor',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        'Glória a Deus por essa noite linda! Vamos cuidar com muito amor desses novos discípulos.'
    )
ON CONFLICT (id) DO NOTHING;

-- 10.12 Avisos Oficiais (announcements)
INSERT INTO public.announcements (
    id, igreja_id, titulo, conteudo, nome_autor, funcao_autor, avatar_autor, data_evento, horario_evento, localizacao, categoria, importante, quantidade_confirmados
)
VALUES
    (
        '99000000-0000-0000-0000-000000000001',
        'a1000000-0000-0000-0000-000000000001',
        '45º Encontro com Deus - Inscrições Abertas!',
        'Atenção líderes e discípulos: as inscrições para o próximo Encontro com Deus já estão disponíveis. Prepare sua caravana!',
        'Pastor Sênior',
        'Pastor',
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
        '10 a 12 de Outubro',
        '18:00',
        'Acampamento Vale da Bênção',
        'Encontro com Deus',
        true,
        45
    )
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- FIM DO SCRIPT DE SCHEMA
-- ==============================================================================
