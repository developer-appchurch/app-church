-- ==============================================================================
-- Migração: Indicadores da Igreja › aba "Organograma" em UMA consulta
--
-- Devolve, num JSON pequeno, a árvore ativa da igreja (unidades, nível, cor e
-- líderes de cada uma) e os pastores. Substitui ~9 consultas em sequência feitas
-- pela API (unidades, níveis, igreja, papéis, vínculos de liderança em lotes,
-- membros em lotes) por uma ida só ao banco.
--
-- Sem filtro de cobertura: quem tem acesso à tela vê o organograma inteiro
-- (a API checa a sessão e o nível antes de chamar). Quais unidades a pessoa
-- pode recolorir é calculado na API a partir dos ids dos líderes.
--
-- Segurança: SECURITY DEFINER, não exposta a anon/authenticated; só o servidor
-- (service_role) chama. Idempotente.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.indicators_organograma(p_igreja_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH niveis AS (
    SELECT id, nome, ordem FROM public.nivel_tipo WHERE igreja_id = p_igreja_id
  ),
  folha AS (
    SELECT COALESCE(MAX(ordem), 0) AS ordem FROM niveis
  ),
  lideres AS (
    SELECT ul.unidade_id,
           jsonb_agg(jsonb_build_object('id', ul.pessoa_id, 'nome', m.nome) ORDER BY ul.criado_em) AS pessoas
    FROM public.unidade_lideres ul
    JOIN public.membros m ON m.id = ul.pessoa_id
    JOIN public.unidades u ON u.id = ul.unidade_id
    WHERE ul.ativo AND u.ativo AND u.igreja_id = p_igreja_id
    GROUP BY ul.unidade_id
  ),
  pastores AS (
    SELECT m.nome
    FROM public.membros m
    JOIN public.papeis p ON p.id = m.papel_id
    WHERE m.igreja_id = p_igreja_id AND p.nivel_hierarquia >= 6
    ORDER BY m.nome
  )
  SELECT jsonb_build_object(
    'church', jsonb_build_object(
      'name', (SELECT i.nome FROM public.igrejas i WHERE i.id = p_igreja_id),
      'pastors', COALESCE((SELECT jsonb_agg(pa.nome) FROM pastores pa), '[]'::jsonb)
    ),
    'nodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', u.nome,
        'parentId', u.pai_id,
        'order', n.ordem,
        'levelName', n.nome,
        'isLeaf', n.ordem >= (SELECT ordem FROM folha),
        'color', u.cor,
        'leaders', COALESCE(l.pessoas, '[]'::jsonb)
      ) ORDER BY u.nome)
      FROM public.unidades u
      JOIN niveis n ON n.id = u.nivel_tipo_id
      LEFT JOIN lideres l ON l.unidade_id = u.id
      WHERE u.igreja_id = p_igreja_id AND u.ativo
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.indicators_organograma(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.indicators_organograma(UUID) TO service_role;
