-- ==============================================================================
-- Migração: Corrige contagem de curtidas/comentários do Feed + remove tabelas sem uso
-- Data: 2026-10-08
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PARTE 1 — Contagem de curtidas e comentários
--
-- Problemas:
--  a) Os gatilhos que atualizam postagens_feed.quantidade_curtidas/quantidade_comentarios
--     rodavam com a permissão do usuário logado; como não há política de UPDATE em
--     postagens_feed, a atualização era bloqueada em silêncio (posts novos ficavam em 0).
--  b) toggle_curtida_post atualizava o contador E o gatilho também: contagem em dobro
--     sempre que a atualização passava.
-- ------------------------------------------------------------------------------

-- a) Gatilhos passam a rodar com a permissão do dono da função (ignoram o RLS só para
--    manter os contadores). Continuam restritos ao post da curtida/comentário.
ALTER FUNCTION public.sync_post_likes_count() SECURITY DEFINER;
ALTER FUNCTION public.sync_post_comments_count() SECURITY DEFINER;

-- b) A função de curtir não mexe mais no contador (o gatilho cuida disso) e devolve
--    o valor já atualizado.
CREATE OR REPLACE FUNCTION public.toggle_curtida_post(p_post_id uuid, p_membro_id uuid)
RETURNS TABLE(liked boolean, likes_count integer)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted integer;
  v_count integer;
BEGIN
  DELETE FROM public.curtidas
  WHERE post_id = p_post_id AND membro_id = p_membro_id::text;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    INSERT INTO public.curtidas (id, post_id, membro_id, criado_em)
    VALUES (gen_random_uuid(), p_post_id, p_membro_id::text, now())
    ON CONFLICT (post_id, membro_id) DO NOTHING;
  END IF;

  SELECT COALESCE(quantidade_curtidas, 0) INTO v_count
  FROM public.postagens_feed WHERE id = p_post_id;

  RETURN QUERY SELECT (v_deleted = 0), COALESCE(v_count, 0);
END;
$function$;

-- c) Recalcula os contadores de todos os posts a partir dos dados reais
UPDATE public.postagens_feed p
SET quantidade_curtidas = (SELECT count(*) FROM public.curtidas c WHERE c.post_id = p.id),
    quantidade_comentarios = (SELECT count(*) FROM public.comentarios_postagem c WHERE c.post_id = p.id);

-- ------------------------------------------------------------------------------
-- PARTE 2 — Remove tabelas vazias e sem uso no app
-- (rodar DEPOIS que a versão do app sem referências a elas estiver publicada)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS public.avisos CASCADE;
DROP TABLE IF EXISTS public.unidade_cobertura CASCADE;
