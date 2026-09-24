import { getSupabaseServerClient } from '../lib/supabaseServer.ts';

function base64ToBuffer(dataUrl: string): { buffer: Buffer; contentType: string; extension: string } {
  const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('String base64 inválida');
  }
  const contentType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const extension = contentType.includes('webp') ? 'webp' : contentType.includes('png') ? 'png' : 'jpeg';
  return { buffer, contentType, extension };
}

async function migrateBase64() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  console.log('--- MIGRANDO POSTS E AVATARES DE BASE64 PARA O STORAGE ---');

  // 1. Migrar postagens_feed
  const { data: posts, error: postErr } = await supabase
    .from('postagens_feed')
    .select('id, url_imagem, avatar_autor, igreja_id')
    .or('url_imagem.like.data:%,avatar_autor.like.data:%');

  console.log(`Encontrados ${posts?.length || 0} posts com base64`);

  if (posts && posts.length > 0) {
    for (const post of posts) {
      const updates: any = {};

      // Imagem do post
      if (post.url_imagem && post.url_imagem.startsWith('data:image')) {
        try {
          const { buffer, contentType, extension } = base64ToBuffer(post.url_imagem);
          const path = `posts/${post.igreja_id || 'geral'}/${post.id}_${Date.now()}.${extension}`;
          const { data: upData, error: upErr } = await supabase.storage
            .from('feed')
            .upload(path, buffer, {
              contentType,
              cacheControl: '31536000',
              upsert: true,
            });

          if (upErr) {
            console.error(`Erro ao subir imagem do post ${post.id}:`, upErr);
          } else {
            const { data: pub } = supabase.storage.from('feed').getPublicUrl(path);
            updates.url_imagem = pub.publicUrl;
            console.log(`Post ${post.id} imagem migrada para:`, pub.publicUrl);
          }
        } catch (e) {
          console.error(`Falha ao converter base64 do post ${post.id}:`, e);
        }
      }

      // Avatar do autor do post
      if (post.avatar_autor && post.avatar_autor.startsWith('data:image')) {
        try {
          const { buffer, contentType, extension } = base64ToBuffer(post.avatar_autor);
          const path = `avatars/${post.igreja_id || 'geral'}/${post.id}_author_${Date.now()}.${extension}`;
          const { error: upErr } = await supabase.storage
            .from('feed')
            .upload(path, buffer, {
              contentType,
              cacheControl: '31536000',
              upsert: true,
            });

          if (!upErr) {
            const { data: pub } = supabase.storage.from('feed').getPublicUrl(path);
            updates.avatar_autor = pub.publicUrl;
            console.log(`Post ${post.id} avatar migrado para:`, pub.publicUrl);
          }
        } catch (e) {
          console.error(`Falha ao converter avatar do post ${post.id}:`, e);
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from('postagens_feed')
          .update(updates)
          .eq('id', post.id);
        console.log(`Atualização do post ${post.id}:`, updErr ? updErr.message : 'Sucesso!');
      }
    }
  }

  // 2. Migrar avatares da tabela membros
  const { data: members, error: memErr } = await supabase
    .from('membros')
    .select('id, url_avatar, igreja_id')
    .like('url_avatar', 'data:%')
    .limit(50);

  console.log(`Encontrados ${members?.length || 0} membros com avatar em base64`);
  if (members && members.length > 0) {
    for (const mem of members) {
      try {
        const { buffer, contentType, extension } = base64ToBuffer(mem.url_avatar);
        const path = `avatars/${mem.igreja_id || 'geral'}/member_${mem.id}.${extension}`;
        const { error: upErr } = await supabase.storage
          .from('feed')
          .upload(path, buffer, {
            contentType,
            cacheControl: '31536000',
            upsert: true,
          });

        if (!upErr) {
          const { data: pub } = supabase.storage.from('feed').getPublicUrl(path);
          await supabase
            .from('membros')
            .update({ url_avatar: pub.publicUrl })
            .eq('id', mem.id);
          console.log(`Membro ${mem.id} avatar migrado para:`, pub.publicUrl);
        }
      } catch (e) {
        console.error(`Falha ao migrar avatar do membro ${mem.id}:`, e);
      }
    }
  }

  console.log('--- MIGRAÇÃO CONCLUÍDA ---');
}

migrateBase64().catch(console.error);
