// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This code is designed to run in Supabase Edge Functions (Deno runtime)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-member-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface FeedImagePayload {
  action: 'upload' | 'excluir';
  memberId: string;
  login?: string;
  postId?: string;
  imagePath?: string;
  imageUrl?: string;
  extension?: string;
}

serve(async (req: Request) => {
  // Trata requisições preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Variáveis de ambiente do Supabase não configuradas na Edge Function.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Inicializa cliente com Service Role para bypass seguro de RLS após validação de regras de negócio
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const payload: FeedImagePayload = await req.json();
    const { action, memberId, login, postId, imagePath, imageUrl } = payload;

    if (!memberId) {
      return new Response(
        JSON.stringify({ error: 'Sessão inválida: memberId é obrigatório.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // (a) Validação da sessão do login próprio (tabela membros) e obtenção de igreja_id
    // =========================================================================
    let memberQuery = supabaseAdmin
      .from('membros')
      .select('id, nome, login, igreja_id, funcao, papel_id')
      .eq('id', memberId);

    let { data: member, error: memberErr } = await memberQuery.maybeSingle();

    // Fallback caso seja admin geral do sistema
    const isGlobalAdmin =
      member?.login === 'admin' ||
      member?.login === 'developer.appchurch@gmail.com' ||
      login === 'admin' ||
      login === 'developer.appchurch@gmail.com';

    if (!member && !isGlobalAdmin) {
      return new Response(
        JSON.stringify({ error: 'Membro não encontrado ou sessão não autenticada na tabela membros.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const churchId = member?.igreja_id || 'church-master';
    const memberName = (member?.nome || '').trim().toLowerCase();
    const memberRole = (member?.funcao || '').trim().toLowerCase();

    const isPastorOrAdmin =
      isGlobalAdmin ||
      memberRole.includes('pastor') ||
      memberRole.includes('pastora') ||
      memberRole.includes('administrador') ||
      memberRole.includes('diretoria');

    // =========================================================================
    // (b) Ação "upload": gera createSignedUploadUrl no caminho {igreja_id}/{uuid}.webp
    // =========================================================================
    if (action === 'upload') {
      const fileExt = payload.extension?.trim().toLowerCase() === 'jpeg' || payload.extension === 'jpg' ? 'jpg' : 'webp';
      const fileUuid = crypto.randomUUID();
      const storagePath = `${churchId}/${fileUuid}.${fileExt}`;

      // Gera a URL assinada de upload usando a service role
      const { data: signData, error: signError } = await supabaseAdmin.storage
        .from('feed')
        .createSignedUploadUrl(storagePath);

      if (signError || !signData) {
        return new Response(
          JSON.stringify({ error: `Erro ao gerar signed upload URL: ${signError?.message || 'Falha desconhecida'}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Obtém URL pública estática
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('feed')
        .getPublicUrl(storagePath);

      return new Response(
        JSON.stringify({
          success: true,
          signedUrl: signData.signedUrl,
          token: signData.token,
          path: storagePath,
          publicUrl: publicUrlData.publicUrl,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // (c) Ação "excluir": verifica que o post pertence à igreja do membro e ao autor
    // (ou a um papel administrador) e remove o arquivo do Storage
    // =========================================================================
    if (action === 'excluir') {
      let resolvedPath = imagePath;
      let targetPostId = postId;

      // Se postId foi enviado, busca a postagem para checagem estrita de permissão
      if (targetPostId) {
        const { data: post, error: postErr } = await supabaseAdmin
          .from('postagens_feed')
          .select('id, igreja_id, nome_autor, url_imagem')
          .eq('id', targetPostId)
          .maybeSingle();

        if (postErr) {
          return new Response(
            JSON.stringify({ error: `Erro ao buscar post: ${postErr.message}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!post) {
          return new Response(
            JSON.stringify({ error: 'Postagem não encontrada.' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validação 1: Post deve pertencer à mesma igreja do membro autenticado
        if (!isGlobalAdmin && post.igreja_id !== churchId) {
          return new Response(
            JSON.stringify({ error: 'Acesso negado: a postagem pertence a outra congregação.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validação 2: Autor ou papel administrador
        const postAuthor = (post.nome_autor || '').trim().toLowerCase();
        const isAuthor = Boolean(memberName && postAuthor === memberName);

        if (!isAuthor && !isPastorOrAdmin) {
          return new Response(
            JSON.stringify({ error: 'Permissão negada: apenas o autor da postagem ou líderes pastores/administradores podem excluir.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (post.url_imagem && !resolvedPath) {
          resolvedPath = post.url_imagem;
        }
      }

      // Se não há arquivo para deletar, conclui com sucesso
      if (!resolvedPath) {
        return new Response(
          JSON.stringify({ success: true, message: 'Nenhuma imagem vinculada para remoção.' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Normaliza o path no bucket feed
      let cleanStoragePath = resolvedPath;
      if (cleanStoragePath.includes('/storage/v1/object/public/feed/')) {
        cleanStoragePath = cleanStoragePath.split('/storage/v1/object/public/feed/')[1] || '';
      } else if (cleanStoragePath.includes('/storage/v1/object/sign/feed/')) {
        cleanStoragePath = cleanStoragePath.split('/storage/v1/object/sign/feed/')[1]?.split('?')[0] || '';
      } else if (cleanStoragePath.includes('/feed/')) {
        const parts = cleanStoragePath.split('/feed/');
        cleanStoragePath = parts[parts.length - 1] || '';
      }

      cleanStoragePath = decodeURIComponent(cleanStoragePath).trim();

      // Validação 3: O caminho do arquivo deve pertencer ao prefixo da igreja do membro
      if (!isGlobalAdmin && cleanStoragePath && !cleanStoragePath.startsWith(`${churchId}/`) && !cleanStoragePath.startsWith(`posts/${churchId}/`)) {
        return new Response(
          JSON.stringify({ error: 'Acesso negado: o arquivo de imagem pertence a outra congregação.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Remove o arquivo do Supabase Storage usando service role
      const { data: delData, error: delError } = await supabaseAdmin.storage
        .from('feed')
        .remove([cleanStoragePath]);

      if (delError) {
        return new Response(
          JSON.stringify({ error: `Erro ao remover imagem do Storage: ${delError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, deletedPath: cleanStoragePath, data: delData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Ação inválida: "${action}". Ações permitidas: "upload" ou "excluir".` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Erro interno no servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
