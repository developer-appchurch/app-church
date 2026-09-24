-- ==============================================================================
-- APPCHURCH - SEGURANÇA AVANÇADA DE STORAGE & EDGE FUNCTION / ASSINATURA
-- Execute este script no SQL Editor do Supabase após validar o fluxo de URLs assinadas
-- ==============================================================================

-- AVALIAÇÃO DE SEGURANÇA DOS DADOS:
-- 1. INSERT (Upload):
--    A remoção da política aberta de INSERT em storage.objects impede que qualquer
--    usuário anônimo envie arquivos indiscriminados para o bucket. Agora todo upload
--    exige URL assinada temporária gerada pelo backend após validar se o membro
--    está ativo na tabela 'membros' e pertence à igreja indicada no caminho.
--
-- 2. DELETE (Exclusão):
--    A remoção da política aberta de DELETE em storage.objects fecha a vulnerabilidade
--    crítica onde qualquer pessoa podia deletar fotos de terceiros. Agora a exclusão
--    é intermediada pela Edge Function / API Route que confere se o requisitante
--    é o autor do post ou possui papel de pastor/administrador.
--
-- 3. SELECT (Leitura):
--    - Mídias de feed social utilizam caminhos particionados com UUID v4 de alta
--      entropia ({igreja_id}/{uuid}.webp), o que impede enumeração ou adivinhação.
--    - Manter a leitura pública com cache de 1 ano (cacheControl: 31536000) permite
--      que os navegadores baixem as fotos diretamente via CDN em milissegundos sem
--      precisar assinar cada URL a cada requisição de página.
--    - Caso a igreja exija sigilo absoluto de suas imagens (nenhuma leitura anônima),
--      a política de SELECT pode ser removida conforme comando abaixo, ciente de que
--      todas as imagens exigirão tokens de leitura efêmeros.

-- 1. GARANTE CONFIGURAÇÕES DO BUCKET feed (Limite 2MB, WebP/JPEG)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feed', 
  'feed', 
  true, -- Altere para false apenas se optar por leitura 100% privada com signed URLs de leitura
  2097152, -- Limite estrito de 2 MB
  ARRAY['image/webp', 'image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/webp', 'image/jpeg']::text[];

-- 2. REMOÇÃO DAS POLÍTICAS DE INSERT E DELETE ABERTAS EM storage.objects
-- Com isso, NINGUÉM consegue fazer upload ou exclusão direta sem a Service Role ou Token Assinado!
DROP POLICY IF EXISTS "Upload de imagens no feed" ON storage.objects;
DROP POLICY IF EXISTS "Exclusao de imagens no feed" ON storage.objects;
DROP POLICY IF EXISTS "Permissao geral upload feed" ON storage.objects;
DROP POLICY IF EXISTS "Permissao geral exclusao feed" ON storage.objects;

-- 3. POLÍTICA DE SELECT DO BUCKET FEED
-- Se optar por remover a leitura pública para privacidade estrita, execute:
-- DROP POLICY IF EXISTS "Leitura publica de imagens do feed" ON storage.objects;
--
-- Caso opte pelo padrão recomendado para feed social (CDN rápida com UUID imprevisível):
DROP POLICY IF EXISTS "Leitura publica de imagens do feed" ON storage.objects;
CREATE POLICY "Leitura publica de imagens do feed"
ON storage.objects FOR SELECT
USING (bucket_id = 'feed');

DO $$
BEGIN
  RAISE NOTICE '>>> Políticas de segurança de Storage atualizadas com sucesso!';
  RAISE NOTICE '>>> Upload e Deleção agora são 100%% restritos ao backend/Edge Function com validação de membros.';
END $$;
