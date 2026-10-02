-- ==============================================================================
-- MIGRAÇÃO APPCHURCH: CATÁLOGO DE PERMISSÕES, PAPEL_PERMISSOES E MEMBRO_PERMISSOES
-- ==============================================================================

-- 1. Garante que as tabelas existam com suas estruturas corretas
CREATE TABLE IF NOT EXISTS public.permissoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    modulo TEXT NOT NULL,
    descricao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_permissoes_codigo ON public.permissoes(codigo);
CREATE INDEX IF NOT EXISTS idx_permissoes_modulo ON public.permissoes(modulo);

CREATE TABLE IF NOT EXISTS public.papel_permissoes (
    papel_id UUID NOT NULL REFERENCES public.papeis(id) ON DELETE CASCADE,
    permissao_id UUID NOT NULL REFERENCES public.permissoes(id) ON DELETE CASCADE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (papel_id, permissao_id)
);

CREATE INDEX IF NOT EXISTS idx_papel_permissoes_papel ON public.papel_permissoes(papel_id);
CREATE INDEX IF NOT EXISTS idx_papel_permissoes_permissao ON public.papel_permissoes(permissao_id);

CREATE TABLE IF NOT EXISTS public.membro_permissoes (
    membro_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
    permissao_id UUID NOT NULL REFERENCES public.permissoes(id) ON DELETE CASCADE,
    concedida BOOLEAN NOT NULL DEFAULT true,
    concedida_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (membro_id, permissao_id)
);

CREATE INDEX IF NOT EXISTS idx_membro_permissoes_membro ON public.membro_permissoes(membro_id);
CREATE INDEX IF NOT EXISTS idx_membro_permissoes_permissao ON public.membro_permissoes(permissao_id);

-- 2. Popula o Catálogo de Permissões
INSERT INTO public.permissoes (codigo, nome, modulo, descricao)
VALUES
    -- Permissões Administrativas e Críticas
    ('church:admin', 'Administrador na igreja', 'Administração', 'Acesso total de gestão e configuração, equivalente ao Pastor Titular.'),
    ('permissions:manage', 'Gerenciar permissões especiais', 'Segurança', 'Acesso para conceder ou revogar permissões especiais de qualquer membro.'),
    ('unit:transfer_delete', 'Transferência/Exclusão de Unidade/Célula', 'Estrutura', 'Permite transferir ou excluir unidades organizacionais e células.'),
    ('announcement:manage', 'Gerenciar avisos globais', 'Comunicação', 'Publicar, editar e fixar comunicados oficiais para toda a congregação.'),
    ('report:export', 'Exportar relatórios/dados', 'Relatórios', 'Exportar dados analíticos de crescimento, relatórios de células e frequências.'),
    
    -- Gestão de Pessoas e Membros
    ('member:delete', 'Excluir membros', 'Membros', 'Permite remover ou arquivar registros de membros da igreja.'),
    ('member:edit_any', 'Editar qualquer membro', 'Membros', 'Permite editar dados de qualquer membro da congregação (não apenas da sua célula).'),
    ('member:create', 'Adicionar Membros', 'Membros', 'Cadastrar novos membros na célula ou no pool geral da igreja.'),
    ('member:edit', 'Editar Membros da Célula', 'Membros', 'Alterar dados dos membros pertencentes à sua própria célula.'),
    ('leader:assign', 'Designar líderes de célula/setor', 'Liderança', 'Vincular ou desvincular líderes em células e unidades organizacionais.'),

    -- Operacionais de Célula e Discipulado
    ('cell:view', 'Visualizar Célula', 'Célula', 'Visualizar dados e membros da célula vinculada.'),
    ('cell:manage', 'Gerenciar Célula', 'Célula', 'Editar informações de endereço, dia e horário da célula.'),
    ('attendance:view', 'Ver Frequência', 'Frequência', 'Visualizar histórico de presenças e assiduidade dos membros.'),
    ('attendance:edit', 'Lançar Frequência', 'Frequência', 'Lançar e atualizar presenças nas reuniões semanais de célula.'),
    ('track:view', 'Visualizar Trilho', 'Trilho', 'Visualizar as etapas do trilho de liderança dos membros.'),
    ('track:update', 'Avançar Etapas do Trilho', 'Trilho', 'Validar e marcar etapas concluídas no trilho de liderança.'),
    ('reports:view', 'Visualizar Relatórios', 'Relatórios', 'Acessar relatórios semanais de célula e multiplicação.'),
    ('feed:post', 'Publicar no Feed', 'Comunidade', 'Publicar fotos e testemunhos no mural da igreja.')
ON CONFLICT (codigo) DO UPDATE 
SET 
    nome = EXCLUDED.nome,
    modulo = EXCLUDED.modulo,
    descricao = EXCLUDED.descricao;

-- 3. Popula a tabela papel_permissoes vinculando os papéis padrão da igreja
DO $$
DECLARE
    r_admin UUID;
    r_pastor UUID;
    r_supervisor UUID;
    r_distrito UUID;
    r_area UUID;
    r_setor UUID;
    r_celula UUID;
    r_treinamento UUID;
    r_membro UUID;
BEGIN
    SELECT id INTO r_admin FROM public.papeis WHERE slug = 'administrador' LIMIT 1;
    SELECT id INTO r_pastor FROM public.papeis WHERE slug = 'pastor' LIMIT 1;
    SELECT id INTO r_supervisor FROM public.papeis WHERE slug = 'supervisor' LIMIT 1;
    SELECT id INTO r_distrito FROM public.papeis WHERE slug = 'lider-distrito' LIMIT 1;
    SELECT id INTO r_area FROM public.papeis WHERE slug = 'lider-area' LIMIT 1;
    SELECT id INTO r_setor FROM public.papeis WHERE slug = 'lider-setor' LIMIT 1;
    SELECT id INTO r_celula FROM public.papeis WHERE slug = 'lider-celula' LIMIT 1;
    SELECT id INTO r_treinamento FROM public.papeis WHERE slug = 'lider-treinamento' LIMIT 1;
    SELECT id INTO r_membro FROM public.papeis WHERE slug = 'membro' LIMIT 1;

    -- Pastor & Administrador: Recebem TODAS as permissões do sistema
    IF r_admin IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_admin, p.id FROM public.permissoes p
        ON CONFLICT DO NOTHING;
    END IF;

    IF r_pastor IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_pastor, p.id FROM public.permissoes p
        ON CONFLICT DO NOTHING;
    END IF;

    -- Supervisor / Distrito / Área
    IF r_supervisor IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_supervisor, p.id FROM public.permissoes p
        WHERE p.codigo IN (
            'announcement:manage', 'leader:assign', 'report:export', 'member:edit_any',
            'reports:view', 'cell:manage', 'cell:view', 'member:create', 'member:edit',
            'attendance:view', 'attendance:edit', 'track:view', 'track:update', 'feed:post'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    IF r_distrito IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_distrito, p.id FROM public.permissoes p
        WHERE p.codigo IN (
            'announcement:manage', 'leader:assign', 'report:export', 'member:edit_any',
            'reports:view', 'cell:manage', 'cell:view', 'member:create', 'member:edit',
            'attendance:view', 'attendance:edit', 'track:view', 'track:update', 'feed:post'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    IF r_area IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_area, p.id FROM public.permissoes p
        WHERE p.codigo IN (
            'leader:assign', 'report:export', 'reports:view', 'cell:manage', 'cell:view',
            'member:create', 'member:edit', 'attendance:view', 'attendance:edit',
            'track:view', 'track:update', 'feed:post'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Líder de Setor
    IF r_setor IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_setor, p.id FROM public.permissoes p
        WHERE p.codigo IN (
            'leader:assign', 'announcement:manage', 'report:export', 'reports:view',
            'cell:manage', 'cell:view', 'member:create', 'member:edit', 'member:delete',
            'attendance:view', 'attendance:edit', 'track:view', 'track:update', 'feed:post'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Líder de Célula
    IF r_celula IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_celula, p.id FROM public.permissoes p
        WHERE p.codigo IN (
            'cell:view', 'cell:manage', 'member:create', 'member:edit',
            'attendance:view', 'attendance:edit', 'track:view', 'track:update',
            'reports:view', 'feed:post'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Líder em Treinamento
    IF r_treinamento IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_treinamento, p.id FROM public.permissoes p
        WHERE p.codigo IN (
            'cell:view', 'member:create', 'attendance:view', 'attendance:edit',
            'track:view', 'feed:post'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Membro comum
    IF r_membro IS NOT NULL THEN
        INSERT INTO public.papel_permissoes (papel_id, permissao_id)
        SELECT r_membro, p.id FROM public.permissoes p
        WHERE p.codigo IN ('cell:view', 'track:view', 'feed:post')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
