-- ==============================================================================
-- Migração: Indicadores da Igreja › aba "Supervisão"
--
-- Uma ÚNICA função (RPC) devolve, num JSON pequeno, tudo que a aba precisa para
-- montar o gráfico "% de células supervisionadas por mês" nos últimos N meses:
-- os meses, as áreas, os setores e, para cada célula, em que meses ela existiu
-- e em quais foi supervisionada.
--
-- Por que assim: a tela filtra por Área/Setor, escolhe o mês clicado e lista as
-- células pendentes TUDO EM MEMÓRIA, a partir deste único resultado. Trocar de
-- filtro ou de mês não faz nova consulta ao banco e não faz o gráfico piscar.
-- O JSON tem ~1 linha por célula (centenas, no máximo), não uma linha por
-- relatório.
--
-- Regras de negócio:
--  * "Célula" = unidade do nível mais baixo da hierarquia (maior "ordem"),
--    o mesmo critério usado em /api/cells/deactivate e /api/hierarchy/user-covered-cells.
--  * Uma célula conta como supervisionada num mês se QUALQUER relatório semanal
--    dela naquele mês tiver supervisao = true.
--  * "Células que existiam no mês" (denominador): como as unidades foram
--    importadas de uma vez (unidades.criado_em / atualizado_em refletem a
--    importação, não o nascimento ou a desativação), usamos o histórico de
--    relatórios:
--      - início = mês do primeiro relatório da célula (sem relatório: mês de
--        criação);
--      - fim = mês do último relatório, só para célula INATIVA (célula ativa
--        continua existindo); inativa que nunca lançou relatório é ignorada.
--    Quando existirem datas reais de início/encerramento nas unidades, basta
--    trocar o cálculo de inicio_mes/fim_mes abaixo; a API e a tela não mudam.
--  * Meses sempre no fuso America/Sao_Paulo.
--
-- p_lider_id: membro cuja cobertura limita o resultado — as células das
-- unidades que ele lidera (unidade_lideres ativo) e de toda a subárvore delas.
-- NULL = igreja inteira (a rota da API passa NULL só para Pastor/Administrador).
-- A cobertura é resolvida aqui dentro (recursão no Postgres), sem trazer a
-- lista de unidades para o servidor.
--
-- Segurança: SECURITY DEFINER, então NÃO é exposta a anon/authenticated; só o
-- servidor (service_role) chama, depois de checar a sessão e a cobertura.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.indicators_supervisao(
  p_igreja_id UUID,
  p_lider_id UUID DEFAULT NULL,
  p_meses INT DEFAULT 12
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE arvore_lider AS (
    SELECT ul.unidade_id AS id
    FROM public.unidade_lideres ul
    WHERE p_lider_id IS NOT NULL
      AND ul.pessoa_id = p_lider_id
      AND ul.ativo
    UNION
    SELECT u.id
    FROM public.unidades u
    JOIN arvore_lider a ON u.pai_id = a.id
    WHERE u.igreja_id = p_igreja_id
  ),
  base AS (
    SELECT date_trunc('month', timezone('America/Sao_Paulo', now()))::date AS mes_atual
  ),
  meses AS (
    SELECT g AS idx,
           (b.mes_atual - ((GREATEST(p_meses, 1) - 1 - g) * INTERVAL '1 month'))::date AS mes
    FROM base b, generate_series(0, GREATEST(p_meses, 1) - 1) AS g
  ),
  janela AS (
    SELECT MIN(mes) AS inicio, COUNT(*)::int AS n FROM meses
  ),
  nivel_folha AS (
    SELECT id
    FROM public.nivel_tipo
    WHERE igreja_id = p_igreja_id
      AND ordem = (SELECT MAX(ordem) FROM public.nivel_tipo WHERE igreja_id = p_igreja_id)
  ),
  celulas AS (
    SELECT u.id, u.nome, u.pai_id, u.ativo,
           date_trunc('month', timezone('America/Sao_Paulo', u.criado_em))::date AS mes_criacao
    FROM public.unidades u
    WHERE u.igreja_id = p_igreja_id
      AND u.nivel_tipo_id IN (SELECT id FROM nivel_folha)
      AND (p_lider_id IS NULL OR u.id IN (SELECT id FROM arvore_lider))
  ),
  relatorios_mes AS (
    SELECT r.unidade_id,
           date_trunc('month', r.data_relatorio)::date AS mes,
           BOOL_OR(r.supervisao) AS supervisionada
    FROM public.relatorios_semanais r
    WHERE r.igreja_id = p_igreja_id
      AND r.unidade_id IN (SELECT id FROM celulas)
    GROUP BY 1, 2
  ),
  limites AS (
    SELECT c.id, MIN(rm.mes) AS primeiro, MAX(rm.mes) AS ultimo
    FROM celulas c
    LEFT JOIN relatorios_mes rm ON rm.unidade_id = c.id
    GROUP BY c.id
  ),
  celulas_calc AS (
    SELECT c.id, c.nome, c.pai_id,
           COALESCE(l.primeiro, c.mes_criacao) AS inicio_mes,
           CASE WHEN c.ativo THEN NULL ELSE l.ultimo END AS fim_mes
    FROM celulas c
    JOIN limites l ON l.id = c.id
    WHERE c.ativo OR l.ultimo IS NOT NULL
  ),
  celulas_idx AS (
    SELECT cc.id, cc.nome, cc.pai_id,
           GREATEST(0, (EXTRACT(YEAR FROM cc.inicio_mes)::int - EXTRACT(YEAR FROM j.inicio)::int) * 12
                       + EXTRACT(MONTH FROM cc.inicio_mes)::int - EXTRACT(MONTH FROM j.inicio)::int) AS ini,
           CASE WHEN cc.fim_mes IS NULL THEN NULL
                ELSE (EXTRACT(YEAR FROM cc.fim_mes)::int - EXTRACT(YEAR FROM j.inicio)::int) * 12
                     + EXTRACT(MONTH FROM cc.fim_mes)::int - EXTRACT(MONTH FROM j.inicio)::int END AS fim
    FROM celulas_calc cc, janela j
  ),
  celulas_json AS (
    SELECT ci.id, ci.nome, ci.pai_id, ci.ini, ci.fim,
           COALESCE((
             SELECT jsonb_agg(m.idx ORDER BY m.idx)
             FROM relatorios_mes rm
             JOIN meses m ON m.mes = rm.mes
             WHERE rm.unidade_id = ci.id AND rm.supervisionada
           ), '[]'::jsonb) AS sup
    FROM celulas_idx ci
    WHERE ci.fim IS NULL OR ci.fim >= 0
  ),
  setores AS (
    SELECT s.id, s.nome, s.pai_id, s.nivel_tipo_id
    FROM public.unidades s
    WHERE s.id IN (SELECT pai_id FROM celulas_json WHERE pai_id IS NOT NULL)
  ),
  areas AS (
    SELECT a.id, a.nome, a.nivel_tipo_id
    FROM public.unidades a
    WHERE a.id IN (SELECT pai_id FROM setores WHERE pai_id IS NOT NULL)
  )
  SELECT jsonb_build_object(
    'months', (SELECT jsonb_agg(to_char(mes, 'YYYY-MM-DD') ORDER BY idx) FROM meses),
    'labels', jsonb_build_object(
      'sector', (SELECT nt.nome FROM public.nivel_tipo nt WHERE nt.id = (SELECT nivel_tipo_id FROM setores LIMIT 1)),
      'area',   (SELECT nt.nome FROM public.nivel_tipo nt WHERE nt.id = (SELECT nivel_tipo_id FROM areas LIMIT 1))
    ),
    'areas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.nome) ORDER BY a.nome) FROM areas a), '[]'::jsonb),
    'sectors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.nome, 'areaId', s.pai_id) ORDER BY s.nome) FROM setores s), '[]'::jsonb),
    'cells', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cj.id, 'name', cj.nome, 'sectorId', cj.pai_id,
        'start', cj.ini, 'end', cj.fim, 'sup', cj.sup
      ) ORDER BY cj.nome)
      FROM celulas_json cj
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.indicators_supervisao(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.indicators_supervisao(UUID, UUID, INT) TO service_role;
