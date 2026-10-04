import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import crypto from 'crypto';
import { hasValidAdminSession } from '@/lib/adminSession';

interface UnitPhotoRequestBody {
  action: 'upload' | 'excluir';
  memberId: string;
  login?: string;
  extension?: string;
  imagePath?: string;
  imageUrl?: string;
}

/**
 * Rota responsável por fotos de Células / Unidades organizacionais no Supabase Storage
 * (bucket "units"). Segue o mesmo modelo de /api/feed/image: a validação de quem pode
 * enviar/excluir acontece aqui no servidor (via service role), o Storage em si só serve
 * os arquivos publicamente.
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

    const body: UnitPhotoRequestBody = await req.json();
    const { action, memberId, imagePath, imageUrl } = body;

    if (!memberId) {
      return NextResponse.json(
        { error: 'Sessão inválida: memberId é obrigatório.' },
        { status: 401 }
      );
    }

    // Validação da sessão do membro e obtenção de igreja_id (mesmo padrão de /api/feed/image)
    const { data: member } = await supabaseAdmin
      .from('membros')
      .select('id, nome, login, igreja_id, funcao')
      .eq('id', memberId)
      .maybeSingle();

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

    // Ação "upload": gera createSignedUploadUrl no caminho {igreja_id}/{uuid}.webp
    if (action === 'upload') {
      const fileExt = body.extension?.trim().toLowerCase() === 'jpeg' || body.extension === 'jpg' ? 'jpg' : 'webp';
      const fileUuid = crypto.randomUUID();
      const storagePath = `${churchId}/${fileUuid}.${fileExt}`;

      const { data: signData, error: signError } = await supabaseAdmin.storage
        .from('units')
        .createSignedUploadUrl(storagePath);

      if (signError || !signData) {
        return NextResponse.json(
          { error: `Erro ao gerar signed upload URL: ${signError?.message || 'Falha no Storage'}` },
          { status: 500 }
        );
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('units')
        .getPublicUrl(storagePath);

      return NextResponse.json({
        success: true,
        signedUrl: signData.signedUrl,
        token: signData.token,
        path: storagePath,
        publicUrl: publicUrlData.publicUrl,
      });
    }

    // Ação "excluir": remove o arquivo do bucket "units" (ex: ao trocar a foto antes de salvar)
    if (action === 'excluir') {
      let resolvedPath = imagePath || imageUrl;
      if (!resolvedPath) {
        return NextResponse.json({ success: true, message: 'Nenhum caminho de imagem para excluir.' });
      }

      let cleanStoragePath = resolvedPath;
      if (cleanStoragePath.includes('/storage/v1/object/public/units/')) {
        cleanStoragePath = cleanStoragePath.split('/storage/v1/object/public/units/')[1] || '';
      } else if (cleanStoragePath.includes('/units/')) {
        const parts = cleanStoragePath.split('/units/');
        cleanStoragePath = parts[parts.length - 1] || '';
      }
      cleanStoragePath = decodeURIComponent(cleanStoragePath).trim();

      if (!isGlobalAdmin && cleanStoragePath && !cleanStoragePath.startsWith(`${churchId}/`)) {
        return NextResponse.json(
          { error: 'Acesso negado: o arquivo solicitado pertence a outra congregação.' },
          { status: 403 }
        );
      }

      const { error: delError } = await supabaseAdmin.storage.from('units').remove([cleanStoragePath]);
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
    console.error('Erro na rota /api/hierarchy/unit-photo:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
