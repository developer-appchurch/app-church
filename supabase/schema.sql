-- ==============================================================================
-- APPCHURCH - SCHEMA RELACIONAL PARA SUPABASE (POSTGRESQL)
-- Versão com colunas renomeadas para o português
-- ==============================================================================
-- Estrutura relacional contendo:
-- 1. Tabela de Células (cells)
-- 2. Tabela de Funções (roles)
-- 3. Tabela de Permissões (permissions) + Mapeamento (role_permissions)
-- 4. Tabela de Membros (members) [Pertencem a Células, com Função e Permissões]
-- 5. Tabela de Trilho de Liderança (track_steps) + Progresso (member_track_steps & leadership_tracks)
-- 6. Suporte a Multi-Igreja / Multi-Tenancy (churches)
-- 7. Views Relacionais e RLS (Row Level Security)
-- ==============================================================================

-- 0. Habilitar extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABELA DE IGREJAS (MULTI-TENANT / CONGREGAÇÕES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.churches (
    id TEXT PRIMARY KEY, -- ex: 'church-sobral', 'church-jaibaras'
    nome TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    cidade TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'CE',
    url_logo TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 2. TABELA DE CÉLULAS (LIFEGROUPS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cells (
    id TEXT PRIMARY KEY, -- ex: 'cell-adonai', 'cell-shalom'
    igreja_id TEXT NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
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
-- 3. TABELA DE FUNÇÕES (ROLES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY, -- ex: 'role-membro', 'role-lider-celula'
    nome TEXT UNIQUE NOT NULL, -- ex: 'Líder de Célula', 'Líder em Treinamento', 'Membro'
    slug TEXT UNIQUE NOT NULL,
    descricao TEXT,
    nivel_hierarquia INTEGER DEFAULT 1, -- 1: Membro, 2: Líder Treinamento, 3: Líder Célula, 4: Líder Setor, 5: Pastor
    cor_distintivo TEXT DEFAULT '#0a2540',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 4. TABELA DE PERMISSÕES (PERMISSIONS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.permissions (
    id TEXT PRIMARY KEY, -- ex: 'perm-manage-cell', 'perm-edit-attendance'
    codigo TEXT UNIQUE NOT NULL, -- ex: 'cell:manage', 'track:update'
    nome TEXT NOT NULL,
    modulo TEXT NOT NULL, -- 'Célula', 'Membros', 'Frequência', 'Trilho', 'Relatórios', 'Feed', 'Admin'
    descricao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Relação Função <-> Permissões (Define permissões herdadas por cada Função)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    funcao_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permissao_id TEXT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (funcao_id, permissao_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_funcao ON public.role_permissions(funcao_id);

-- ==============================================================================
-- 5. TABELA DE MEMBROS (MEMBERS)
-- Pertencem a uma Célula, possuem Função e Permissões
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.members (
    id TEXT PRIMARY KEY, -- ex: 'mem-1', 'mem-2'
    igreja_id TEXT NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    celula_id TEXT NOT NULL REFERENCES public.cells(id) ON DELETE CASCADE,
    funcao_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
    funcao TEXT NOT NULL DEFAULT 'Membro', -- Nome da função desnormalizado para consultas rápidas
    nome TEXT NOT NULL,
    login TEXT,
    senha_hash TEXT,
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

CREATE INDEX IF NOT EXISTS idx_members_igreja_id ON public.members(igreja_id);
CREATE INDEX IF NOT EXISTS idx_members_celula_id ON public.members(celula_id);
CREATE INDEX IF NOT EXISTS idx_members_funcao_id ON public.members(funcao_id);
CREATE INDEX IF NOT EXISTS idx_members_login ON public.members(login);

-- Permissões personalizadas/adicionais por membro (exceções além da função)
CREATE TABLE IF NOT EXISTS public.member_permissions (
    membro_id TEXT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    permissao_id TEXT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    concedida BOOLEAN NOT NULL DEFAULT true, -- Permite conceder ou revogar permissão específica
    concedida_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (membro_id, permissao_id)
);

CREATE INDEX IF NOT EXISTS idx_member_permissions_membro ON public.member_permissions(membro_id);

-- ==============================================================================
-- 6. TABELA DE TRILHO DE LIDERANÇA (TRACK_STEPS & MEMBER_TRACK_STEPS)
-- Etapas oficiais do Trilho e registro do que cada Membro já concluiu
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    membro_id TEXT NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    celula_id TEXT NOT NULL REFERENCES public.cells(id) ON DELETE CASCADE,
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
    membro_id TEXT PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
    igreja_id TEXT NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    celula_id TEXT NOT NULL REFERENCES public.cells(id) ON DELETE CASCADE,
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
    id TEXT PRIMARY KEY,
    igreja_id TEXT NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    celula_id TEXT REFERENCES public.cells(id) ON DELETE SET NULL,
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
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    nome_autor TEXT NOT NULL,
    funcao_autor TEXT NOT NULL,
    avatar_autor TEXT,
    conteudo TEXT NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.announcements (
    id TEXT PRIMARY KEY,
    igreja_id TEXT NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
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
-- 8. VIEWS RELACIONAIS (CONSULTAS PRONTAS)
-- ==============================================================================

-- View Completa: Célula -> Membro -> Função -> Permissões -> Trilho
CREATE OR REPLACE VIEW public.vw_cell_members_full AS
SELECT 
    m.id AS membro_id,
    m.nome AS nome_membro,
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
JOIN public.roles r ON r.id = m.funcao_id
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

-- Políticas de Acesso (Permitindo leitura/escrita conforme congregação e perfil)
CREATE POLICY "Leitura pública de igrejas" ON public.churches FOR SELECT USING (true);
CREATE POLICY "Leitura pública de funções" ON public.roles FOR SELECT USING (true);
CREATE POLICY "Leitura pública de permissões" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "Leitura pública de permissões por função" ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY "Leitura pública do catálogo de trilho" ON public.track_steps FOR SELECT USING (true);

CREATE POLICY "Acesso a células por igreja" ON public.cells FOR ALL USING (true);
CREATE POLICY "Acesso a membros por célula/igreja" ON public.members FOR ALL USING (true);
CREATE POLICY "Acesso a permissões de membros" ON public.member_permissions FOR ALL USING (true);
CREATE POLICY "Acesso a etapas de trilho dos membros" ON public.member_track_steps FOR ALL USING (true);
CREATE POLICY "Acesso ao resumo de trilho dos membros" ON public.leadership_tracks FOR ALL USING (true);
CREATE POLICY "Acesso a posts do feed" ON public.feed_posts FOR ALL USING (true);
CREATE POLICY "Acesso a comentários" ON public.post_comments FOR ALL USING (true);
CREATE POLICY "Acesso a anúncios" ON public.announcements FOR ALL USING (true);

-- ==============================================================================
-- 10. DADOS INICIAIS (SEED)
-- ==============================================================================

-- 10.1 Igrejas
INSERT INTO public.churches (id, nome, slug, cidade, estado)
VALUES 
    ('church-sobral', 'Paz Church Sobral', 'sobral', 'Sobral', 'CE'),
    ('church-jaibaras', 'Paz Church Jaibaras', 'jaibaras', 'Jaibaras (Sobral)', 'CE'),
    ('church-forquilha', 'Paz Church Forquilha', 'forquilha', 'Forquilha', 'CE')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- 10.2 Tabela de Funções (Roles)
INSERT INTO public.roles (id, nome, slug, descricao, nivel_hierarquia, cor_distintivo)
VALUES
    ('role-pastor', 'Pastor', 'pastor', 'Pastoreio geral, supervisão de redes e liderança espiritual.', 5, '#1e3a8a'),
    ('role-supervisor', 'Supervisor', 'supervisor', 'Supervisão de múltiplos setores e áreas de expansão.', 5, '#1e3a8a'),
    ('role-lider-setor', 'Líder de Setor', 'lider-setor', 'Coordenação e mentoria de um grupo de células.', 4, '#052447'),
    ('role-lider-celula', 'Líder de Célula', 'lider-celula', 'Liderança ativa, pastoreio semanal e multiplicação.', 3, '#6b21a8'),
    ('role-lider-treinamento', 'Líder em Treinamento', 'lider-treinamento', 'Auxílio na liderança, preparação ministerial e CTL.', 2, '#0284c7'),
    ('role-anfitriao', 'Anfitrião', 'anfitriao', 'Responsável pela recepção e acolhimento no lar da célula.', 1, '#059669'),
    ('role-secretario', 'Secretário', 'secretario', 'Controle de frequência, relatórios e datas de aniversário.', 1, '#d97706'),
    ('role-intercessor', 'Intercessor', 'intercessor', 'Ministério de oração e cobertura espiritual da célula.', 1, '#dc2626'),
    ('role-membro', 'Membro', 'membro', 'Membro ativo participante dos encontros semanais.', 1, '#0a2540')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao;

-- 10.3 Tabela de Permissões (Permissions)
INSERT INTO public.permissions (id, codigo, nome, modulo, descricao)
VALUES
    ('perm-cell-view', 'cell:view', 'Visualizar Célula', 'Célula', 'Visualizar informações da própria célula.'),
    ('perm-cell-manage', 'cell:manage', 'Gerenciar Célula', 'Célula', 'Editar horários, endereço e dados da célula.'),
    ('perm-member-create', 'member:create', 'Adicionar Membros', 'Membros', 'Cadastrar novos membros na célula.'),
    ('perm-member-edit', 'member:edit', 'Editar Membros', 'Membros', 'Alterar dados de membros da célula.'),
    ('perm-member-delete', 'member:delete', 'Remover Membros', 'Membros', 'Arquivar ou excluir membros da célula.'),
    ('perm-attendance-view', 'attendance:view', 'Ver Frequência', 'Frequência', 'Visualizar histórico de frequência dos membros.'),
    ('perm-attendance-edit', 'attendance:edit', 'Lançar Frequência', 'Frequência', 'Alterar status e percentual de frequência semanal.'),
    ('perm-track-view', 'track:view', 'Visualizar Trilho', 'Trilho', 'Ver etapas do trilho de liderança dos membros.'),
    ('perm-track-update', 'track:update', 'Avançar Etapas do Trilho', 'Trilho', 'Marcar etapas do trilho como concluídas.'),
    ('perm-reports-view', 'reports:view', 'Visualizar Relatórios', 'Relatórios', 'Acessar relatórios de multiplicação e frequência.'),
    ('perm-feed-post', 'feed:post', 'Publicar no Feed', 'Feed', 'Compartilhar fotos e testemunhos no feed da igreja.'),
    ('perm-announcements-manage', 'announcements:manage', 'Publicar Avisos Gerais', 'Admin', 'Postar comunicados oficiais para toda a congregação.')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- 10.4 Mapeamento de Funções x Permissões (role_permissions)
INSERT INTO public.role_permissions (funcao_id, permissao_id)
VALUES
    -- Líder de Setor (todas as permissões + avisos)
    ('role-lider-setor', 'perm-cell-view'),
    ('role-lider-setor', 'perm-cell-manage'),
    ('role-lider-setor', 'perm-member-create'),
    ('role-lider-setor', 'perm-member-edit'),
    ('role-lider-setor', 'perm-member-delete'),
    ('role-lider-setor', 'perm-attendance-view'),
    ('role-lider-setor', 'perm-attendance-edit'),
    ('role-lider-setor', 'perm-track-view'),
    ('role-lider-setor', 'perm-track-update'),
    ('role-lider-setor', 'perm-reports-view'),
    ('role-lider-setor', 'perm-feed-post'),
    ('role-lider-setor', 'perm-announcements-manage'),

    -- Líder de Célula (gestão completa da célula)
    ('role-lider-celula', 'perm-cell-view'),
    ('role-lider-celula', 'perm-cell-manage'),
    ('role-lider-celula', 'perm-member-create'),
    ('role-lider-celula', 'perm-member-edit'),
    ('role-lider-celula', 'perm-attendance-view'),
    ('role-lider-celula', 'perm-attendance-edit'),
    ('role-lider-celula', 'perm-track-view'),
    ('role-lider-celula', 'perm-track-update'),
    ('role-lider-celula', 'perm-reports-view'),
    ('role-lider-celula', 'perm-feed-post'),

    -- Líder em Treinamento (gestão assistida)
    ('role-lider-treinamento', 'perm-cell-view'),
    ('role-lider-treinamento', 'perm-member-create'),
    ('role-lider-treinamento', 'perm-attendance-view'),
    ('role-lider-treinamento', 'perm-attendance-edit'),
    ('role-lider-treinamento', 'perm-track-view'),
    ('role-lider-treinamento', 'perm-feed-post'),

    -- Secretário (frequência e cadastro)
    ('role-secretario', 'perm-cell-view'),
    ('role-secretario', 'perm-member-create'),
    ('role-secretario', 'perm-attendance-view'),
    ('role-secretario', 'perm-attendance-edit'),

    -- Membro (visualização e feed)
    ('role-membro', 'perm-cell-view'),
    ('role-membro', 'perm-track-view'),
    ('role-membro', 'perm-feed-post')
ON CONFLICT (funcao_id, permissao_id) DO NOTHING;

-- 10.5 Tabela de Trilho (Catálogo Oficial das 6 Etapas)
INSERT INTO public.track_steps (id, numero_etapa, titulo, descricao, obrigatoria)
VALUES
    (1, 1, 'Integração & Boas-Vindas', 'Recepção na célula, cadastro de dados e consolidação inicial do novo membro.', true),
    (2, 2, 'Batismo nas Águas', 'Profissão pública de fé e testemunho cristão perante a congregação.', true),
    (3, 3, 'Encontro com Deus', 'Fim de semana de cura interior, libertação e renovação no Espírito Santo.', true),
    (4, 4, 'Pós-Encontro & Maturidade', 'Aprofundamento na oração, disciplina do jejum e leitura bíblica diária.', true),
    (5, 5, 'Escola de Líderes / CTL', 'Curso de Treinamento de Líderes: capacitação bíblica e prática para liderança celular.', true),
    (6, 6, 'Líder em Treinamento & Envio', 'Prática de ministração, pastoreio de vidas e multiplicação frutífera de célula.', true)
ON CONFLICT (id) DO UPDATE SET titulo = EXCLUDED.titulo, descricao = EXCLUDED.descricao;

-- 10.6 Tabela de Células (Sobral e Jaibaras)
INSERT INTO public.cells (id, igreja_id, nome, nome_lider, nome_setor, endereco, dia_reuniao, horario_reuniao, quantidade_membros)
VALUES
    ('cell-adonai', 'church-sobral', 'Adonai', 'Junio Fonteles', 'Fire', 'Rua Sumaré, 245 - Junco', 'Quinta-feira', '19:30', 12),
    ('cell-shalom', 'church-sobral', 'Shalom', 'Priscila Vasconcelos', 'Fire', 'Av. Perimetral, 810 - Centro', 'Sexta-feira', '20:00', 9),
    ('cell-betel', 'church-sobral', 'Betel', 'Marcos Vinícius', 'Radicais', 'Rua das Flores, 112 - Expectativa', 'Sábado', '18:00', 14),
    ('cell-emanuel-jai', 'church-jaibaras', 'Emanuel', 'Carlos Mendes', 'Setor Central', 'Rua Principal, 150 - Jaibaras', 'Quinta-feira', '19:30', 10),
    ('cell-maranata-jai', 'church-jaibaras', 'Maranata', 'Francisca Sousa', 'Setor Alto', 'Rua São José, 78 - Jaibaras', 'Sexta-feira', '19:00', 8)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, nome_lider = EXCLUDED.nome_lider;

-- 10.7 Tabela de Membros (Dentro da Célula Adonai com suas Funções)
INSERT INTO public.members (
    id, igreja_id, celula_id, funcao_id, funcao, nome, login, bairro, aniversario, telefone, status_frequencia, percentual_frequencia, observacoes
)
VALUES
    ('mem-1', 'church-sobral', 'cell-adonai', 'role-lider-setor', 'Líder de Setor', 'Junio Fonteles', 'junio.fonteles', 'Junco', '13/09', '(88) 99801-4422', 'green', 100, 'Líder de Setor e anfitrião da célula.'),
    ('mem-2', 'church-sobral', 'cell-adonai', 'role-lider-setor', 'Líder de Setor', 'Raiane Plácido', 'raiane.placido', 'Junco', '08/03', '(88) 99712-8811', 'green', 100, 'Líder de Setor, discipuladora e coordenadora de louvor.'),
    ('mem-3', 'church-sobral', 'cell-adonai', 'role-membro', 'Membro', 'Andrine Rodrigues', 'andrine.rodrigues', 'Novo Recanto', '15/03', '(88) 99656-7845', 'green', 90, 'Presente em todas as reuniões este mês.'),
    ('mem-4', 'church-sobral', 'cell-adonai', 'role-lider-treinamento', 'Líder em Treinamento', 'Jamilly Costa', 'jamilly.costa', 'Domingos Olímpio', '10/07', '(88) 99888-2121', 'green', 95, 'Fazendo Escola de Líderes módulo 3.'),
    ('mem-5', 'church-sobral', 'cell-adonai', 'role-membro', 'Membro', 'José Filho', 'jose.filho', 'Dom Expedito', '08/04', '(88) 99777-3344', 'green', 90, 'Muito pontual e atuante no quebra-gelo.'),
    ('mem-6', 'church-sobral', 'cell-adonai', 'role-membro', 'Membro', 'Gleice Kelly', 'gleice.kelly', 'Parque Silvana', '26/04', '(88) 99666-5544', 'green', 90, 'Atuante no lanche e recepção.'),
    ('mem-7', 'church-sobral', 'cell-adonai', 'role-membro', 'Membro', 'Davi Melo', 'davi.melo', 'Junco', '15/05', '(88) 99444-1122', 'green', 95, 'Ministro de louvor da célula.'),
    ('mem-8', 'church-sobral', 'cell-adonai', 'role-membro', 'Membro', 'Adriana Gama', 'adriana.gama', 'Centro', '22/05', '(88) 99222-3344', 'green', 85, 'Discipulanda da Raiane.'),
    ('mem-9', 'church-sobral', 'cell-adonai', 'role-membro', 'Membro', 'Danillo Fernandes', 'danillo.fernandes', 'Junco', '01/06', '(88) 99333-7788', 'green', 90, 'Participa do ministério de teatro.'),
    ('mem-10', 'church-sobral', 'cell-adonai', 'role-lider-treinamento', 'Líder em Treinamento', 'Caio Pantaleão', 'caio.pantaleao', 'Campo dos Velhos', '06/06', '(88) 99111-2233', 'green', 95, 'Preparando-se para multiplicação.'),
    ('mem-11', 'church-sobral', 'cell-adonai', 'role-membro', 'Membro', 'Lara Beatriz', 'lara.beatriz', 'Sintra', '12/06', '(88) 99822-1199', 'green', 90, 'Participante do grupo de dança.'),
    ('mem-12', 'church-sobral', 'cell-adonai', 'role-membro', 'Membro', 'Maria Clara', 'maria.clara', 'Pedrinhas', '20/06', '(88) 99744-5566', 'green', 85, 'Batizada recentemente.')
ON CONFLICT (id) DO UPDATE SET 
    funcao_id = EXCLUDED.funcao_id,
    funcao = EXCLUDED.funcao,
    nome = EXCLUDED.nome,
    bairro = EXCLUDED.bairro,
    telefone = EXCLUDED.telefone;

-- 10.8 Etapas do Trilho Feitas pelos Membros (member_track_steps)
INSERT INTO public.member_track_steps (membro_id, celula_id, etapa_id, concluida, concluida_em, observacoes, validado_por)
VALUES
    -- Jamilly Costa (mem-4) concluiu etapas 1, 2, 3, 4
    ('mem-4', 'cell-adonai', 1, true, '12/03/2024', 'Recepção e consolidação', 'Junio Fonteles'),
    ('mem-4', 'cell-adonai', 2, true, '18/05/2024', 'Batizada na Igreja Sede', 'Pr. Local'),
    ('mem-4', 'cell-adonai', 3, true, '14/08/2024', '44º Encontro com Deus', 'Junio Fonteles'),
    ('mem-4', 'cell-adonai', 4, true, '20/11/2024', '10 lições de maturidade concluídas', 'Raiane Plácido'),
    ('mem-4', 'cell-adonai', 5, false, NULL, 'Cursando Módulo 3 da Escola de Líderes', NULL),
    ('mem-4', 'cell-adonai', 6, false, NULL, 'Aguardando conclusão do CTL', NULL),

    -- Caio Pantaleão (mem-10) concluiu etapas 1, 2, 3, 4
    ('mem-10', 'cell-adonai', 1, true, '10/01/2024', 'Cadastrado e integrado', 'Junio Fonteles'),
    ('mem-10', 'cell-adonai', 2, true, '20/03/2024', 'Batismo nas águas', 'Pr. Local'),
    ('mem-10', 'cell-adonai', 3, true, '15/07/2024', 'Encontro com Deus realizado', 'Junio Fonteles'),
    ('mem-10', 'cell-adonai', 4, true, '10/10/2024', 'Pós-Encontro concluído', 'Junio Fonteles'),
    ('mem-10', 'cell-adonai', 5, false, NULL, 'Cursando visão celular', NULL),
    ('mem-10', 'cell-adonai', 6, false, NULL, 'Pendente', NULL),

    -- Davi Melo (mem-7) concluiu etapas 1, 2, 3
    ('mem-7', 'cell-adonai', 1, true, '10/10/2024', 'Boas-vindas concluídas', 'Junio Fonteles'),
    ('mem-7', 'cell-adonai', 2, true, '15/12/2024', 'Batismo nas águas', 'Pr. Local'),
    ('mem-7', 'cell-adonai', 3, true, '08/03/2025', 'Acampamento Encontro com Deus', 'Junio Fonteles'),
    ('mem-7', 'cell-adonai', 4, false, NULL, 'Discipulado em andamento', NULL),
    ('mem-7', 'cell-adonai', 5, false, NULL, 'A iniciar', NULL),
    ('mem-7', 'cell-adonai', 6, false, NULL, 'Pendente', NULL)
ON CONFLICT (membro_id, etapa_id) DO UPDATE SET 
    concluida = EXCLUDED.concluida,
    concluida_em = EXCLUDED.concluida_em,
    observacoes = EXCLUDED.observacoes;

-- 10.9 Tabela Resumo do Trilho por Membro (leadership_tracks)
INSERT INTO public.leadership_tracks (
    membro_id, igreja_id, celula_id, etapa_atual_id, quantidade_etapas_concluidas, quantidade_total_etapas, percentual, status
)
VALUES
    ('mem-4', 'church-sobral', 'cell-adonai', 5, 4, 6, 67, 'em_andamento'),
    ('mem-10', 'church-sobral', 'cell-adonai', 5, 4, 6, 67, 'em_andamento'),
    ('mem-7', 'church-sobral', 'cell-adonai', 4, 3, 6, 50, 'em_andamento'),
    ('mem-1', 'church-sobral', 'cell-adonai', 6, 6, 6, 100, 'formado'),
    ('mem-2', 'church-sobral', 'cell-adonai', 6, 6, 6, 100, 'formado')
ON CONFLICT (membro_id) DO UPDATE SET 
    etapa_atual_id = EXCLUDED.etapa_atual_id,
    quantidade_etapas_concluidas = EXCLUDED.quantidade_etapas_concluidas,
    percentual = EXCLUDED.percentual;

-- ==============================================================================
-- FIM DO SCRIPT DE SCHEMA
-- ==============================================================================