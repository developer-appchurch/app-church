-- =====================================================================
-- MIGRAÇÃO: padronização de nomes em português + consolidação de
-- `cells` (legado) dentro de `unidades` / `celulas` (modelo novo)
--
-- IMPORTANTE:
-- 1. Rode isso primeiro em um banco de STAGING/cópia, nunca direto em
--    produção. No Supabase, use "Database > Backups" antes de aplicar
--    em produção, ou clone o projeto.
-- 2. As etapas marcadas "REVISÃO MANUAL" trazem um SELECT para você
--    conferir antes de decidir se aplica o UPDATE correspondente.
-- 3. Depois de validar em staging, exporte o schema final e atualize
--    o repositório do GitHub (o arquivo .sql versionado) com este
--    mesmo script ou com o dump gerado após a execução.
-- =====================================================================


-- =====================================================================
-- ETAPA 1 — Renomear tabelas para português
-- (RENAME TO preserva dados, índices e FKs existentes automaticamente)
-- =====================================================================

ALTER TABLE IF EXISTS public.churches            RENAME TO igrejas;
ALTER TABLE IF EXISTS public.roles               RENAME TO papeis;
ALTER TABLE IF EXISTS public.permissions         RENAME TO permissoes;
ALTER TABLE IF EXISTS public.role_permissions    RENAME TO papel_permissoes;
ALTER TABLE IF EXISTS public.members             RENAME TO membros;
ALTER TABLE IF EXISTS public.member_permissions  RENAME TO membro_permissoes;
ALTER TABLE IF EXISTS public.etapa_trilhos       RENAME TO etapas_trilha;
ALTER TABLE IF EXISTS public.member_track_steps  RENAME TO membro_etapas_trilha;
ALTER TABLE IF EXISTS public.leadership_tracks   RENAME TO trilhas_lideranca;
ALTER TABLE IF EXISTS public.feed_posts          RENAME TO postagens_feed;
ALTER TABLE IF EXISTS public.post_comments       RENAME TO comentarios_postagem;
ALTER TABLE IF EXISTS public.announcements       RENAME TO avisos;

-- Já estavam em português, mantidas como estão:
-- nivel_tipo, unidades, unidade_cobertura, celulas, unidade_lideres


-- =====================================================================
-- ETAPA 2 — Renomear colunas para consistência
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'papel_permissoes' AND column_name = 'funcao_id'
    ) THEN
        ALTER TABLE public.papel_permissoes RENAME COLUMN funcao_id TO papel_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'membros' AND column_name = 'funcao_id'
    ) THEN
        ALTER TABLE public.membros RENAME COLUMN funcao_id TO papel_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'etapas_trilha' AND column_name = 'id_igreja'
    ) THEN
        ALTER TABLE public.etapas_trilha RENAME COLUMN id_igreja TO igreja_id;
    END IF;
END $$;


-- =====================================================================
-- ETAPA 3 — Migrar dados legados de `cells` para `unidades` + `celulas`
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cells') THEN
        INSERT INTO public.nivel_tipo (igreja_id, nome, ordem)
        SELECT DISTINCT c.igreja_id, 'Célula',
               COALESCE((SELECT MAX(nt.ordem) + 10 FROM public.nivel_tipo nt WHERE nt.igreja_id = c.igreja_id), 10)
        FROM public.cells c
        WHERE NOT EXISTS (
            SELECT 1 FROM public.nivel_tipo nt
            WHERE nt.igreja_id = c.igreja_id AND nt.nome = 'Célula'
        );

        CREATE TEMP TABLE IF NOT EXISTS map_cells_unidades AS
        SELECT
            c.id            AS cell_id,
            gen_random_uuid() AS unidade_id,
            c.igreja_id,
            c.nome,
            c.nome_lider,
            c.nome_setor,
            c.endereco,
            c.dia_reuniao,
            c.horario_reuniao,
            c.quantidade_membros,
            c.criado_em,
            c.atualizado_em
        FROM public.cells c;

        INSERT INTO public.unidades (id, igreja_id, nivel_tipo_id, pai_id, nome, ativo, criado_em, atualizado_em)
        SELECT
            m.unidade_id, m.igreja_id, nt.id, NULL, m.nome, true, m.criado_em, m.atualizado_em
        FROM map_cells_unidades m
        JOIN public.nivel_tipo nt ON nt.igreja_id = m.igreja_id AND nt.nome = 'Célula';

        INSERT INTO public.celulas (unidade_id, bairro, endereco, dia_semana, horario, quantidade_membros, criado_em, atualizado_em)
        SELECT
            m.unidade_id, NULL, m.endereco, m.dia_reuniao, m.horario_reuniao, m.quantidade_membros, m.criado_em, m.atualizado_em
        FROM map_cells_unidades m;
    END IF;
END $$;


-- =====================================================================
-- ETAPA 4 — Linkar líder e setor-pai (semi-automático)
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'unidade_lideres')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_cells_unidades') THEN

        INSERT INTO public.unidade_lideres (unidade_id, pessoa_id, papel)
        SELECT m.unidade_id, matches.membro_id, 'Líder'
        FROM map_cells_unidades m
        JOIN LATERAL (
            SELECT mb.id AS membro_id
            FROM public.membros mb
            WHERE mb.igreja_id = m.igreja_id
              AND trim(lower(mb.nome)) = trim(lower(m.nome_lider))
        ) matches ON true
        WHERE (
            SELECT COUNT(*) FROM public.membros mb2
            WHERE mb2.igreja_id = m.igreja_id
              AND trim(lower(mb2.nome)) = trim(lower(m.nome_lider))
        ) = 1;

        UPDATE public.unidades u
        SET pai_id = matches.setor_id
        FROM map_cells_unidades m
        JOIN LATERAL (
            SELECT s.id AS setor_id
            FROM public.unidades s
            WHERE s.igreja_id = m.igreja_id
              AND trim(lower(s.nome)) = trim(lower(m.nome_setor))
              AND s.nivel_tipo_id IN (SELECT id FROM public.nivel_tipo WHERE nome = 'Setor' AND igreja_id = m.igreja_id)
        ) matches ON true
        WHERE u.id = m.unidade_id
          AND (
            SELECT COUNT(*) FROM public.unidades s2
            WHERE s2.igreja_id = m.igreja_id
              AND trim(lower(s2.nome)) = trim(lower(m.nome_setor))
              AND s2.nivel_tipo_id IN (SELECT id FROM public.nivel_tipo WHERE nome = 'Setor' AND igreja_id = m.igreja_id)
          ) = 1;
    END IF;
END $$;

-- REVISÃO MANUAL:
-- Conferência de casos ambíguos de líderes:
-- SELECT m.cell_id, m.nome AS celula, m.nome_lider AS lider_texto,
--        COUNT(mb.id) AS qtd_matches_encontrados
-- FROM map_cells_unidades m
-- LEFT JOIN public.membros mb
--     ON mb.igreja_id = m.igreja_id AND trim(lower(mb.nome)) = trim(lower(m.nome_lider))
-- GROUP BY m.cell_id, m.nome, m.nome_lider
-- HAVING COUNT(mb.id) != 1;
-- 
-- Conferência de casos ambíguos de setores:
-- SELECT m.cell_id, m.nome AS celula, m.nome_setor AS setor_texto,
--        COUNT(s.id) AS qtd_matches_encontrados
-- FROM map_cells_unidades m
-- LEFT JOIN public.unidades s
--     ON s.igreja_id = m.igreja_id
--     AND trim(lower(s.nome)) = trim(lower(m.nome_setor))
--     AND s.nivel_tipo_id IN (SELECT id FROM public.nivel_tipo WHERE nome = 'Setor' AND igreja_id = m.igreja_id)
-- GROUP BY m.cell_id, m.nome, m.nome_setor
-- HAVING COUNT(s.id) != 1;


-- =====================================================================
-- ETAPA 5 — Repontar as FKs que hoje apontam para `cells` (legado)
-- =====================================================================

DO $$
BEGIN
    -- 1. Tabela MEMBROS
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'membros') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'membros' AND column_name = 'unidade_id') THEN
            ALTER TABLE public.membros ADD COLUMN unidade_id uuid;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_cells_unidades')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'membros' AND column_name = 'celula_id') THEN
            UPDATE public.membros mb SET unidade_id = map.unidade_id
            FROM map_cells_unidades map WHERE mb.celula_id = map.cell_id;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'membros_unidade_id_fkey') THEN
            ALTER TABLE public.membros ADD CONSTRAINT membros_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);
        END IF;

        ALTER TABLE public.membros DROP CONSTRAINT IF EXISTS members_celula_id_fkey;
        ALTER TABLE public.membros DROP CONSTRAINT IF EXISTS membros_celula_id_fkey;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'membros' AND column_name = 'celula_id') THEN
            ALTER TABLE public.membros DROP COLUMN celula_id;
        END IF;
    END IF;

    -- 2. Tabela POSTAGENS_FEED
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'postagens_feed') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'postagens_feed' AND column_name = 'unidade_id') THEN
            ALTER TABLE public.postagens_feed ADD COLUMN unidade_id uuid;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_cells_unidades')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'postagens_feed' AND column_name = 'celula_id') THEN
            UPDATE public.postagens_feed p SET unidade_id = map.unidade_id
            FROM map_cells_unidades map WHERE p.celula_id = map.cell_id;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'postagens_feed_unidade_id_fkey') THEN
            ALTER TABLE public.postagens_feed ADD CONSTRAINT postagens_feed_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);
        END IF;

        ALTER TABLE public.postagens_feed DROP CONSTRAINT IF EXISTS feed_posts_celula_id_fkey;
        ALTER TABLE public.postagens_feed DROP CONSTRAINT IF EXISTS postagens_feed_celula_id_fkey;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'postagens_feed' AND column_name = 'celula_id') THEN
            ALTER TABLE public.postagens_feed DROP COLUMN celula_id;
        END IF;
    END IF;

    -- 3. Tabela MEMBRO_ETAPAS_TRILHA
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'membro_etapas_trilha') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'membro_etapas_trilha' AND column_name = 'unidade_id') THEN
            ALTER TABLE public.membro_etapas_trilha ADD COLUMN unidade_id uuid;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_cells_unidades')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'membro_etapas_trilha' AND column_name = 'celula_id') THEN
            UPDATE public.membro_etapas_trilha mt SET unidade_id = map.unidade_id
            FROM map_cells_unidades map WHERE mt.celula_id = map.cell_id;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'membro_etapas_trilha_unidade_id_fkey') THEN
            ALTER TABLE public.membro_etapas_trilha
                ALTER COLUMN unidade_id DROP NOT NULL,
                ADD CONSTRAINT membro_etapas_trilha_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);
        END IF;

        ALTER TABLE public.membro_etapas_trilha DROP CONSTRAINT IF EXISTS member_track_steps_celula_id_fkey;
        ALTER TABLE public.membro_etapas_trilha DROP CONSTRAINT IF EXISTS membro_etapas_trilha_celula_id_fkey;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'membro_etapas_trilha' AND column_name = 'celula_id') THEN
            ALTER TABLE public.membro_etapas_trilha DROP COLUMN celula_id;
        END IF;
    END IF;

    -- 4. Tabela TRILHAS_LIDERANCA
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trilhas_lideranca') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trilhas_lideranca' AND column_name = 'unidade_id') THEN
            ALTER TABLE public.trilhas_lideranca ADD COLUMN unidade_id uuid;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_cells_unidades')
           AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trilhas_lideranca' AND column_name = 'celula_id') THEN
            UPDATE public.trilhas_lideranca tl SET unidade_id = map.unidade_id
            FROM map_cells_unidades map WHERE tl.celula_id = map.cell_id;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trilhas_lideranca_unidade_id_fkey') THEN
            ALTER TABLE public.trilhas_lideranca
                ALTER COLUMN unidade_id DROP NOT NULL,
                ADD CONSTRAINT trilhas_lideranca_unidade_id_fkey FOREIGN KEY (unidade_id) REFERENCES public.unidades(id);
        END IF;

        ALTER TABLE public.trilhas_lideranca DROP CONSTRAINT IF EXISTS leadership_tracks_celula_id_fkey;
        ALTER TABLE public.trilhas_lideranca DROP CONSTRAINT IF EXISTS trilhas_lideranca_celula_id_fkey;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trilhas_lideranca' AND column_name = 'celula_id') THEN
            ALTER TABLE public.trilhas_lideranca DROP COLUMN celula_id;
        END IF;
    END IF;
END $$;


-- =====================================================================
-- ETAPA 6 — Descartar a tabela legada (só depois de validar tudo acima!)
-- =====================================================================

DROP TABLE IF EXISTS public.cells CASCADE;
DROP TABLE IF EXISTS map_cells_unidades;


-- =====================================================================
-- ETAPA 7 — Corrigir as constraints em `unidades` e `nivel_tipo`
-- =====================================================================

ALTER TABLE public.unidades DROP CONSTRAINT IF EXISTS fk_unidades_nivel_tipo_igreja;
ALTER TABLE public.unidades DROP CONSTRAINT IF EXISTS fk_unidades_pai_igreja;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nivel_tipo_id_igreja_unique') THEN
        ALTER TABLE public.nivel_tipo ADD CONSTRAINT nivel_tipo_id_igreja_unique UNIQUE (id, igreja_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unidades_id_igreja_unique') THEN
        ALTER TABLE public.unidades ADD CONSTRAINT unidades_id_igreja_unique UNIQUE (id, igreja_id);
    END IF;
END $$;

ALTER TABLE public.unidades
    ADD CONSTRAINT fk_unidades_nivel_tipo_igreja
    FOREIGN KEY (nivel_tipo_id, igreja_id) REFERENCES public.nivel_tipo(id, igreja_id);

ALTER TABLE public.unidades
    ADD CONSTRAINT fk_unidades_pai_igreja
    FOREIGN KEY (pai_id, igreja_id) REFERENCES public.unidades(id, igreja_id);


-- =====================================================================
-- ETAPA 8 — Views de compatibilidade retroativa (recomendado)
-- Garante que queries e códigos legados continuem funcionando sem erros
-- =====================================================================

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

