-- ==============================================================================
-- Migração: Indicadores da Igreja › aba "Cultos" em UMA consulta
--
-- Devolve, num JSON compacto, tudo que os gráficos e o histórico de cultos precisam:
--   * campi e horários (para os filtros);
--   * 'monthly': somas por ano, mês e horário (últimos 5 anos) — barras ano x ano e histórico;
--   * 'weekly' : somas por semana (domingo a sábado) e horário (últimas 53 semanas) — tendência;
--   * 'peaks'  : maior público (adultos + crianças) de cada horário nos últimos 12 meses.
-- Os filtros (campus, culto, indicador, soma/média) são aplicados na tela, sem nova consulta.
--
-- Campos das linhas: n = nº de cultos lançados; a = adultos; c = crianças; v = voluntários;
-- cv = conversões; r = reconciliações; g = convidados. Total de pessoas = a + c.
--
-- Segurança: SECURITY DEFINER, não exposta a anon/authenticated; só o servidor
-- (service_role) chama, depois de validar sessão e nível. Idempotente.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.indicators_culto(p_igreja_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH hoje AS (
    SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
  ),
  base AS (
    SELECT c.horario_id, c.data_culto, c.adultos, c.criancas, c.voluntarios,
           c.conversoes, c.reconciliacoes, c.convidados, c.total
    FROM public.culto_contagens c
    CROSS JOIN hoje
    WHERE c.igreja_id = p_igreja_id
      AND c.data_culto >= make_date(EXTRACT(YEAR FROM hoje.d)::int - 4, 1, 1)
  ),
  mensal AS (
    SELECT EXTRACT(YEAR FROM data_culto)::int AS y,
           EXTRACT(MONTH FROM data_culto)::int AS m,
           horario_id AS h,
           count(*)::int AS n,
           sum(adultos)::int AS a, sum(criancas)::int AS c, sum(voluntarios)::int AS v,
           sum(conversoes)::int AS cv, sum(reconciliacoes)::int AS r, sum(convidados)::int AS g
    FROM base
    GROUP BY 1, 2, 3
  ),
  semanal AS (
    SELECT (b.data_culto - EXTRACT(DOW FROM b.data_culto)::int) AS w,
           b.horario_id AS h,
           count(*)::int AS n,
           sum(b.adultos)::int AS a, sum(b.criancas)::int AS c, sum(b.voluntarios)::int AS v,
           sum(b.conversoes)::int AS cv, sum(b.reconciliacoes)::int AS r, sum(b.convidados)::int AS g
    FROM base b
    CROSS JOIN hoje
    WHERE b.data_culto >= hoje.d - 371
    GROUP BY 1, 2
  ),
  picos AS (
    SELECT DISTINCT ON (b.horario_id) b.horario_id AS h, b.data_culto AS d, b.total AS t
    FROM base b
    CROSS JOIN hoje
    WHERE b.data_culto >= hoje.d - 365
    ORDER BY b.horario_id, b.total DESC, b.data_culto DESC
  )
  SELECT jsonb_build_object(
    'today', (SELECT d FROM hoje),
    'campuses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', cp.id, 'name', cp.nome, 'active', cp.ativo) ORDER BY cp.nome)
      FROM public.campus cp WHERE cp.igreja_id = p_igreja_id
    ), '[]'::jsonb),
    'schedules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ch.id, 'campusId', ch.campus_id, 'name', ch.nome,
        'dayOfWeek', ch.dia_semana, 'time', to_char(ch.hora, 'HH24:MI'), 'active', ch.ativo
      ) ORDER BY ch.dia_semana, ch.hora)
      FROM public.culto_horarios ch WHERE ch.igreja_id = p_igreja_id
    ), '[]'::jsonb),
    'monthly', COALESCE((SELECT jsonb_agg(to_jsonb(mr)) FROM mensal mr), '[]'::jsonb),
    'weekly',  COALESCE((SELECT jsonb_agg(to_jsonb(sr)) FROM semanal sr), '[]'::jsonb),
    'peaks',   COALESCE((SELECT jsonb_agg(to_jsonb(pr)) FROM picos pr), '[]'::jsonb)
  );
$$;

-- Somente o servidor (service_role) executa.
REVOKE ALL ON FUNCTION public.indicators_culto(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.indicators_culto(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.indicators_culto(UUID) TO service_role;
