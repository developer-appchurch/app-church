import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import crypto from 'crypto';

interface AvatarPhotoRequestBody {
  action: 'upload' | 'excluir';
  memberId: string;
  login?: string;
  extension?: string;
  imagePath?: string;
  imageUrl?: string;
}

/**
 * Rota responsável pelas fotos de perfil (avatar) de membros no Supabase Storage
 * (bucket "avatars"). Segue o mesmo modelo de /api/feed/image e /api/hierarchy/unit-photo:
 * a validação de quem pode enviar/excluir acontece aqui no servidor (via service role),
 * o Storage em si só serve os arquivos publicamente.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseServerClient();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Cliente Supabase não configurado no servidor.' },
        { status: 500 }
      );
    }

    const body: AvatarPhotoRequestBody = await req.json();
    const { action, memberId, login, imagePath, imageUrl } = body;

    if (!memberId) {
      return NextResponse.json(
        { error: 'Sessão inválida: memberId é obrigatório.' },
        { status: 401 }
      );
    }

    const isGlobalAdmin =
      login === 'admin' ||
      login === 'developer.appchurch@gmail.com' ||
      memberId === 'a0000000-0000-0000-0000-000000000001';

    let churchId = 'church-master';
    if (!isGlobalAdmin) {
      const { data: member } = await supabaseAdmin
        .from('membros')
        .select('id, igreja_id')
        .eq('id', memberId)
        .maybeSingle();

      if (!member) {
        return NextResponse.json(
          { error: 'Membro não encontrado ou sessão não autenticada na tabela de membros.' },
          { status: 403 }
        );
      }
      churchId = member.igreja_id || 'church-master';
    }

    // Ação "upload": gera createSignedUploadUrl no caminho {igreja_id}/{membro_id}-{uuid}.webp
    if (action === 'upload') {
      const fileExt = body.extension?.trim().toLowerCase() === 'jpeg' || body.extension === 'jpg' ? 'jpg' : 'webp';
      const fileUuid = crypto.randomUUID();
      const storagePath = `${churchId}/${memberId}-${fileUuid}.${fileExt}`;

      const { data: signData, error: signError } = await supabaseAdmin.storage
        .from('avatars')
        .createSignedUploadUrl(storagePath);

      if (signError || !signData) {
        return NextResponse.json(
          { error: `Erro ao gerar signed upload URL: ${signError?.message || 'Falha no Storage'}` },
          { status: 500 }
        );
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('avatars')
        .getPublicUrl(storagePath);

      return NextResponse.json({
        success: true,
        signedUrl: signData.signedUrl,
        token: signData.token,
        path: storagePath,
        publicUrl: publicUrlData.publicUrl,
      });
    }

    // Ação "excluir": remove uma foto antiga do bucket "avatars"
    if (action === 'excluir') {
      let resolvedPath = imagePath || imageUrl;
      if (!resolvedPath) {
        return NextResponse.json({ success: true, message: 'Nenhum caminho de imagem para excluir.' });
      }

      let cleanStoragePath = resolvedPath;
      if (cleanStoragePath.includes('/storage/v1/object/public/avatars/')) {
        cleanStoragePath = cleanStoragePath.split('/storage/v1/object/public/avatars/')[1] || '';
      } else if (cleanStoragePath.includes('/avatars/')) {
        const parts = cleanStoragePath.split('/avatars/');
        cleanStoragePath = parts[parts.length - 1] || '';
      }
      cleanStoragePath = decodeURIComponent(cleanStoragePath).trim();

      if (!isGlobalAdmin && cleanStoragePath && !cleanStoragePath.startsWith(`${churchId}/`)) {
        return NextResponse.json(
          { error: 'Acesso negado: o arquivo solicitado pertence a outra congregação.' },
          { status: 403 }
        );
      }

      const { error: delError } = await supabaseAdmin.storage.from('avatars').remove([cleanStoragePath]);
      if (delError) {
        return NextResponse.json(
          { error: `Erro ao remover arquivo do Storage: ${delError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, deletedPath: cleanStoragePath });
    }

    return NextResponse.json(
      { error: `Ação inválida: "${action}". Ações aceitas: "upload" ou "excluir".` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('Erro na rota /api/members/avatar-photo:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
