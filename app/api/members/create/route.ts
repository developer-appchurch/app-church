import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { createAuthUserForMember, deleteAuthUserForMember } from '@/lib/supabase/authAdmin';
import crypto from 'crypto';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * POST /api/members/create
 * Cadastra um novo membro no banco e cria instantaneamente seu autenticador no auth.users
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      churchId,
      name,
      login,
      password = '123456',
      role = 'Membro',
      roleId,
      cellId = null,
      neighborhood = 'Centro',
      birthday = '01/01',
      phone = '',
      email = '',
      attendanceStatus = 'green',
      attendancePercentage = 100,
      avatarUrl = null,
      notes = null,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'O nome do membro é obrigatório.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const supabase = supabaseAdmin || getSupabaseServerClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Servidor do banco de dados não configurado.' }, { status: 500 });
    }

    const memberId = generateUUID();
    const rawLogin = (
      login ||
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.]/g, '')
        .replace(/\s+/g, '.')
    ).trim().toLowerCase();

    // Garante unicidade do login
    let cleanLogin = rawLogin;
    const { data: existingLogin } = await supabase
      .from('membros')
      .select('id')
      .eq('login', cleanLogin)
      .limit(1);

    if (existingLogin && existingLogin.length > 0) {
      cleanLogin = `${rawLogin}.${Math.floor(100 + Math.random() * 900)}`;
    }

    const validCellId = cellId && String(cellId).trim() !== '' ? String(cellId).trim() : null;
    const validChurchId = churchId && String(churchId).trim() !== '' ? String(churchId).trim() : null;
    const cleanPass = (password || '123456').trim();

    if (cleanPass.length < 6) {
      return NextResponse.json(
        { error: 'A senha de acesso deve ter no mínimo 6 caracteres para permitir o login.' },
        { status: 400 }
      );
    }

    // 1. Cria ou sincroniza PRIMEIRO o usuário na tabela auth.users com confirmação ativa
    let authUserId: string;
    try {
      authUserId = await createAuthUserForMember({
        churchId: validChurchId,
        memberId,
        name: name.trim(),
        login: cleanLogin,
        password: cleanPass,
        email: email?.trim() || null,
        role,
      });
    } catch (authErr: any) {
      console.error('[POST /api/members/create] Falha ao criar autenticador no auth.users:', authErr);
      return NextResponse.json(
        { error: `Falha ao provisionar autenticador: ${authErr.message || 'Erro no Supabase Auth'}` },
        { status: 400 }
      );
    }

    // 2. Insere na tabela membros com o auth_user_id devidamente vinculado
    const ptPayload: any = {
      id: memberId,
      igreja_id: validChurchId,
      unidade_id: validCellId,
      papel_id: roleId && String(roleId).includes('-') ? roleId : 'b2000000-0000-0000-0000-000000000003',
      funcao: role,
      nome: name.trim(),
      login: cleanLogin,
      senha_hash: cleanPass,
      auth_user_id: authUserId,
      bairro: neighborhood?.trim() || 'Centro',
      aniversario: birthday?.trim() || '01/01',
      telefone: phone?.trim() || null,
      email: email?.trim() || null,
      status_frequencia: attendanceStatus || 'green',
      percentual_frequencia: attendancePercentage ?? 100,
      url_avatar: avatarUrl?.trim() || null,
      observacoes: notes?.trim() || (validCellId ? 'Cadastrado e vinculado à célula' : 'Cadastrado no Pool Geral'),
    };

    let { error: insertErr } = await supabase.from('membros').insert([ptPayload]);

    if (insertErr && (insertErr.code === '42P01' || insertErr.message?.includes('does not exist') || insertErr.message?.includes('unidade_id'))) {
      const payloadLegacy: any = { ...ptPayload, celula_id: validCellId };
      delete payloadLegacy.unidade_id;
      const resLegacy = await supabase.from('members').insert([payloadLegacy]);
      insertErr = resLegacy.error;
    }

    // Se falhar a inserção na tabela membros, faz rollback no auth.users
    if (insertErr) {
      if (authUserId) {
        await deleteAuthUserForMember(authUserId);
      }
      console.error('[POST /api/members/create] Erro ao cadastrar membro:', insertErr);
      return NextResponse.json(
        { error: `Falha ao cadastrar membro no banco: ${insertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      member: {
        id: memberId,
        churchId: validChurchId || '',
        cellId: validCellId || '',
        name: name.trim(),
        login: cleanLogin,
        role,
        roleId: ptPayload.papel_id,
        neighborhood: ptPayload.bairro,
        birthday: ptPayload.aniversario,
        phone: ptPayload.telefone || '',
        email: ptPayload.email || '',
        attendanceStatus: ptPayload.status_frequencia,
        attendancePercentage: ptPayload.percentual_frequencia,
        avatarUrl: ptPayload.url_avatar,
        notes: ptPayload.observacoes,
        authUserId,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/members/create] Exceção:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao cadastrar membro.' }, { status: 500 });
  }
}

/**
 * DELETE /api/members/create
 * Remove o membro da tabela membros e seu autenticador do auth.users
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId') || searchParams.get('id');

    if (!memberId) {
      const body = await req.json().catch(() => ({}));
      const bodyMemberId = body.memberId || body.id;
      if (!bodyMemberId) {
        return NextResponse.json({ error: 'memberId é obrigatório para exclusão.' }, { status: 400 });
      }
    }

    const targetMemberId = memberId || (await req.json().catch(() => ({}))).memberId;
    const supabaseAdmin = getSupabaseAdminClient();
    const supabase = supabaseAdmin || getSupabaseServerClient();

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado no servidor.' }, { status: 500 });
    }

    // 1. Busca auth_user_id do membro antes de deletar
    const { data: memberData } = await supabase
      .from('membros')
      .select('id, auth_user_id')
      .eq('id', targetMemberId)
      .maybeSingle();

    const authUserId = memberData?.auth_user_id;

    // 2. Remove da tabela membros
    const { error: delErr } = await supabase.from('membros').delete().eq('id', targetMemberId);
    if (delErr) {
      console.error('[DELETE /api/members/create] Erro ao deletar membro:', delErr);
      return NextResponse.json({ error: `Falha ao remover membro: ${delErr.message}` }, { status: 500 });
    }

    // 3. Remove o autenticador do auth.users
    if (authUserId) {
      await deleteAuthUserForMember(authUserId);
    }

    return NextResponse.json({ success: true, deletedMemberId: targetMemberId, authDeleted: Boolean(authUserId) });
  } catch (err: any) {
    console.error('[DELETE /api/members/create] Exceção:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno ao excluir membro.' }, { status: 500 });
  }
}
