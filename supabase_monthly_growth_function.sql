-- ==============================================================================
-- MIGRAÇÃO APPCHURCH: FUNÇÃO RPC DE AGREGAÇÃO MENSAL DE CRESCIMENTO DE MEMBROS
-- ==============================================================================

-- 1. Índice composto de alta performance para a agregação por data de criação
CREATE INDEX IF NOT EXISTS idx_membros_igreja_criado_em 
ON public.membros (igreja_id, criado_em);

-- 2. Função RPC agregada no Postgres (recebe p_church_id como TEXT ou UUID)
CREATE OR REPLACE FUNCTION public.get_monthly_member_growth(p_church_id text)
RETURNS TABLE (
  mes timestamptz,
  novos bigint,
  vinculados bigint,
  sem_vinculo bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    date_trunc('month', COALESCE(criado_em, now())) AS mes,
    count(*)::bigint AS novos,
    count(*) FILTER (WHERE unidade_id IS NOT NULL)::bigint AS vinculados,
    count(*) FILTER (WHERE unidade_id IS NULL)::bigint AS sem_vinculo
  FROM public.membros
  WHERE igreja_id::text = p_church_id::text
  GROUP BY 1
  ORDER BY 1 ASC;
$$;

-- Permissão de execução para roles autenticadas e anônimas do Supabase
GRANT EXECUTE ON FUNCTION public.get_monthly_member_growth(text) TO authenticated, anon, service_role;
