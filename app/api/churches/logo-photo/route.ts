import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import crypto from 'crypto';
import { requireSession, resolveChurchId, forbiddenChurch, requireAnyPermission } from '@/lib/requireSession';

interface LogoPhotoRequestBody {
  action: 'upload' | 'excluir';
  churchId: string;
  extension?: string;
  imagePath?: string;
  imageUrl?: string;
}

/**
 * Rota responsável pelo logotipo de uma igreja em cadastro, no Supabase Storage
 * (bucket "church-logos"). Diferente de /api/members/avatar-photo e
 * /api/hierarchy/unit-photo, aqui AINDA NÃO existe membro/sessão: a tela de
 * Cadastrar Igreja gera um churchId no navegador antes de inserir qualquer linha
 * no banco, só para correlacionar o logo enviado com a igreja que será criada
 * em seguida por /api/churches/register (mesmo churchId é reaproveitado lá).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const permErr = await requireAnyPermission(auth.actor, ['church:admin']);
    if (permErr) return permErr;
    const supabaseAdmin = getSupabaseServerClient();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Cliente Supabase não configurado no servidor.' },
        { status: 500 }
      );
    }

    const body: LogoPhotoRequestBody = await req.json();
    const { action, churchId, imagePath, imageUrl } = body;
    if (churchId && !resolveChurchId(auth.actor, churchId)) return forbiddenChurch();

    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }

    if (action === 'upload') {
      const fileExt = body.extension?.trim().toLowerCase() === 'jpeg' || body.extension === 'jpg' ? 'jpg' : 'webp';
      const storagePath = `${churchId}/logo-${crypto.randomUUID()}.${fileExt}`;

      const { data: signData, error: signError } = await supabaseAdmin.storage
        .from('church-logos')
        .createSignedUploadUrl(storagePath);

      if (signError || !signData) {
        return NextResponse.json(
          { error: `Erro ao gerar signed upload URL: ${signError?.message || 'Falha no Storage'}` },
          { status: 500 }
        );
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from('church-logos')
        .getPublicUrl(storagePath);

      return NextResponse.json({
        success: true,
        signedUrl: signData.signedUrl,
        token: signData.token,
        path: storagePath,
        publicUrl: publicUrlData.publicUrl,
      });
    }

    if (action === 'excluir') {
      let resolvedPath = imagePath || imageUrl;
      if (!resolvedPath) {
        return NextResponse.json({ success: true, message: 'Nenhum caminho de imagem para excluir.' });
      }

      let cleanStoragePath = resolvedPath;
      if (cleanStoragePath.includes('/storage/v1/object/public/church-logos/')) {
        cleanStoragePath = cleanStoragePath.split('/storage/v1/object/public/church-logos/')[1] || '';
      } else if (cleanStoragePath.includes('/church-logos/')) {
        const parts = cleanStoragePath.split('/church-logos/');
        cleanStoragePath = parts[parts.length - 1] || '';
      }
      cleanStoragePath = decodeURIComponent(cleanStoragePath).trim();

      // Só permite excluir arquivos dentro da pasta do próprio churchId informado
      if (cleanStoragePath && !cleanStoragePath.startsWith(`${churchId}/`)) {
        return NextResponse.json(
          { error: 'Acesso negado: o arquivo solicitado pertence a outra congregação.' },
          { status: 403 }
        );
      }

      const { error: delError } = await supabaseAdmin.storage.from('church-logos').remove([cleanStoragePath]);
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
    console.error('Erro na rota /api/churches/logo-photo:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno no servidor' },
      { status: 500 }
    );
  }
}
