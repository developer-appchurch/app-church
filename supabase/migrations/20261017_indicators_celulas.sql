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
  niveis AS (
    SELECT nt.id, nt.nome, row_number() OVER (ORDER BY nt.ordem DESC) AS pos
    FROM public.nivel_tipo nt
    WHERE nt.igreja_id = p_igreja_id
  ),
  nivel_setor AS (SELECT id, nome FROM niveis WHERE pos = 2),
  nivel_area AS (SELECT id, nome FROM niveis WHERE pos = 3),
  semanal AS (
    -- s = setor da célula (só quando o pai é de fato do nível Setor);
    -- a = área (pai do setor, ou o próprio pai quando a célula está ligada direto a uma área)
    SELECT (r.data_relatorio - EXTRACT(DOW FROM r.data_relatorio)::int) AS w,
           CASE WHEN p.nivel_tipo_id = (SELECT id FROM nivel_setor) THEN p.id END AS s,
           CASE WHEN p.nivel_tipo_id = (SELECT id FROM nivel_setor) THEN p.pai_id
                WHEN p.nivel_tipo_id = (SELECT id FROM nivel_area) THEN p.id END AS a,
           count(*)::int AS n,
           COALESCE(sum(r.qtd_membros), 0)::int AS m,
           COALESCE(sum(r.qtd_convidados), 0)::int AS g,
           count(DISTINCT r.unidade_id)::int AS c
    FROM public.relatorios_semanais r
    JOIN public.unidades u ON u.id = r.unidade_id
    LEFT JOIN public.unidades p ON p.id = u.pai_id
    CROSS JOIN hoje
    WHERE r.igreja_id = p_igreja_id
      AND r.houve_reuniao IS TRUE
      AND u.nivel_tipo_id = (SELECT id FROM folha)
      AND r.data_relatorio >= hoje.d - (GREATEST(p_semanas, 1) * 7 + 7)
    GROUP BY 1, 2, 3
  ),
  setores AS (
    SELECT s.id, s.nome, s.pai_id
    FROM public.unidades s
    WHERE s.id IN (SELECT s FROM semanal WHERE s IS NOT NULL)
  ),
  areas AS (
    SELECT a.id, a.nome
    FROM public.unidades a
    WHERE a.id IN (SELECT a FROM semanal WHERE a IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'today', (SELECT d FROM hoje),
    'label', (SELECT nome FROM folha),
    'sectorLabel', (SELECT nome FROM nivel_setor),
    'areaLabel', (SELECT nome FROM nivel_area),
    'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.nome) ORDER BY a.nome) FROM areas a), '[]'::jsonb),
    'sectors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.nome, 'areaId', s.pai_id) ORDER BY s.nome) FROM setores s), '[]'::jsonb),
    'weekly', COALESCE((SELECT jsonb_agg(to_jsonb(sr)) FROM semanal sr), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.indicators_celulas(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.indicators_celulas(UUID, INT) TO service_role;
