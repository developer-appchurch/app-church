-- ==============================================================================
-- APPCHURCH - SCHEMA RELACIONAL PADRONIZADO EM PORTUGUÊS (SUPABASE / POSTGRESQL)
-- Versão Consolidada: Hierarquias Flexíveis (unidades / celulas) + Nomes em Português
-- ==============================================================================
-- Estrutura relacional padronizada contendo:
-- 1. Extensões UUID (uuid-ossp / pgcrypto)
-- 2. Tabela de Igrejas (igrejas) - Multi-Tenant com ID UUID
-- 3. Tabela de Papéis/Funções (papeis) - Hierarquia e badges com ID UUID
-- 4. Tabela de Permissões (permissoes) + Mapeamento (papel_permissoes) com IDs UUID
-- 5. Tabelas de Hierarquia Organizacional:
--    - nivel_tipo (níveis customizáveis por igreja: Distrito, Área, Setor, Célula...)
--    - unidades (unidades genéricas com hierarquia pai_id e anti-ciclos)
--    - unidade_cobertura (coberturas ministeriais)
--    - celulas (extensão 1:1 para unidades do tipo Célula)
--    - unidade_lideres (liderança normalizada N:N)
-- 6. Tabela de Membros (membros) - Vínculo a igreja_id, unidade_id e papel_id
-- 7. Tabela de Trilho de Liderança:
--    - etapas_trilha (catálogo de etapas por igreja)
--    - membro_etapas_trilha (etapas individuais)
--    - trilhas_lideranca (resumo e progresso)
-- 8. Tabelas de Comunhão e Avisos:
--    - postagens_feed (feed da célula/igreja)
--    - comentarios_postagem (comentários)
--    - avisos (comunicados e eventos oficiais)
-- 9. Views de Compatibilidade Retroativa (cells, churches, members, roles, etc.)
-- 10. Funções RPC, Triggers e Políticas de Segurança RLS
-- 11. Seed inicial completo com UUIDs determinísticos
-- ==============================================================================

-- 0. Habilitar extensões para geração de UUIDs únicos
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Limpar views anteriores (se existirem)
DROP VIEW IF EXISTS public.vw_member_leadership_track CASCADE;
DROP VIEW IF EXISTS public.vw_cell_members_full CASCADE;
DROP VIEW IF EXISTS public.cells CASCADE;
DROP VIEW IF EXISTS public.churches CASCADE;
DROP VIEW IF EXISTS public.members CASCADE;
DROP VIEW IF EXISTS public.roles CASCADE;
DROP VIEW IF EXISTS public.permissions CASCADE;
DROP VIEW IF EXISTS public.role_permissions CASCADE;
DROP VIEW IF EXISTS public.member_permissions CASCADE;
DROP VIEW IF EXISTS public.etapa_trilhos CASCADE;
DROP VIEW IF EXISTS public.member_track_steps CASCADE;
DROP VIEW IF EXISTS public.leadership_tracks CASCADE;
DROP VIEW IF EXISTS public.feed_posts CASCADE;
DROP VIEW IF EXISTS public.post_comments CASCADE;
DROP VIEW IF EXISTS public.announcements CASCADE;

-- ==============================================================================
-- 1. TABELA DE IGREJAS (MULTI-TENANT / CONGREGAÇÕES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.igrejas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    cnpj TEXT,
    cidade TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'CE',
    url_logo TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_igrejas_slug ON public.igrejas(slug);

-- ==============================================================================
-- 2. TABELA DE PAPÉIS (PAPEIS / ROLES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.papeis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT UNIQUE NOT NULL, -- ex: 'Pastor', 'Líder de Setor', 'Líder de Célula', 'Membro'
    slug TEXT UNIQUE NOT NULL,
    descricao TEXT,
    nivel_hierarquia INTEGER DEFAULT 1, -- 1: Membro, 2: Líder Treinamento, 3: Líder Célula, 4: Líder Setor, 5: Pastor
    cor_distintivo TEXT DEFAULT '#0a2540',
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_papeis_slug ON public.papeis(slug);
CREATE INDEX IF NOT EXISTS idx_papeis_nivel ON public.papeis(nivel_hierarquia);

-- ==============================================================================
-- 3. TABELA DE PERMISSÕES (PERMISSOES) E MAPEAMENTO (PAPEL_PERMISSOES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.permissoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL, -- ex: 'cell:manage', 'track:update', 'feed:post'
    nome TEXT NOT NULL,
    modulo TEXT NOT NULL, -- 'Célula', 'Membros', 'Frequência', 'Trilho', 'Relatórios', 'Feed', 'Admin'
    descricao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_permissoes_codigo ON public.permissoes(codigo);

CREATE TABLE IF NOT EXISTS public.papel_permissoes (
    papel_id UUID NOT NULL REFERENCES public.papeis(id) ON DELETE CASCADE,
    permissao_id UUID NOT NULL REFERENCES public.permissoes(id) ON DELETE CASCADE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (papel_id, permissao_id)
);

CREATE INDEX IF NOT EXISTS idx_papel_permissoes_papel ON public.papel_permissoes(papel_id);

-- ==============================================================================
-- 4. TABELAS DE HIERARQUIA ORGANIZACIONAL (NIVEL_TIPO, UNIDADES, CELULAS)
-- ==============================================================================

-- 4.1 Tipos de Nível por Igreja (Distrito, Área, Setor, Célula, etc.)
CREATE TABLE IF NOT EXISTS public.nivel_tipo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    nome VARCHAR(50) NOT NULL,
    ordem INT NOT NULL, -- 10: Distrito, 20: Área, 30: Setor, 40: Célula
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_nivel_tipo_igreja_nome UNIQUE (igreja_id, nome),
    CONSTRAINT uq_nivel_tipo_igreja_ordem UNIQUE (igreja_id, ordem),
    CONSTRAINT nivel_tipo_id_igreja_unique UNIQUE (id, igreja_id)
);

CREATE INDEX IF NOT EXISTS idx_nivel_tipo_igreja ON public.nivel_tipo(igreja_id);

-- 4.2 Unidades Organizacionais (Árvore Hierárquica com pai_id)
CREATE TABLE IF NOT EXISTS public.unidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    nivel_tipo_id UUID NOT NULL,
    pai_id UUID,
    nome VARCHAR(100) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unidades_id_igreja_unique UNIQUE (id, igreja_id),
    CONSTRAINT fk_unidades_nivel_tipo_igreja FOREIGN KEY (nivel_tipo_id, igreja_id) REFERENCES public.nivel_tipo(id, igreja_id) ON DELETE RESTRICT,
    CONSTRAINT fk_unidades_pai_igreja FOREIGN KEY (pai_id, igreja_id) REFERENCES public.unidades(id, igreja_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_unidades_igreja ON public.unidades(igreja_id);
CREATE INDEX IF NOT EXISTS idx_unidades_pai ON public.unidades(pai_id);
CREATE INDEX IF NOT EXISTS idx_unidades_nivel ON public.unidades(nivel_tipo_id);

-- 4.3 Cobertura Lateral
CREATE TABLE IF NOT EXISTS public.unidade_cobertura (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_principal_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    unidade_cobertura_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_unidade_cobertura UNIQUE (unidade_principal_id, unidade_cobertura_id),
    CONSTRAINT chk_nao_auto_cobertura CHECK (unidade_principal_id != unidade_cobertura_id)
);

-- 4.4 Extensão 1:1 para Unidades do tipo Célula
CREATE TABLE IF NOT EXISTS public.celulas (
    unidade_id UUID PRIMARY KEY REFERENCES public.unidades(id) ON DELETE CASCADE,
    bairro VARCHAR(60),
    endereco TEXT,
    dia_semana VARCHAR(20) DEFAULT 'Quarta-feira',
    horario VARCHAR(10) DEFAULT '19:30',
    quantidade_membros INTEGER DEFAULT 0,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4.5 Líderes das Unidades (N:N)
CREATE TABLE IF NOT EXISTS public.unidade_lideres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    pessoa_id UUID NOT NULL, -- ID do membro
    papel VARCHAR(50) NOT NULL DEFAULT 'Líder', -- 'Líder', 'Vice-Líder', 'Supervisor', 'Pastor'
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_unidade_pessoa_papel UNIQUE (unidade_id, pessoa_id, papel)
);

CREATE INDEX IF NOT EXISTS idx_unidade_lideres_unidade ON public.unidade_lideres(unidade_id);
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_pessoa ON public.unidade_lideres(pessoa_id);

-- ==============================================================================
-- 5. TABELA DE MEMBROS (MEMBROS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.membros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    unidade_id UUID REFERENCES public.unidades(id) ON DELETE SET NULL,
    papel_id UUID REFERENCES public.papeis(id) ON DELETE SET NULL,
    funcao TEXT NOT NULL DEFAULT 'Membro',
    nome TEXT NOT NULL,
    login TEXT UNIQUE,
    senha_hash TEXT,
    bairro TEXT,
    aniversario TEXT, -- dd/MM
    telefone TEXT,
    email TEXT,
    status_frequencia TEXT NOT NULL DEFAULT 'green',
    percentual_frequencia INTEGER NOT NULL DEFAULT 100,
    url_avatar TEXT,
    observacoes TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_membros_igreja_id ON public.membros(igreja_id);
CREATE INDEX IF NOT EXISTS idx_membros_unidade_id ON public.membros(unidade_id);
CREATE INDEX IF NOT EXISTS idx_membros_papel_id ON public.membros(papel_id);
CREATE INDEX IF NOT EXISTS idx_membros_login ON public.membros(login);

-- Permissões específicas por membro
CREATE TABLE IF NOT EXISTS public.membro_permissoes (
    membro_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
    permissao_id UUID NOT NULL REFERENCES public.permissoes(id) ON DELETE CASCADE,
    concedida BOOLEAN NOT NULL DEFAULT true,
    concedida_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (membro_id, permissao_id)
);

CREATE INDEX IF NOT EXISTS idx_membro_permissoes_membro ON public.membro_permissoes(membro_id);

-- ==============================================================================
-- 6. TABELAS DE TRILHO DE LIDERANÇA
-- ==============================================================================

-- Catálogo de etapas do Trilho por congregação/igreja
CREATE TABLE IF NOT EXISTS public.etapas_trilha (
    id SERIAL PRIMARY KEY,
    igreja_id UUID REFERENCES public.igrejas(id) ON DELETE CASCADE,
    numero_etapa INTEGER NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    obrigatoria BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_etapas_trilha_igreja ON public.etapas_trilha(igreja_id);
CREATE INDEX IF NOT EXISTS idx_etapas_trilha_numero ON public.etapas_trilha(numero_etapa);

-- Registro individual de cada etapa realizada pelo Membro
CREATE TABLE IF NOT EXISTS public.membro_etapas_trilha (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membro_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
    unidade_id UUID REFERENCES public.unidades(id) ON DELETE CASCADE,
    etapa_id INTEGER NOT NULL REFERENCES public.etapas_trilha(id) ON DELETE CASCADE,
    concluida BOOLEAN NOT NULL DEFAULT false,
    concluida_em TEXT, -- dd/MM/AAAA
    observacoes TEXT,
    validado_por TEXT,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(membro_id, etapa_id)
);

CREATE INDEX IF NOT EXISTS idx_membro_etapas_trilha_membro ON public.membro_etapas_trilha(membro_id);
CREATE INDEX IF NOT EXISTS idx_membro_etapas_trilha_unidade ON public.membro_etapas_trilha(unidade_id);

-- Resumo consolidado do Trilho por Membro
CREATE TABLE IF NOT EXISTS public.trilhas_lideranca (
    membro_id UUID PRIMARY KEY REFERENCES public.membros(id) ON DELETE CASCADE,
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    unidade_id UUID REFERENCES public.unidades(id) ON DELETE CASCADE,
    etapa_atual_id INTEGER NOT NULL DEFAULT 1,
    quantidade_etapas_concluidas INTEGER NOT NULL DEFAULT 0,
    quantidade_total_etapas INTEGER NOT NULL DEFAULT 6,
    percentual INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'em_andamento',
    dados_etapas JSONB NOT NULL DEFAULT '[]'::jsonb,
    observacoes TEXT,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trilhas_lideranca_unidade ON public.trilhas_lideranca(unidade_id);
CREATE INDEX IF NOT EXISTS idx_trilhas_lideranca_igreja ON public.trilhas_lideranca(igreja_id);

-- ==============================================================================
-- 7. TABELAS DE COMUNHÃO & AVISOS (POSTAGENS_FEED, COMENTARIOS_POSTAGEM, AVISOS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.postagens_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
    unidade_id UUID REFERENCES public.unidades(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_postagens_feed_igreja ON public.postagens_feed(igreja_id);
CREATE INDEX IF NOT EXISTS idx_postagens_feed_unidade ON public.postagens_feed(unidade_id);

CREATE TABLE IF NOT EXISTS public.comentarios_postagem (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.postagens_feed(id) ON DELETE CASCADE,
    nome_autor TEXT NOT NULL,
    funcao_autor TEXT NOT NULL,
    avatar_autor TEXT,
    conteudo TEXT NOT NULL,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comentarios_postagem_post ON public.comentarios_postagem(post_id);

CREATE TABLE IF NOT EXISTS public.avisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.igrejas(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_avisos_igreja ON public.avisos(igreja_id);

-- ==============================================================================
-- 8. VIEWS DE COMPATIBILIDADE RETROATIVA (TRANSITION SHIMS)
-- Permite que sistemas ou queries legadas continuem funcionando sem erros
-- ==============================================================================

-- 8.1 View de Células: Consolida unidades + celulas + unidade_lideres
CREATE OR REPLACE VIEW public.cells AS
SELECT
    u.id,
    u.igreja_id,
    u.nome,
    COALESCE(
        (SELECT m.nome FROM public.unidade_lideres ul JOIN public.membros m ON m.id = ul.pessoa_id WHERE ul.unidade_id = u.id AND ul.ativo = true LIMIT 1),
        'Líder Não Definido'
    ) AS nome_lider,
    COALESCE(
        (SELECT s.nome FROM public.unidades s WHERE s.id = u.pai_id),
        'Geral'
    ) AS nome_setor,
    COALESCE(c.endereco, 'Endereço da Célula') AS endereco,
    COALESCE(c.dia_semana, 'Quarta-feira') AS dia_reuniao,
    COALESCE(c.horario, '19:30') AS horario_reuniao,
    COALESCE(c.quantidade_membros, 0) AS quantidade_membros,
    u.criado_em,
    u.atualizado_em
FROM public.unidades u
JOIN public.nivel_tipo nt ON nt.id = u.nivel_tipo_id AND nt.nome = 'Célula'
LEFT JOIN public.celulas c ON c.unidade_id = u.id
WHERE u.ativo = true;

-- 8.2 Views Sinônimas para tabelas renomeadas
CREATE OR REPLACE VIEW public.churches AS SELECT * FROM public.igrejas;
CREATE OR REPLACE VIEW public.roles AS SELECT id, nome, slug, descricao, nivel_hierarquia, cor_distintivo, criado_em FROM public.papeis;
CREATE OR REPLACE VIEW public.permissions AS SELECT * FROM public.permissoes;
CREATE OR REPLACE VIEW public.role_permissions AS SELECT papel_id AS funcao_id, permissao_id, criado_em FROM public.papel_permissoes;
CREATE OR REPLACE VIEW public.members AS 
SELECT 
    id, igreja_id, unidade_id AS celula_id, papel_id AS funcao_id, funcao, nome, login, senha_hash,
    bairro, aniversario, telefone, email, status_frequencia, percentual_frequencia, url_avatar,
    observacoes, criado_em, atualizado_em
FROM public.membros;
CREATE OR REPLACE VIEW public.member_permissions AS SELECT * FROM public.membro_permissoes;
CREATE OR REPLACE VIEW public.etapa_trilhos AS SELECT id, igreja_id AS id_igreja, numero_etapa, titulo, descricao, obrigatoria, criado_em FROM public.etapas_trilha;
CREATE OR REPLACE VIEW public.member_track_steps AS SELECT id, membro_id, unidade_id AS celula_id, etapa_id, concluida, concluida_em, observacoes, validado_por, atualizado_em FROM public.membro_etapas_trilha;
CREATE OR REPLACE VIEW public.leadership_tracks AS SELECT membro_id, igreja_id, unidade_id AS celula_id, etapa_atual_id, quantidade_etapas_concluidas, quantidade_total_etapas, percentual, status, dados_etapas, observacoes, atualizado_em FROM public.trilhas_lideranca;
CREATE OR REPLACE VIEW public.feed_posts AS SELECT id, igreja_id, unidade_id AS celula_id, nome_celula, nome_autor, funcao_autor, avatar_autor, legenda, url_imagem, categoria, quantidade_curtidas, criado_em FROM public.postagens_feed;
CREATE OR REPLACE VIEW public.post_comments AS SELECT * FROM public.comentarios_postagem;
CREATE OR REPLACE VIEW public.announcements AS SELECT * FROM public.avisos;

-- ==============================================================================
-- 9. VIEWS ANALÍTICAS E RELACIONAIS COMPLETAS
-- ==============================================================================

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
    u.id AS unidade_id,
    u.nome AS nome_celula,
    COALESCE(pai.nome, 'Geral') AS nome_setor,
    u.igreja_id,
    p.id AS papel_id,
    p.nome AS nome_funcao,
    p.nivel_hierarquia,
    COALESCE(lt.etapa_atual_id, 1) AS etapa_atual_trilho_id,
    COALESCE(lt.percentual, 0) AS percentual_trilho,
    COALESCE(lt.quantidade_etapas_concluidas, 0) AS etapas_trilho_concluidas,
    COALESCE(
        (SELECT jsonb_agg(pm.codigo)
         FROM public.papel_permissoes pp
         JOIN public.permissoes pm ON pm.id = pp.permissao_id
         WHERE pp.papel_id = p.id), '[]'::jsonb
    ) AS codigos_permissoes_funcao
FROM public.membros m
LEFT JOIN public.unidades u ON u.id = m.unidade_id
LEFT JOIN public.unidades pai ON pai.id = u.pai_id
LEFT JOIN public.papeis p ON p.id = m.papel_id
LEFT JOIN public.trilhas_lideranca lt ON lt.membro_id = m.id;

CREATE OR REPLACE VIEW public.vw_member_leadership_track AS
SELECT
    m.id AS membro_id,
    m.nome AS nome_membro,
    COALESCE(u.nome, 'Geral') AS nome_celula,
    et.id AS etapa_id,
    et.numero_etapa,
    et.titulo AS titulo_etapa,
    et.descricao AS descricao_etapa,
    COALESCE(met.concluida, false) AS concluida,
    met.concluida_em,
    met.observacoes AS observacoes_etapa,
    met.validado_por
FROM public.membros m
LEFT JOIN public.unidades u ON u.id = m.unidade_id
CROSS JOIN public.etapas_trilha et
LEFT JOIN public.membro_etapas_trilha met ON met.membro_id = m.id AND met.etapa_id = et.id
ORDER BY m.nome, et.numero_etapa;

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.igrejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.papeis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.papel_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nivel_tipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidade_cobertura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidade_lideres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membro_permissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapas_trilha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membro_etapas_trilha ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trilhas_lideranca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postagens_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comentarios_postagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso
DROP POLICY IF EXISTS "Acesso a igrejas" ON public.igrejas;
DROP POLICY IF EXISTS "Acesso a papeis" ON public.papeis;
DROP POLICY IF EXISTS "Acesso a permissoes" ON public.permissoes;
DROP POLICY IF EXISTS "Acesso a papel_permissoes" ON public.papel_permissoes;
DROP POLICY IF EXISTS "Acesso a nivel_tipo" ON public.nivel_tipo;
DROP POLICY IF EXISTS "Acesso a unidades" ON public.unidades;
DROP POLICY IF EXISTS "Acesso a unidade_cobertura" ON public.unidade_cobertura;
DROP POLICY IF EXISTS "Acesso a celulas" ON public.celulas;
DROP POLICY IF EXISTS "Acesso a unidade_lideres" ON public.unidade_lideres;
DROP POLICY IF EXISTS "Acesso a membros" ON public.membros;
DROP POLICY IF EXISTS "Acesso a membro_permissoes" ON public.membro_permissoes;
DROP POLICY IF EXISTS "Acesso a etapas_trilha" ON public.etapas_trilha;
DROP POLICY IF EXISTS "Acesso a membro_etapas_trilha" ON public.membro_etapas_trilha;
DROP POLICY IF EXISTS "Acesso a trilhas_lideranca" ON public.trilhas_lideranca;
DROP POLICY IF EXISTS "Acesso a postagens_feed" ON public.postagens_feed;
DROP POLICY IF EXISTS "Acesso a comentarios_postagem" ON public.comentarios_postagem;
DROP POLICY IF EXISTS "Acesso a avisos" ON public.avisos;

CREATE POLICY "Acesso a igrejas" ON public.igrejas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a papeis" ON public.papeis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a permissoes" ON public.permissoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a papel_permissoes" ON public.papel_permissoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a nivel_tipo" ON public.nivel_tipo FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a unidades" ON public.unidades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a unidade_cobertura" ON public.unidade_cobertura FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a celulas" ON public.celulas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a unidade_lideres" ON public.unidade_lideres FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a membros" ON public.membros FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a membro_permissoes" ON public.membro_permissoes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a etapas_trilha" ON public.etapas_trilha FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a membro_etapas_trilha" ON public.membro_etapas_trilha FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a trilhas_lideranca" ON public.trilhas_lideranca FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a postagens_feed" ON public.postagens_feed FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a comentarios_postagem" ON public.comentarios_postagem FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso a avisos" ON public.avisos FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 11. DADOS INICIAIS (SEED)
-- ==============================================================================

-- 11.1 Igrejas (Multi-Tenant)
INSERT INTO public.igrejas (id, nome, slug, cidade, estado)
VALUES 
    ('a1000000-0000-0000-0000-000000000001', 'Paz Church Sobral', 'sobral', 'Sobral', 'CE'),
    ('a1000000-0000-0000-0000-000000000002', 'Paz Church Jaibaras', 'jaibaras', 'Jaibaras (Sobral)', 'CE'),
    ('a1000000-0000-0000-0000-000000000003', 'Paz Church Forquilha', 'forquilha', 'Forquilha', 'CE')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- 11.2 Tabela de Papéis (Papeis)
INSERT INTO public.papeis (id, nome, slug, descricao, nivel_hierarquia, cor_distintivo)
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

-- 11.3 Tabela de Permissões (Permissoes)
INSERT INTO public.permissoes (id, codigo, nome, modulo, descricao)
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

-- 11.4 Papel x Permissões
INSERT INTO public.papel_permissoes (papel_id, permissao_id)
VALUES
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

    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000003'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000006'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000007'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000008'),
    ('b2000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000011'),

    ('b2000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000006'),
    ('b2000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000007'),
    ('b2000000-0000-0000-0000-000000000007', 'c3000000-0000-0000-0000-000000000010'),

    ('b2000000-0000-0000-0000-000000000006', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000008', 'c3000000-0000-0000-0000-000000000001'),
    ('b2000000-0000-0000-0000-000000000009', 'c3000000-0000-0000-0000-000000000001')
ON CONFLICT (papel_id, permissao_id) DO NOTHING;

-- Pastor herda todas as permissões
INSERT INTO public.papel_permissoes (papel_id, permissao_id)
SELECT 'b2000000-0000-0000-0000-000000000001', id FROM public.permissoes
ON CONFLICT (papel_id, permissao_id) DO NOTHING;

-- 11.5 Níveis Hierárquicos Padrão
INSERT INTO public.nivel_tipo (id, igreja_id, nome, ordem)
VALUES
    ('d4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Distrito', 10),
    ('d4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Área', 20),
    ('d4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Setor', 30),
    ('d4000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'Célula', 40)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, ordem = EXCLUDED.ordem;

-- 11.6 Unidades Organizacionais
INSERT INTO public.unidades (id, igreja_id, nivel_tipo_id, pai_id, nome, ativo)
VALUES
    ('e5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000003', NULL, 'Setor Fire', true),
    ('e5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000003', NULL, 'Setor Radicais', true),
    ('e5000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000001', 'Célula Adonai', true),
    ('e5000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000001', 'Célula Betel', true),
    ('e5000000-0000-0000-0000-000000000030', 'a1000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000002', 'Célula Shalom', true)
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

-- 11.7 Celulas (extensão 1:1)
INSERT INTO public.celulas (unidade_id, bairro, endereco, dia_semana, horario, quantidade_membros)
VALUES
    ('e5000000-0000-0000-0000-000000000010', 'Centro', 'Rua Menino Deus, 450 - Centro', 'Quinta-feira', '19:30', 9),
    ('e5000000-0000-0000-0000-000000000020', 'Campo dos Velhos', 'Av. John Sanford, 1200', 'Quarta-feira', '20:00', 8),
    ('e5000000-0000-0000-0000-000000000030', 'Pedrinhas', 'Rua Cel. Mont Alverne, 310', 'Sexta-feira', '19:00', 7)
ON CONFLICT (unidade_id) DO UPDATE SET endereco = EXCLUDED.endereco;

-- 11.8 Membros Iniciais
INSERT INTO public.membros (id, igreja_id, unidade_id, papel_id, funcao, nome, login, senha_hash, bairro, aniversario, status_frequencia, percentual_frequencia, url_avatar)
VALUES
    ('f6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000010', 'b2000000-0000-0000-0000-000000000001', 'Pastor', 'Pastor Roberto Alves', 'pr.roberto', '123456', 'Centro', '15/04', 'green', 100, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=250'),
    ('f6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000010', 'b2000000-0000-0000-0000-000000000004', 'Líder de Célula', 'Carlos Henrique', 'carlos.lider', '123456', 'Centro', '12/03', 'green', 100, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=250'),
    ('f6000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000010', 'b2000000-0000-0000-0000-000000000005', 'Líder em Treinamento', 'Mariana Souza', 'mariana.treinamento', '123456', 'Centro', '25/07', 'green', 92, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=250'),
    ('f6000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000010', 'b2000000-0000-0000-0000-000000000009', 'Membro', 'Lucas Gabriel', 'lucas.gabriel', '123456', 'Centro', '04/11', 'yellow', 75, 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=250')
ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, login = EXCLUDED.login;

-- 11.9 Vincula líderes em unidade_lideres
INSERT INTO public.unidade_lideres (unidade_id, pessoa_id, papel, ativo)
VALUES
    ('e5000000-0000-0000-0000-000000000010', 'f6000000-0000-0000-0000-000000000002', 'Líder de Célula', true)
ON CONFLICT (unidade_id, pessoa_id, papel) DO NOTHING;

-- 11.10 Etapas do Trilho de Liderança
INSERT INTO public.etapas_trilha (id, igreja_id, numero_etapa, titulo, descricao, obrigatoria)
VALUES
    (1, 'a1000000-0000-0000-0000-000000000001', 1, 'Batismo nas Águas', 'Decisão pública de fé em Jesus Cristo e sepultamento do velho homem.', true),
    (2, 'a1000000-0000-0000-0000-000000000001', 2, 'Encontro com Deus', 'Fim de semana imersivo de libertação, cura da alma e batismo no Espírito Santo.', true),
    (3, 'a1000000-0000-0000-0000-000000000001', 3, 'Curso de Maturidade (CMCR)', 'Fundamentos da fé cristã, oração, jejum e caráter de Cristo.', true),
    (4, 'a1000000-0000-0000-0000-000000000001', 4, 'Curso de Treinamento de Líderes (CTL)', 'Capacitação prática para liderar células, discipulado e multiplicação.', true),
    (5, 'a1000000-0000-0000-0000-000000000001', 5, 'Líder em Treinamento Ativo', 'Atuação direta como braço direito do líder de célula nos encontros.', true),
    (6, 'a1000000-0000-0000-0000-000000000001', 6, 'Multiplicação / Envio Ministerial', 'Consagração e envio oficial para assumir uma nova célula gerada.', true)
ON CONFLICT (id) DO UPDATE SET titulo = EXCLUDED.titulo, descricao = EXCLUDED.descricao;

SELECT setval('public.etapas_trilha_id_seq', (SELECT MAX(id) FROM public.etapas_trilha));
