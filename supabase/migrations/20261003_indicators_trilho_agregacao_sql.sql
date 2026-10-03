-- ==============================================================================
-- Migração: Agregação em SQL para os Indicadores da Igreja (Trilho de Liderança)
--
-- Problema: a rota /api/indicators/leadership-track buscava a lista completa
-- de membros e de conclusões do trilho e somava tudo em JavaScript. Isso
-- esbarra no limite padrão de 1000 linhas por consulta do PostgREST (por
-- isso igrejas com mais de 1000 membros apareciam travadas em 1000), e é
-- lento: baixa muito mais dado do que o necessário a cada troca de escopo.
--
-- Solução: duas funções (RPC) que calculam tudo dentro do Postgres e
-- devolvem só o resultado agregado (poucas linhas/um JSON pequeno).
-- ==============================================================================

-- 1. Resumo agregado do Trilho de Liderança para um escopo (igreja inteira,
--    ou a subárvore de uma unidade — Área, Setor ou Célula).
CREATE OR REPLACE FUNCTION public.indicators_trilho_resumo(
  p_igreja_id UUID,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH RECURSIVE subtree AS (
    SELECT id
    FROM public.unidades
    WHERE igreja_id = p_igreja_id
      AND (p_unidade_id IS NULL OR id = p_unidade_id)
    UNION ALL
    SELECT u.id
    FROM public.unidades u
    JOIN subtree s ON u.pai_id = s.id
  ),
  escopo_membros AS (
    SELECT m.id
    FROM public.membros m
    WHERE m.igreja_id = p_igreja_id
      AND (p_unidade_id IS NULL OR m.unidade_id IN (SELECT id FROM subtree))
  ),
  etapas AS (
    SELECT id, numero_etapa, titulo
    FROM public.etapas_trilha
    WHERE igreja_id = p_igreja_id
    UNION ALL
    SELECT id, numero_etapa, titulo
    FROM public.etapas_trilha
    WHERE igreja_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.etapas_trilha WHERE igreja_id = p_igreja_id)
  ),
  total_etapas AS (
    SELECT COUNT(*)::INT AS n FROM etapas
  ),
  conclusoes AS (
    SELECT met.membro_id, met.etapa_id
    FROM public.membro_etapas_trilha met
    JOIN escopo_membros em ON em.id = met.membro_id
    WHERE met.concluida = true
      AND met.etapa_id IN (SELECT id FROM etapas)
  ),
  por_membro AS (
    SELECT em.id AS membro_id, COUNT(c.etapa_id) AS concluidas
    FROM escopo_membros em
    LEFT JOIN conclusoes c ON c.membro_id = em.id
    GROUP BY em.id
  ),
  por_etapa AS (
    SELECT e.id, e.numero_etapa, e.titulo, COUNT(c.membro_id)::INT AS completion_count
    FROM etapas e
    LEFT JOIN conclusoes c ON c.etapa_id = e.id
    GROUP BY e.id, e.numero_etapa, e.titulo
  )
  SELECT jsonb_build_object(
    'totalMembers', (SELECT COUNT(*) FROM escopo_membros),
    'totalSteps', (SELECT n FROM total_etapas),
    'avgCompletionPercent', COALESCE((
      SELECT ROUND(AVG(
        CASE WHEN (SELECT n FROM total_etapas) > 0
          THEN pm.concluidas::NUMERIC / (SELECT n FROM total_etapas) * 100
          ELSE 0 END
      )::NUMERIC, 1)
      FROM por_membro pm
    ), 0),
    'completedCount', (
      SELECT COUNT(*) FROM por_membro pm
      WHERE (SELECT n FROM total_etapas) > 0 AND pm.concluidas >= (SELECT n FROM total_etapas)
    ),
    'notStarted', (SELECT COUNT(*) FROM por_membro pm WHERE pm.concluidas = 0),
    'inProgress', (
      SELECT COUNT(*) FROM por_membro pm
      WHERE pm.concluidas > 0
        AND ((SELECT n FROM total_etapas) = 0 OR pm.concluidas < (SELECT n FROM total_etapas))
    ),
    'steps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'stepNumber', pe.numero_etapa,
        'title', pe.titulo,
        'completionCount', pe.completion_count,
        'completionPercent', CASE WHEN (SELECT COUNT(*) FROM escopo_membros) > 0
          THEN ROUND(pe.completion_count::NUMERIC / (SELECT COUNT(*) FROM escopo_membros) * 100, 1)
          ELSE 0 END
      ) ORDER BY pe.numero_etapa)
      FROM por_etapa pe
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 2. Comparativo entre as unidades de um nível (Áreas ou Setores), lado a
--    lado, opcionalmente restrito às filhas diretas de uma unidade-pai.
CREATE OR REPLACE FUNCTION public.indicators_trilho_comparativo(
  p_igreja_id UUID,
  p_nivel_id UUID,
  p_unidade_pai_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH RECURSIVE candidatos AS (
    SELECT id, nome
    FROM public.unidades
    WHERE igreja_id = p_igreja_id
      AND nivel_tipo_id = p_nivel_id
      AND (p_unidade_pai_id IS NULL OR pai_id = p_unidade_pai_id)
  ),
  etapas AS (
    SELECT id
    FROM public.etapas_trilha
    WHERE igreja_id = p_igreja_id
    UNION ALL
    SELECT id
    FROM public.etapas_trilha
    WHERE igreja_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.etapas_trilha WHERE igreja_id = p_igreja_id)
  ),
  total_etapas AS (SELECT COUNT(*)::INT AS n FROM etapas),
  subtree AS (
    SELECT c.id AS raiz_id, c.id AS unidade_id FROM candidatos c
    UNION ALL
    SELECT s.raiz_id, u.id
    FROM public.unidades u
    JOIN subtree s ON u.pai_id = s.unidade_id
  ),
  membros_por_raiz AS (
    SELECT s.raiz_id, m.id AS membro_id
    FROM subtree s
    JOIN public.membros m ON m.unidade_id = s.unidade_id
    WHERE m.igreja_id = p_igreja_id
  ),
  conclusoes_por_membro AS (
    SELECT
      mpr.raiz_id,
      mpr.membro_id,
      COUNT(met.etapa_id) AS concluidas
    FROM membros_por_raiz mpr
    LEFT JOIN public.membro_etapas_trilha met
      ON met.membro_id = mpr.membro_id
      AND met.concluida = true
      AND met.etapa_id IN (SELECT id FROM etapas)
    GROUP BY mpr.raiz_id, mpr.membro_id
  ),
  agregado AS (
    SELECT
      cpm.raiz_id,
      COUNT(*) AS total_membros,
      AVG(
        CASE WHEN (SELECT n FROM total_etapas) > 0
          THEN cpm.concluidas::NUMERIC / (SELECT n FROM total_etapas) * 100
          ELSE 0 END
      ) AS avg_percent
    FROM conclusoes_por_membro cpm
    GROUP BY cpm.raiz_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', cand.id,
    'name', cand.nome,
    'totalMembers', COALESCE(ag.total_membros, 0),
    'avgCompletionPercent', ROUND(COALESCE(ag.avg_percent, 0)::NUMERIC, 1)
  ) ORDER BY COALESCE(ag.avg_percent, 0) DESC), '[]'::jsonb)
  INTO v_result
  FROM candidatos cand
  LEFT JOIN agregado ag ON ag.raiz_id = cand.id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.indicators_trilho_resumo(UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.indicators_trilho_comparativo(UUID, UUID, UUID) TO anon, authenticated, service_role;
