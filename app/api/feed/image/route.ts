import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import crypto from 'crypto';
import { hasValidAdminSession } from '@/lib/adminSession';

interface FeedImageRequestBody {
  action: 'upload' | 'excluir';
  memberId: string;
  login?: string;
  postId?: string;
  imagePath?: string;
  imageUrl?: string;
  extension?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseServerClient();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Cliente Supabase não configurado no servidor.' },
        { status: 500 }
      );
    }

    const body: FeedImageRequestBody = await req.json();
    const { action, memberId, postId, imagePath, imageUrl } = body;

    if (!memberId) {
      return NextResponse.json(
        { error: 'Sessão inválida: memberId é obrigatório.' },
        { status: 401 }
      );
    }

    // =========================================================================
    // (a) Validação da sessão do login próprio (tabela membros) e obtenção de igreja_id
    // =========================================================================
    let memberQuery = supabaseAdmin
      .from('membros')
      .select('id, nome, login, igreja_id, funcao, papel_id')
      .eq('id', memberId);

    let { data: member } = await memberQuery.maybeSingle();

    // Fallback para admin mestre do sistema
    const isGlobalAdmin =
      member?.login === 'admin' ||
      member?.login === 'developer.appchurch@gmail.com' ||
      // Admin do sistema só com cookie de sessão assinado (o "login" do corpo da requisição pode ser forjado)
      hasValidAdminSession(req);

    if (!member && !isGlobalAdmin) {
      return NextResponse.json(
        { error: 'Membro não encontrado ou sessão não autenticada na tabela de membros.' },
        { status: 403 }
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
      const fileExt = body.extension?.trim().toLowerCase() === 'jpeg' || body.extension === 'jpg' ? 'jpg' : 'webp';
      const fileUuid = crypto.randomUUID();
      const storagePath = `${churchId}/${fileUuid}.${fileExt}`;

      // Gera createSignedUploadUrl via service role
      const { data: signData, error: signError } = await supabaseAdmin.storage
        .from('feed')
        .createSignedUploadUrl(storagePath);

      if (signError || !signData) {
        return NextResponse.json(
          { error: `Erro ao gerar signed upload URL: ${signError?.message || 'Falha no Storage'}` },
          { status: 500 }
        );
      }

      // Obtém a URL pública do arquivo
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('feed')
        .getPublicUrl(storagePath);

      return NextResponse.json({
        success: true,
        signedUrl: signData.signedUrl,
        token: signData.token,
        path: storagePath,
        publicUrl: publicUrlData.publicUrl,
      });
    }

    // =========================================================================
    // (c) Ação "excluir": verifica que o post pertence à igreja do membro e ao autor
    // (ou a um papel administrador) e remove o arquivo do Storage
    // =========================================================================
    if (action === 'excluir') {
      let resolvedPath = imagePath || imageUrl;
      let targetPostId = postId;

      // Se postId foi enviado, valida diretamente o post no banco
      if (targetPostId) {
        const { data: post, error: postErr } = await supabaseAdmin
          .from('postagens_feed')
          .select('id, igreja_id, nome_autor, url_imagem')
          .eq('id', targetPostId)
          .maybeSingle();

        if (postErr) {
          return NextResponse.json(
            { error: `Erro ao buscar post para exclusão: ${postErr.message}` },
            { status: 500 }
          );
        }

        if (!post) {
          return NextResponse.json(
            { error: 'Postagem não encontrada.' },
            { status: 404 }
          );
        }

        // Validação 1: Post pertence à igreja do membro
        if (!isGlobalAdmin && post.igreja_id !== churchId) {
          return NextResponse.json(
            { error: 'Acesso negado: a postagem pertence a outra congregação.' },
            { status: 403 }
          );
        }

        // Validação 2: Autor ou papel administrador
        const postAuthor = (post.nome_autor || '').trim().toLowerCase();
        const isAuthor = Boolean(memberName && postAuthor === memberName);

        if (!isAuthor && !isPastorOrAdmin) {
          return NextResponse.json(
            { error: 'Permissão negada: apenas o autor da postagem ou líderes pastores/administradores podem excluir a foto.' },
            { status: 403 }
          );
        }

        if (post.url_imagem && !resolvedPath) {
          resolvedPath = post.url_imagem;
        }
      }

      if (!resolvedPath) {
        return NextResponse.json({
          success: true,
          message: 'Nenhum caminho de imagem para excluir.',
        });
      }

      // Normaliza caminho no bucket feed
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

      // Validação 3: Proteção multitenant no caminho do arquivo
      if (!isGlobalAdmin && cleanStoragePath && !cleanStoragePath.startsWith(`${churchId}/`) && !cleanStoragePath.startsWith(`posts/${churchId}/`)) {
        return NextResponse.json(
          { error: 'Acesso negado: o arquivo solicitado pertence a outra congregação.' },
          { status: 403 }
        );
      }

      // Remove com segurança usando a service role
      const { data: delData, error: delError } = await supabaseAdmin.storage
        .from('feed')
        .remove([cleanStoragePath]);

      if (delError) {
        return NextResponse.json(
          { error: `Erro ao remover arquivo do Storage: ${delError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        deletedPath: cleanStoragePath,
        data: delData,
      });
    }

    return NextResponse.json(
      { error: `Ação inválida: "${action}". Ações aceitas: "upload" ou "excluir".` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/feed/image:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
