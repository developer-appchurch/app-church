-- ==============================================================================
-- Migração: Indicadores da Igreja › aba da menor unidade (Células) em UMA consulta
--
-- Devolve, num JSON compacto, o apurado semanal dos relatórios de célula:
--   * 'label'  : nome do menor nível da hierarquia da igreja (ex.: "Célula");
--   * 'areas' / 'sectors': para os filtros (setor = pai da célula; área = pai do setor);
--   * 'weekly' : por semana (domingo a sábado) e setor — n = relatórios com reunião,
--                m = soma de membros, g = soma de convidados, c = células distintas.
-- Só entram relatórios com houve_reuniao = true. Os filtros e o nº de semanas
-- são aplicados na tela, sem nova consulta.
--
-- Segurança: SECURITY DEFINER, só o servidor (service_role) executa. Idempotente.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.indicators_celulas(p_igreja_id UUID, p_semanas INT DEFAULT 104)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hoje AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  folha AS (
    SELECT nt.id, nt.nome
    FROM public.nivel_tipo nt
    WHERE nt.igreja_id = p_igreja_id
    ORDER BY nt.ordem DESC
    LIMIT 1
  ),
  semanal AS (
    SELECT (r.data_relatorio - EXTRACT(DOW FROM r.data_relatorio)::int) AS w,
           u.pai_id AS s,
           count(*)::int AS n,
           COALESCE(sum(r.qtd_membros), 0)::int AS m,
           COALESCE(sum(r.qtd_convidados), 0)::int AS g,
           count(DISTINCT r.unidade_id)::int AS c
    FROM public.relatorios_semanais r
    JOIN public.unidades u ON u.id = r.unidade_id
    CROSS JOIN hoje
    WHERE r.igreja_id = p_igreja_id
      AND r.houve_reuniao IS TRUE
      AND u.nivel_tipo_id = (SELECT id FROM folha)
      AND r.data_relatorio >= hoje.d - (GREATEST(p_semanas, 1) * 7 + 7)
    GROUP BY 1, 2
  ),
  setores AS (
    SELECT s.id, s.nome, s.pai_id
    FROM public.unidades s
    WHERE s.id IN (SELECT s FROM semanal WHERE s IS NOT NULL)
  ),
  areas AS (
    SELECT a.id, a.nome
    FROM public.unidades a
    WHERE a.id IN (SELECT pai_id FROM setores WHERE pai_id IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'today', (SELECT d FROM hoje),
    'label', (SELECT nome FROM folha),
    'sectorLabel', (SELECT nt.nome FROM public.nivel_tipo nt
                    WHERE nt.id = (SELECT nivel_tipo_id FROM public.unidades WHERE id = (SELECT id FROM setores LIMIT 1))),
    'areaLabel', (SELECT nt.nome FROM public.nivel_tipo nt
                  WHERE nt.id = (SELECT nivel_tipo_id FROM public.unidades WHERE id = (SELECT id FROM areas LIMIT 1))),
    'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.nome) ORDER BY a.nome) FROM areas a), '[]'::jsonb),
    'sectors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.nome, 'areaId', s.pai_id) ORDER BY s.nome) FROM setores s), '[]'::jsonb),
    'weekly', COALESCE((SELECT jsonb_agg(to_jsonb(sr)) FROM semanal sr), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.indicators_celulas(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.indicators_celulas(UUID, INT) TO service_role;
