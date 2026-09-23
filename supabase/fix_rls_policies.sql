-- ==============================================================================
-- APPCHURCH - CORREÇÃO DEFINITIVA DE PERMISSÕES E RLS (ROW LEVEL SECURITY)
-- Execute este script no SQL Editor do seu Supabase Dashboard
-- ==============================================================================

-- 1. Habilitar RLS em todas as tabelas (garantindo que existam)
DO $$
BEGIN
    -- Churches
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'churches' AND table_schema = 'public') THEN
        ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico churches" ON public.churches;
        DROP POLICY IF EXISTS "Acesso a igrejas" ON public.churches;
        DROP POLICY IF EXISTS "Leitura pública de igrejas" ON public.churches;
        CREATE POLICY "Acesso total publico churches" ON public.churches FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Roles
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles' AND table_schema = 'public') THEN
        ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico roles" ON public.roles;
        DROP POLICY IF EXISTS "Acesso a funções" ON public.roles;
        CREATE POLICY "Acesso total publico roles" ON public.roles FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Permissions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'permissions' AND table_schema = 'public') THEN
        ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico permissions" ON public.permissions;
        DROP POLICY IF EXISTS "Acesso a permissões" ON public.permissions;
        CREATE POLICY "Acesso total publico permissions" ON public.permissions FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Role Permissions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'role_permissions' AND table_schema = 'public') THEN
        ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico role_permissions" ON public.role_permissions;
        DROP POLICY IF EXISTS "Acesso a permissões por função" ON public.role_permissions;
        CREATE POLICY "Acesso total publico role_permissions" ON public.role_permissions FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Cells (Estrutura legada/ativa)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cells' AND table_schema = 'public') THEN
        ALTER TABLE public.cells ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico cells" ON public.cells;
        DROP POLICY IF EXISTS "Acesso a células por igreja" ON public.cells;
        CREATE POLICY "Acesso total publico cells" ON public.cells FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Members
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'members' AND table_schema = 'public') THEN
        ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico members" ON public.members;
        DROP POLICY IF EXISTS "Acesso a membros por célula/igreja" ON public.members;
        CREATE POLICY "Acesso total publico members" ON public.members FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Member Permissions
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'member_permissions' AND table_schema = 'public') THEN
        ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico member_permissions" ON public.member_permissions;
        CREATE POLICY "Acesso total publico member_permissions" ON public.member_permissions FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Track Steps
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'track_steps' AND table_schema = 'public') THEN
        ALTER TABLE public.track_steps ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico track_steps" ON public.track_steps;
        CREATE POLICY "Acesso total publico track_steps" ON public.track_steps FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Member Track Steps
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'member_track_steps' AND table_schema = 'public') THEN
        ALTER TABLE public.member_track_steps ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico member_track_steps" ON public.member_track_steps;
        CREATE POLICY "Acesso total publico member_track_steps" ON public.member_track_steps FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Leadership Tracks
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leadership_tracks' AND table_schema = 'public') THEN
        ALTER TABLE public.leadership_tracks ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico leadership_tracks" ON public.leadership_tracks;
        CREATE POLICY "Acesso total publico leadership_tracks" ON public.leadership_tracks FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Feed Posts
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feed_posts' AND table_schema = 'public') THEN
        ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico feed_posts" ON public.feed_posts;
        CREATE POLICY "Acesso total publico feed_posts" ON public.feed_posts FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Post Comments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'post_comments' AND table_schema = 'public') THEN
        ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico post_comments" ON public.post_comments;
        CREATE POLICY "Acesso total publico post_comments" ON public.post_comments FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Announcements
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'announcements' AND table_schema = 'public') THEN
        ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico announcements" ON public.announcements;
        CREATE POLICY "Acesso total publico announcements" ON public.announcements FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Nivel Tipo (Hierarquia Flexível)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nivel_tipo' AND table_schema = 'public') THEN
        ALTER TABLE public.nivel_tipo ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico nivel_tipo" ON public.nivel_tipo;
        CREATE POLICY "Acesso total publico nivel_tipo" ON public.nivel_tipo FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Unidades (Hierarquia Flexível)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unidades' AND table_schema = 'public') THEN
        ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico unidades" ON public.unidades;
        CREATE POLICY "Acesso total publico unidades" ON public.unidades FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Celulas (Hierarquia Flexível - dados específicos)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'celulas' AND table_schema = 'public') THEN
        ALTER TABLE public.celulas ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico celulas" ON public.celulas;
        CREATE POLICY "Acesso total publico celulas" ON public.celulas FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Unidade Lideres (Hierarquia Flexível)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unidade_lideres' AND table_schema = 'public') THEN
        ALTER TABLE public.unidade_lideres ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico unidade_lideres" ON public.unidade_lideres;
        CREATE POLICY "Acesso total publico unidade_lideres" ON public.unidade_lideres FOR ALL USING (true) WITH CHECK (true);
    END IF;

    -- Unidade Cobertura (Hierarquia Flexível)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unidade_cobertura' AND table_schema = 'public') THEN
        ALTER TABLE public.unidade_cobertura ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acesso total publico unidade_cobertura" ON public.unidade_cobertura;
        CREATE POLICY "Acesso total publico unidade_cobertura" ON public.unidade_cobertura FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
