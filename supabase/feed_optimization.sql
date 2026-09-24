-- ==============================================================================
-- APPCHURCH - OTIMIZAÇÃO AVANÇADA DO FEED DE NOTÍCIAS & STORAGE
-- Execute este script no SQL Editor do Supabase Dashboard
-- ==============================================================================

-- 1. ADICIONAR COLUNAS DE PERFORMANCE NA TABELA postagens_feed
ALTER TABLE IF EXISTS public.postagens_feed 
  ADD COLUMN IF NOT EXISTS imagem_largura INTEGER,
  ADD COLUMN IF NOT EXISTS imagem_altura INTEGER,
  ADD COLUMN IF NOT EXISTS quantidade_comentarios INTEGER DEFAULT 0;

-- Atualiza contagem inicial de comentários para posts existentes
UPDATE public.postagens_feed p
SET quantidade_comentarios = (
  SELECT COUNT(*) 
  FROM public.comentarios_postagem c 
  WHERE c.post_id = p.id
)
WHERE p.quantidade_comentarios IS NULL OR p.quantidade_comentarios = 0;

-- 2. TABELA DE CURTIDAS COM CONTROLE ATÔMICO
CREATE TABLE IF NOT EXISTS public.curtidas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.postagens_feed(id) ON DELETE CASCADE,
  membro_id TEXT NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_curtidas_post_membro UNIQUE (post_id, membro_id)
);

-- Caso a tabela postagens_feed use id como text em ambientes legados:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'curtidas'
  ) THEN
    CREATE TABLE public.curtidas (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      post_id TEXT NOT NULL,
      membro_id TEXT NOT NULL,
      criado_em TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT uq_curtidas_post_membro UNIQUE (post_id, membro_id)
    );
  END IF;
END $$;

-- 3. ÍNDICES DE ALTA PERFORMANCE PARA O FEED E COMENTÁRIOS
-- Paginação por cursor ultra rápida (igreja_id, criado_em desc, id desc)
CREATE INDEX IF NOT EXISTS idx_postagens_feed_cursor 
  ON public.postagens_feed(igreja_id, criado_em DESC, id DESC);

-- Índice para filtro por unidade/célula
CREATE INDEX IF NOT EXISTS idx_postagens_feed_unidade 
  ON public.postagens_feed(unidade_id);

-- Índice para comentários paginados por post
CREATE INDEX IF NOT EXISTS idx_comentarios_post_criado 
  ON public.comentarios_postagem(post_id, criado_em ASC);

-- Índice para busca de curtidas por post e membro
CREATE INDEX IF NOT EXISTS idx_curtidas_post_membro 
  ON public.curtidas(post_id, membro_id);

-- 4. TRIGGER PARA MANTER quantidade_comentarios ATÔMICA
CREATE OR REPLACE FUNCTION public.sync_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.postagens_feed
    SET quantidade_comentarios = COALESCE(quantidade_comentarios, 0) + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.postagens_feed
    SET quantidade_comentarios = GREATEST(COALESCE(quantidade_comentarios, 1) - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_comentarios_count ON public.comentarios_postagem;
CREATE TRIGGER trg_sync_comentarios_count
  AFTER INSERT OR DELETE ON public.comentarios_postagem
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_comments_count();

-- 5. TRIGGER PARA MANTER quantidade_curtidas ATÔMICA
CREATE OR REPLACE FUNCTION public.sync_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.postagens_feed
    SET quantidade_curtidas = COALESCE(quantidade_curtidas, 0) + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.postagens_feed
    SET quantidade_curtidas = GREATEST(COALESCE(quantidade_curtidas, 1) - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_curtidas_count ON public.curtidas;
CREATE TRIGGER trg_sync_curtidas_count
  AFTER INSERT OR DELETE ON public.curtidas
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_likes_count();

-- 6. REVISÃO DE RLS COM (SELECT auth.uid()) ESCALAR
ALTER TABLE IF EXISTS public.postagens_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comentarios_postagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.curtidas ENABLE ROW LEVEL SECURITY;

-- postagens_feed
DROP POLICY IF EXISTS "Leitura publica de postagens feed" ON public.postagens_feed;
DROP POLICY IF EXISTS "Insercao de postagens por lideres" ON public.postagens_feed;
DROP POLICY IF EXISTS "Exclusao de postagens por autor ou pastor" ON public.postagens_feed;
DROP POLICY IF EXISTS "Acesso total postagens_feed" ON public.postagens_feed;

CREATE POLICY "Leitura de postagens da igreja"
ON public.postagens_feed FOR SELECT
USING (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "Insercao de postagens na igreja"
ON public.postagens_feed FOR INSERT
WITH CHECK (
  igreja_id IN (
    SELECT igreja_id FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

CREATE POLICY "Exclusao de postagens"
ON public.postagens_feed FOR DELETE
USING (
  nome_autor IN (
    SELECT nome FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.membros 
    WHERE id = (SELECT auth.uid()) 
    AND (funcao ILIKE '%pastor%' OR funcao ILIKE '%administrador%')
  )
  OR (SELECT auth.uid()) IS NULL
);

-- comentarios_postagem
DROP POLICY IF EXISTS "Acesso total comentarios_postagem" ON public.comentarios_postagem;
DROP POLICY IF EXISTS "Leitura de comentarios" ON public.comentarios_postagem;
DROP POLICY IF EXISTS "Insercao de comentarios" ON public.comentarios_postagem;

CREATE POLICY "Leitura de comentarios"
ON public.comentarios_postagem FOR SELECT
USING (true);

CREATE POLICY "Insercao de comentarios"
ON public.comentarios_postagem FOR INSERT
WITH CHECK (true);

CREATE POLICY "Exclusao de comentarios"
ON public.comentarios_postagem FOR DELETE
USING (
  nome_autor IN (
    SELECT nome FROM public.membros WHERE id = (SELECT auth.uid())
  )
  OR (SELECT auth.uid()) IS NULL
);

-- curtidas
DROP POLICY IF EXISTS "Acesso total curtidas" ON public.curtidas;
CREATE POLICY "Acesso total curtidas"
ON public.curtidas FOR ALL
USING (true)
WITH CHECK (true);

-- 7. POLÍTICAS DO SUPABASE STORAGE (BUCKET: feed)
-- Garante acesso de leitura público e upload autenticado/membro por congregação
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feed', 
  'feed', 
  true, 
  2097152, -- 2 MB
  ARRAY['image/webp', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg']::text[];

DROP POLICY IF EXISTS "Leitura publica de imagens do feed" ON storage.objects;
DROP POLICY IF EXISTS "Upload de imagens no feed" ON storage.objects;
DROP POLICY IF EXISTS "Exclusao de imagens no feed" ON storage.objects;

CREATE POLICY "Leitura publica de imagens do feed"
ON storage.objects FOR SELECT
USING (bucket_id = 'feed');

CREATE POLICY "Upload de imagens no feed"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'feed');

CREATE POLICY "Exclusao de imagens no feed"
ON storage.objects FOR DELETE
USING (bucket_id = 'feed');

DO $$
BEGIN
  RAISE NOTICE '>>> Otimizações de Feed, Storage, Triggers e Índices aplicadas com sucesso!';
END $$;
