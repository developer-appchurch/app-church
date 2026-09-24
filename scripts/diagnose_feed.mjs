import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://srjkwwddbxniqhzqvrhc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyamt3d2RkYnhuaXFoenF2cmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDI4MjgsImV4cCI6MjEwNTU3ODgyOH0.9uvatfClKVxyzBrBC7zGL9ujSaVYtyxf74q6i1YVOjs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('--- INICIANDO DIAGNÓSTICO DO FEED ---');
  const t0 = Date.now();

  // 1. Requisição de posts
  const tPosts0 = Date.now();
  const { data: posts, error: postErr } = await supabase
    .from('postagens_feed')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(10);
  const tPosts = Date.now() - tPosts0;

  if (postErr) {
    console.error('Erro ao buscar postagens_feed:', postErr);
    return;
  }

  const postsJson = JSON.stringify(posts || []);
  const postsSizeBytes = Buffer.byteLength(postsJson, 'utf8');

  // 2. Análise de imagens e avatares nos posts
  let base64ImageCount = 0;
  let urlImageCount = 0;
  let nullImageCount = 0;
  let base64AvatarCount = 0;
  let urlAvatarCount = 0;
  let maxImageSizeBytes = 0;

  (posts || []).forEach((p, idx) => {
    if (!p.url_imagem) {
      nullImageCount++;
    } else if (p.url_imagem.startsWith('data:image')) {
      base64ImageCount++;
      const size = Buffer.byteLength(p.url_imagem, 'utf8');
      if (size > maxImageSizeBytes) maxImageSizeBytes = size;
    } else {
      urlImageCount++;
    }

    if (!p.avatar_autor) {
      // null
    } else if (p.avatar_autor.startsWith('data:image')) {
      base64AvatarCount++;
    } else {
      urlAvatarCount++;
    }
  });

  // 3. Comentários
  const postIds = (posts || []).map(p => p.id);
  const tComments0 = Date.now();
  let commentsData = [];
  let commentsCount = 0;
  if (postIds.length > 0) {
    const res = await supabase
      .from('comentarios_postagem')
      .select('*')
      .in('post_id', postIds)
      .order('criado_em', { ascending: true });
    commentsData = res.data || [];
    commentsCount = commentsData.length;
  }
  const tComments = Date.now() - tComments0;
  const commentsSizeBytes = Buffer.byteLength(JSON.stringify(commentsData), 'utf8');

  const totalTime = Date.now() - t0;
  const totalSizeBytes = postsSizeBytes + commentsSizeBytes;

  console.log({
    tempoTotalMs: totalTime,
    tempoBuscaPostsMs: tPosts,
    tempoBuscaComentariosMs: tComments,
    numeroRequisicoesParaMontarFeed: 2, // 1 posts + 1 comentarios em lote
    totalPostsRetornados: posts?.length || 0,
    tamanhoRespostaPostsKB: (postsSizeBytes / 1024).toFixed(2),
    tamanhoRespostaComentariosKB: (commentsSizeBytes / 1024).toFixed(2),
    tamanhoTotalPayloadKB: (totalSizeBytes / 1024).toFixed(2),
    diagnosticoUrlImagem: {
      base64Count: base64ImageCount,
      urlCount: urlImageCount,
      nullCount: nullImageCount,
      maiorImagemBase64KB: (maxImageSizeBytes / 1024).toFixed(2)
    },
    diagnosticoAvatarAutor: {
      base64Count: base64AvatarCount,
      urlCount: urlAvatarCount
    },
    comentariosBuscadosPorPost: 'Sim (atualmente busca todos os comentários dos 10 posts na carga inicial do feed)',
  });
}

diagnose().catch(console.error);
