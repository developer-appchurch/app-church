-- ==============================================================================
-- APPCHURCH - MIGRAÇÃO DE BANCO DE DADOS: HIERARQUIAS FLEXÍVEIS E PERSONALIZADAS
-- Dialeto: PostgreSQL (compatível com Supabase / Postgres 14+)
-- ==============================================================================
-- Este script realiza:
-- 1. Criação/adequação das tabelas do novo modelo:
--    - igrejas (compatível com churches)
--    - nivel_tipo (níveis customizáveis por igreja com ordem espaçada: 10, 20, 30...)
--    - unidades (tabela genérica com integridade cruzada composta e hierarquia pai_id)
--    - unidade_cobertura (cobertura lateral entre unidades)
--    - celulas (extensão 1:1 para unidades do tipo Célula)
--    - unidade_lideres (liderança normalizada N:N com múltiplos líderes e papéis)
-- 2. Constraints e Triggers:
--    - Bloqueio estrito de ciclos em pai_id (anti-ciclos recursivo)
--    - Validação de que somente unidades do tipo Célula são inseridas em celulas
--    - Integridade referencial composta (nivel_tipo e pai pertencem à mesma igreja)
-- 3. Índices de performance em chaves estrangeiras e buscas
-- 4. Script de migração e preservação de dados existentes da tabela legada (cells)
--    - Normalização de setores e células
--    - Parsing de nomes de líderes para pessoas/membros e vínculo em unidade_lideres
-- 5. View de compatibilidade retroativa para não quebrar queries existentes
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- PARTE 1: CRIAÇÃO / ADEQUAÇÃO DAS TABELAS
-- ==============================================================================

-- 1.1 TABELA: igrejas (garantir existência e compatibilidade com public.churches)
CREATE TABLE IF NOT EXISTS public.churches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    slug TEXT UNIQUE,
    cnpj TEXT,
    cidade TEXT,
    estado TEXT DEFAULT 'CE',
    url_logo TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS cnpj TEXT;

-- Se a tabela de igrejas for referenciada como "igrejas", criamos um alias / sinonímia ou tabela
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'igrejas') THEN
        CREATE VIEW public.igrejas AS SELECT id, nome, slug, cidade, estado, url_logo, criado_em FROM public.churches;
    END IF;
END $$;

-- 1.2 TABELA: nivel_tipo
-- Cada igreja define seus próprios níveis (Distrito, Área, Setor, Célula, Rede, etc.)
CREATE TABLE IF NOT EXISTS public.nivel_tipo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    nome VARCHAR(50) NOT NULL,
    ordem INT NOT NULL, -- Ex: 10 (Distrito), 20 (Área), 30 (Setor), 40 (Célula)
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    -- Permite FK composta em unidades para integridade cruzada estrita
    CONSTRAINT uq_nivel_tipo_id_igreja UNIQUE (id, igreja_id),
    -- Garante que na mesma igreja não existam nomes ou ordens repetidas
    CONSTRAINT uq_nivel_tipo_igreja_nome UNIQUE (igreja_id, nome),
    CONSTRAINT uq_nivel_tipo_igreja_ordem UNIQUE (igreja_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_nivel_tipo_igreja_id ON public.nivel_tipo(igreja_id);
CREATE INDEX IF NOT EXISTS idx_nivel_tipo_ordem ON public.nivel_tipo(igreja_id, ordem);

-- 1.3 TABELA: unidades
-- Estrutura genérica para qualquer nível da hierarquia
CREATE TABLE IF NOT EXISTS public.unidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    igreja_id UUID NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    nivel_tipo_id UUID NOT NULL,
    pai_id UUID, -- Referência à própria tabela unidades (NULL para raízes ou permite pular níveis)
    nome VARCHAR(150) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Garante que uma unidade pode ser referenciada junto de sua igreja_id
    CONSTRAINT uq_unidades_id_igreja UNIQUE (id, igreja_id),
    
    -- INTEGRIDADE CRUZADA: O nivel_tipo DEVE pertencer à mesma igreja da unidade
    CONSTRAINT fk_unidades_nivel_tipo_igreja 
        FOREIGN KEY (nivel_tipo_id, igreja_id) 
        REFERENCES public.nivel_tipo(id, igreja_id) 
        ON DELETE RESTRICT,
        
    -- INTEGRIDADE CRUZADA DE PAI: O pai também DEVE pertencer à mesma igreja
    CONSTRAINT fk_unidades_pai_igreja 
        FOREIGN KEY (pai_id, igreja_id) 
        REFERENCES public.unidades(id, igreja_id) 
        ON DELETE SET NULL
);

-- Índices essenciais solicitados para unidades
CREATE INDEX IF NOT EXISTS idx_unidades_igreja_id ON public.unidades(igreja_id);
CREATE INDEX IF NOT EXISTS idx_unidades_pai_id ON public.unidades(pai_id);
CREATE INDEX IF NOT EXISTS idx_unidades_nivel_tipo_id ON public.unidades(nivel_tipo_id);
CREATE INDEX IF NOT EXISTS idx_unidades_nome ON public.unidades(nome);

-- 1.4 TABELA: unidade_cobertura
-- Cobertura lateral / supervisão extra de uma unidade sobre outra (ex: Setor A cobrindo Setor B)
CREATE TABLE IF NOT EXISTS public.unidade_cobertura (
    unidade_responsavel_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    unidade_coberta_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    observacao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (unidade_responsavel_id, unidade_coberta_id),
    -- Uma unidade não pode cobrir a si mesma
    CONSTRAINT ck_unidade_cobertura_diferente CHECK (unidade_responsavel_id <> unidade_coberta_id)
);

CREATE INDEX IF NOT EXISTS idx_unidade_cobertura_responsavel ON public.unidade_cobertura(unidade_responsavel_id);
CREATE INDEX IF NOT EXISTS idx_unidade_cobertura_coberta ON public.unidade_cobertura(unidade_coberta_id);

-- 1.5 TABELA: celulas (Extensão específica 1:1 para unidades que são Célula)
CREATE TABLE IF NOT EXISTS public.celulas (
    unidade_id UUID PRIMARY KEY REFERENCES public.unidades(id) ON DELETE CASCADE,
    bairro VARCHAR(100),
    endereco TEXT,
    dia_semana VARCHAR(30), -- Ex: 'Quarta-feira', 'Sábado'
    horario VARCHAR(10),    -- Ex: '19:30'
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    quantidade_membros INT DEFAULT 0,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.6 TABELA: unidade_lideres (Normalização N:N para múltiplos líderes por unidade)
CREATE TABLE IF NOT EXISTS public.unidade_lideres (
    unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
    pessoa_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
    papel VARCHAR(50) NOT NULL DEFAULT 'Líder', -- Ex: 'Líder', 'Vice-Líder', 'Líder em Treinamento', 'Coordenador', 'Supervisor'
    designado_em TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (unidade_id, pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_unidade_lideres_unidade_id ON public.unidade_lideres(unidade_id);
CREATE INDEX IF NOT EXISTS idx_unidade_lideres_pessoa_id ON public.unidade_lideres(pessoa_id);


-- ==============================================================================
-- PARTE 2: TRIGGERS DE REGRAS DE NEGÓCIO E ANTI-CICLO
-- ==============================================================================

-- 2.1 TRIGGER: Prevenção de Ciclos em pai_id (uma unidade não pode ser ancestral dela mesma)
CREATE OR REPLACE FUNCTION public.fn_check_unidades_no_cycle()
RETURNS TRIGGER AS $$
DECLARE
    v_ancestor_id UUID;
    v_depth INT := 0;
    v_max_depth CONSTANT INT := 50; -- Prevenção contra estouro de pilha
BEGIN
    -- Se não possui pai_id, não há como formar ciclo
    IF NEW.pai_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Ciclo direto: pai não pode ser a própria unidade
    IF NEW.id IS NOT NULL AND NEW.pai_id = NEW.id THEN
        RAISE EXCEPTION 'Restrição de Hierarquia: A unidade "%" não pode ser pai de si mesma.', NEW.nome;
    END IF;

    -- Busca recursiva: subir na árvore de pais de NEW.pai_id para verificar se alcança NEW.id
    v_ancestor_id := NEW.pai_id;
    WHILE v_ancestor_id IS NOT NULL LOOP
        v_depth := v_depth + 1;
        IF v_depth > v_max_depth THEN
            RAISE EXCEPTION 'Profundidade máxima de hierarquia excedida ou ciclo infinito detectado para unidade "%".', NEW.nome;
        END IF;

        IF NEW.id IS NOT NULL AND v_ancestor_id = NEW.id THEN
            RAISE EXCEPTION 'Ciclo detectado na hierarquia de unidades: a unidade "%" não pode ter como pai um de seus descendentes.', NEW.nome;
        END IF;

        -- Busca o pai do ancestral atual
        SELECT pai_id INTO v_ancestor_id FROM public.unidades WHERE id = v_ancestor_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_unidades_no_cycle ON public.unidades;
CREATE TRIGGER trg_check_unidades_no_cycle
    BEFORE INSERT OR UPDATE OF pai_id ON public.unidades
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_unidades_no_cycle();

-- 2.2 TRIGGER: Validação de que somente unidades com nivel_tipo correspondente a "Célula" entram em public.celulas
CREATE OR REPLACE FUNCTION public.fn_validate_celula_unit_type()
RETURNS TRIGGER AS $$
DECLARE
    v_tipo_nome TEXT;
BEGIN
    SELECT nt.nome INTO v_tipo_nome
    FROM public.unidades u
    JOIN public.nivel_tipo nt ON nt.id = u.nivel_tipo_id
    WHERE u.id = NEW.unidade_id;

    IF v_tipo_nome IS NULL THEN
        RAISE EXCEPTION 'Unidade com id "%" não encontrada ao tentar cadastrar dados de célula.', NEW.unidade_id;
    END IF;

    -- Validação case-insensitive aceitando 'Célula', 'Celula', 'LifeGroup', etc.
    IF LOWER(TRANSLATE(v_tipo_nome, 'éÉ', 'ee')) NOT IN ('celula', 'lifegroup', 'grupo', 'pequeno grupo') THEN
        RAISE EXCEPTION 'A unidade referenciada possui nível "%", que não é do tipo Célula. Apenas unidades do tipo Célula podem possuir dados na tabela celulas.', v_tipo_nome;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_celula_unit_type ON public.celulas;
CREATE TRIGGER trg_validate_celula_unit_type
    BEFORE INSERT OR UPDATE ON public.celulas
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_celula_unit_type();


-- ==============================================================================
-- PARTE 3: SCRIPT DE MIGRAÇÃO DOS DADOS DA ESTRUTURA ANTIGA (cells)
-- ==============================================================================

DO $$
DECLARE
    r_church RECORD;
    v_tipo_distrito_id UUID;
    v_tipo_area_id UUID;
    v_tipo_setor_id UUID;
    v_tipo_celula_id UUID;
    r_old_cell RECORD;
    v_setor_unidade_id UUID;
    v_celula_unidade_id UUID;
    v_raw_leader TEXT;
    v_leader_name TEXT;
    v_leader_id UUID;
BEGIN
    RAISE NOTICE '>>> Iniciando migração de dados para a hierarquia flexível...';

    -- 1. Para cada igreja cadastrada, cria os níveis hierárquicos padrão caso não existam
    FOR r_church IN SELECT id, nome FROM public.churches LOOP

        -- Nível 10: Distrito
        INSERT INTO public.nivel_tipo (igreja_id, nome, ordem)
        VALUES (r_church.id, 'Distrito', 10)
        ON CONFLICT (igreja_id, nome) DO UPDATE SET ordem = 10
        RETURNING id INTO v_tipo_distrito_id;

        -- Nível 20: Área
        INSERT INTO public.nivel_tipo (igreja_id, nome, ordem)
        VALUES (r_church.id, 'Área', 20)
        ON CONFLICT (igreja_id, nome) DO UPDATE SET ordem = 20
        RETURNING id INTO v_tipo_area_id;

        -- Nível 30: Setor
        INSERT INTO public.nivel_tipo (igreja_id, nome, ordem)
        VALUES (r_church.id, 'Setor', 30)
        ON CONFLICT (igreja_id, nome) DO UPDATE SET ordem = 30
        RETURNING id INTO v_tipo_setor_id;

        -- Nível 40: Célula
        INSERT INTO public.nivel_tipo (igreja_id, nome, ordem)
        VALUES (r_church.id, 'Célula', 40)
        ON CONFLICT (igreja_id, nome) DO UPDATE SET ordem = 40
        RETURNING id INTO v_tipo_celula_id;

        -- Se a tabela legada 'cells' existir, migra os setores e as células
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cells') THEN
            
            -- Itera sobre as células da igreja na tabela legada
            FOR r_old_cell IN 
                SELECT id, igreja_id, nome, nome_lider, nome_setor, endereco, dia_reuniao, horario_reuniao, quantidade_membros
                FROM public.cells
                WHERE igreja_id = r_church.id
            LOOP
                -- 2.1 Garantir que o Setor exista na tabela unidades
                IF r_old_cell.nome_setor IS NOT NULL AND TRIM(r_old_cell.nome_setor) <> '' THEN
                    SELECT id INTO v_setor_unidade_id 
                    FROM public.unidades 
                    WHERE igreja_id = r_church.id 
                      AND nivel_tipo_id = v_tipo_setor_id 
                      AND LOWER(nome) = LOWER(TRIM(r_old_cell.nome_setor))
                    LIMIT 1;

                    IF v_setor_unidade_id IS NULL THEN
                        INSERT INTO public.unidades (igreja_id, nivel_tipo_id, pai_id, nome)
                        VALUES (r_church.id, v_tipo_setor_id, NULL, TRIM(r_old_cell.nome_setor))
                        RETURNING id INTO v_setor_unidade_id;
                    END IF;
                ELSE
                    v_setor_unidade_id := NULL;
                END IF;

                -- 2.2 Migrar a Célula como unidade (preservando o ID original r_old_cell.id se for UUID)
                v_celula_unidade_id := r_old_cell.id;

                INSERT INTO public.unidades (id, igreja_id, nivel_tipo_id, pai_id, nome)
                VALUES (v_celula_unidade_id, r_church.id, v_tipo_celula_id, v_setor_unidade_id, TRIM(r_old_cell.nome))
                ON CONFLICT (id) DO UPDATE 
                SET pai_id = EXCLUDED.pai_id,
                    nome = EXCLUDED.nome;

                -- 2.3 Inserir os dados específicos de reunião na tabela celulas
                INSERT INTO public.celulas (unidade_id, bairro, endereco, dia_semana, horario, quantidade_membros)
                VALUES (
                    v_celula_unidade_id,
                    'Bairro',
                    r_old_cell.endereco,
                    r_old_cell.dia_reuniao,
                    r_old_cell.horario_reuniao,
                    COALESCE(r_old_cell.quantidade_membros, 0)
                )
                ON CONFLICT (unidade_id) DO UPDATE
                SET endereco = EXCLUDED.endereco,
                    dia_semana = EXCLUDED.dia_semana,
                    horario = EXCLUDED.horario;

                -- 2.4 Parse e normalização de múltiplos líderes em unidade_lideres
                -- Suporta múltiplos nomes separados por vírgula (,), ' e ', barra (/), ou '&'
                v_raw_leader := COALESCE(r_old_cell.nome_lider, '');
                
                -- Substitui separadores comuns por ponto-e-vírgula para split limpo
                v_raw_leader := REPLACE(v_raw_leader, ' e ', ';');
                v_raw_leader := REPLACE(v_raw_leader, ' / ', ';');
                v_raw_leader := REPLACE(v_raw_leader, '/', ';');
                v_raw_leader := REPLACE(v_raw_leader, '&', ';');
                v_raw_leader := REPLACE(v_raw_leader, ',', ';');

                FOR v_leader_name IN 
                    SELECT TRIM(part) FROM unnest(string_to_array(v_raw_leader, ';')) AS part WHERE TRIM(part) <> ''
                LOOP
                    -- Verifica se a pessoa já existe na tabela de membros da igreja
                    SELECT id INTO v_leader_id 
                    FROM public.members 
                    WHERE igreja_id = r_church.id 
                      AND LOWER(nome) = LOWER(v_leader_name)
                    LIMIT 1;

                    -- Se não existir, cria registro básico de pessoa/membro
                    IF v_leader_id IS NULL THEN
                        INSERT INTO public.members (
                            igreja_id,
                            celula_id,
                            nome,
                            funcao,
                            status_frequencia,
                            percentual_frequencia
                        )
                        VALUES (
                            r_church.id,
                            v_celula_unidade_id,
                            v_leader_name,
                            'Líder',
                            'green',
                            100
                        )
                        RETURNING id INTO v_leader_id;
                    END IF;

                    -- Vincula a pessoa na tabela unidade_lideres com papel 'Líder'
                    INSERT INTO public.unidade_lideres (unidade_id, pessoa_id, papel)
                    VALUES (v_celula_unidade_id, v_leader_id, 'Líder')
                    ON CONFLICT (unidade_id, pessoa_id) DO NOTHING;

                END LOOP; -- loop de líderes

            END LOOP; -- loop de células antigas

        END IF;

    END LOOP; -- loop de igrejas

    RAISE NOTICE '>>> Migração concluída com sucesso!';
END $$;


-- ==============================================================================
-- PARTE 4: VIEW DE COMPATIBILIDADE RETROATIVA (vw_cells_legacy)
-- ==============================================================================
-- Não quebra nenhuma query ou tela existente que consulte a antiga estrutura 'cells'

CREATE OR REPLACE VIEW public.vw_cells_legacy AS
SELECT 
    u.id,
    u.igreja_id,
    u.nome AS nome,
    COALESCE(
        string_agg(m.nome, ', ' ORDER BY m.nome),
        'Sem líder atribuído'
    ) AS nome_lider,
    COALESCE(pai.nome, 'Geral') AS nome_setor,
    c.endereco,
    c.dia_semana AS dia_reuniao,
    c.horario AS horario_reuniao,
    COALESCE(c.quantidade_membros, 0) AS quantidade_membros,
    c.bairro,
    c.latitude,
    c.longitude,
    u.criado_em,
    u.atualizado_em
FROM public.unidades u
JOIN public.nivel_tipo nt ON nt.id = u.nivel_tipo_id AND LOWER(TRANSLATE(nt.nome, 'éÉ', 'ee')) = 'celula'
LEFT JOIN public.celulas c ON c.unidade_id = u.id
LEFT JOIN public.unidades pai ON pai.id = u.pai_id
LEFT JOIN public.unidade_lideres ul ON ul.unidade_id = u.id AND ul.ativo = TRUE
LEFT JOIN public.members m ON m.id = ul.pessoa_id
GROUP BY 
    u.id, u.igreja_id, u.nome, pai.nome, c.endereco, c.dia_semana, 
    c.horario, c.quantidade_membros, c.bairro, c.latitude, c.longitude, 
    u.criado_em, u.atualizado_em;

COMMENT ON VIEW public.vw_cells_legacy IS 'View de compatibilidade retroativa para aplicações que consomem os campos antigos da tabela cells.';


-- ==============================================================================
-- PARTE 5: CONSULTAS SUGERIDAS PARA OS CASOS DE USO PRINCIPAIS
-- ==============================================================================

/*
-- -----------------------------------------------------------------------------
-- CASO DE USO 1: Buscar hierarquia completa de uma unidade (Breadcrumb até a raiz)
-- Ex: Célula -> Setor -> Área -> Distrito
-- -----------------------------------------------------------------------------
WITH RECURSIVE hierarquia_ascendente AS (
    -- Âncora: a unidade solicitada
    SELECT 
        u.id,
        u.nome,
        u.pai_id,
        u.nivel_tipo_id,
        nt.nome AS nivel_nome,
        nt.ordem AS nivel_ordem,
        1 AS profundidade,
        ARRAY[u.nome::TEXT] AS caminho
    FROM public.unidades u
    JOIN public.nivel_tipo nt ON nt.id = u.nivel_tipo_id
    WHERE u.id = 'ID_DA_UNIDADE_AQUI' -- Substituir pelo ID desejado

    UNION ALL

    -- Recursão: sobe para o pai
    SELECT 
        pai.id,
        pai.nome,
        pai.pai_id,
        pai.nivel_tipo_id,
        nt.nome AS nivel_nome,
        nt.ordem AS nivel_ordem,
        h.profundidade + 1,
        ARRAY[pai.nome::TEXT] || h.caminho
    FROM public.unidades pai
    JOIN hierarquia_ascendente h ON h.pai_id = pai.id
    JOIN public.nivel_tipo nt ON nt.id = pai.nivel_tipo_id
)
SELECT 
    id,
    nome,
    nivel_nome,
    nivel_ordem,
    profundidade,
    array_to_string(caminho, ' > ') AS breadcrumb
FROM hierarquia_ascendente
ORDER BY nivel_ordem ASC;


-- -----------------------------------------------------------------------------
-- CASO DE USO 2: Listar todos os líderes de uma unidade com seus papéis e contatos
-- -----------------------------------------------------------------------------
SELECT 
    u.id AS unidade_id,
    u.nome AS unidade_nome,
    nt.nome AS tipo_unidade,
    m.id AS pessoa_id,
    m.nome AS pessoa_nome,
    ul.papel,
    m.telefone,
    m.email,
    ul.designado_em
FROM public.unidades u
JOIN public.nivel_tipo nt ON nt.id = u.nivel_tipo_id
JOIN public.unidade_lideres ul ON ul.unidade_id = u.id AND ul.ativo = TRUE
JOIN public.members m ON m.id = ul.pessoa_id
WHERE u.id = 'ID_DA_UNIDADE_AQUI'
ORDER BY 
    CASE ul.papel 
        WHEN 'Líder' THEN 1 
        WHEN 'Co-Líder' THEN 2 
        WHEN 'Líder em Treinamento' THEN 3 
        ELSE 4 
    END, 
    m.nome ASC;


-- -----------------------------------------------------------------------------
-- CASO DE USO 3: Listar todas as células sob um setor
-- (Incluindo setores cobertos lateralmente via `unidade_cobertura`)
-- -----------------------------------------------------------------------------
WITH RECURSIVE setores_alvo AS (
    -- 1. O próprio setor solicitado
    SELECT 
        u.id AS unidade_id,
        u.nome AS setor_nome,
        'Titular' AS tipo_vinculo
    FROM public.unidades u
    WHERE u.id = 'ID_DO_SETOR_AQUI'

    UNION

    -- 2. Setores que recebem cobertura lateral deste setor
    SELECT 
        coberta.id AS unidade_id,
        coberta.nome AS setor_nome,
        'Cobertura Lateral' AS tipo_vinculo
    FROM public.unidade_cobertura uc
    JOIN public.unidades coberta ON coberta.id = uc.unidade_coberta_id
    WHERE uc.unidade_responsavel_id = 'ID_DO_SETOR_AQUI'
),
descendentes_unidades AS (
    -- Âncora: todas as unidades raiz (setores alvo)
    SELECT 
        sa.unidade_id,
        sa.setor_nome,
        sa.tipo_vinculo,
        u.id AS sub_unidade_id,
        u.nome AS sub_unidade_nome,
        u.nivel_tipo_id
    FROM setores_alvo sa
    JOIN public.unidades u ON u.id = sa.unidade_id

    UNION ALL

    -- Recursão: desce em todas as subunidades (ex: áreas internas ou células filhas)
    SELECT 
        d.unidade_id,
        d.setor_nome,
        d.tipo_vinculo,
        filho.id AS sub_unidade_id,
        filho.nome AS sub_unidade_nome,
        filho.nivel_tipo_id
    FROM public.unidades filho
    JOIN descendentes_unidades d ON filho.pai_id = d.sub_unidade_id
)
SELECT 
    d.setor_nome,
    d.tipo_vinculo,
    u.id AS celula_id,
    u.nome AS celula_nome,
    c.bairro,
    c.endereco,
    c.dia_semana,
    c.horario,
    c.quantidade_membros,
    COALESCE(
        (SELECT string_agg(m.nome || ' (' || ul.papel || ')', ', ')
         FROM public.unidade_lideres ul
         JOIN public.members m ON m.id = ul.pessoa_id
         WHERE ul.unidade_id = u.id AND ul.ativo = TRUE),
        'Sem líderes atribuídos'
    ) AS lideres
FROM descendentes_unidades d
JOIN public.unidades u ON u.id = d.sub_unidade_id
JOIN public.nivel_tipo nt ON nt.id = u.nivel_tipo_id AND LOWER(TRANSLATE(nt.nome, 'éÉ', 'ee')) = 'celula'
LEFT JOIN public.celulas c ON c.unidade_id = u.id
ORDER BY d.setor_nome, u.nome;
*/

-- ==============================================================================
-- PARTE 5: POLÍTICAS DE SEGURANÇA (RLS) PARA A HIERARQUIA FLEXÍVEL
-- ==============================================================================
ALTER TABLE public.nivel_tipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidade_cobertura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidade_lideres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total a nivel_tipo" ON public.nivel_tipo;
DROP POLICY IF EXISTS "Acesso total a unidades" ON public.unidades;
DROP POLICY IF EXISTS "Acesso total a unidade_cobertura" ON public.unidade_cobertura;
DROP POLICY IF EXISTS "Acesso total a celulas" ON public.celulas;
DROP POLICY IF EXISTS "Acesso total a unidade_lideres" ON public.unidade_lideres;

CREATE POLICY "Acesso total a nivel_tipo" ON public.nivel_tipo FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total a unidades" ON public.unidades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total a unidade_cobertura" ON public.unidade_cobertura FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total a celulas" ON public.celulas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total a unidade_lideres" ON public.unidade_lideres FOR ALL USING (true) WITH CHECK (true);

