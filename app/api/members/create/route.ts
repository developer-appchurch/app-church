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
      assignLogin = true,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'O nome do membro é obrigatório.' }, { status: 400 });
    }

    // Membro "sem acesso ao app" (a maioria): não provisiona login/senha/auth.users.
    // A liderança pode atribuir login e senha depois, editando o membro.
    if (!assignLogin) {
      const supabaseAdminNoAuth = getSupabaseAdminClient();
      const supabaseNoAuth = supabaseAdminNoAuth || getSupabaseServerClient();
      if (!supabaseNoAuth) {
        return NextResponse.json({ error: 'Servidor do banco de dados não configurado.' }, { status: 500 });
      }

      const memberIdNoAuth = generateUUID();
      const validCellIdNoAuth = cellId && String(cellId).trim() !== '' ? String(cellId).trim() : null;
      const validChurchIdNoAuth = churchId && String(churchId).trim() !== '' ? String(churchId).trim() : null;

      const roleNormNoAuth = (role || 'Membro').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      let resolvedRoleIdNoAuth = roleId && String(roleId).includes('-') ? roleId : null;
      if (!resolvedRoleIdNoAuth) {
        if (roleNormNoAuth.includes('admin')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000001';
        else if (roleNormNoAuth.includes('pastor')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000002';
        else if (roleNormNoAuth.includes('supervisor')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000008';
        else if (roleNormNoAuth.includes('distrito')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000006';
        else if (roleNormNoAuth.includes('rede')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000005';
        else if (roleNormNoAuth.includes('area')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000004';
        else if (roleNormNoAuth.includes('setor')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000009';
        else if (roleNormNoAuth.includes('celula') || roleNormNoAuth.includes('lider')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000010';
        else if (roleNormNoAuth.includes('treinamento')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000011';
        else if (roleNormNoAuth.includes('anfitriao')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000012';
        else if (roleNormNoAuth.includes('secretario')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000013';
        else if (roleNormNoAuth.includes('intercessor')) resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000014';
        else resolvedRoleIdNoAuth = 'b2000000-0000-0000-0000-000000000003';
      }

      const ptPayloadNoAuth: any = {
        id: memberIdNoAuth,
        igreja_id: validChurchIdNoAuth,
        unidade_id: validCellIdNoAuth,
        papel_id: resolvedRoleIdNoAuth,
        funcao: role || 'Membro',
        nome: name.trim(),
        login: null,
        senha_hash: null,
        auth_user_id: null,
        bairro: neighborhood?.trim() || 'Centro',
        aniversario: birthday?.trim() || '01/01',
        telefone: phone?.trim() || null,
        email: email?.trim() || null,
        status_frequencia: attendanceStatus || 'green',
        percentual_frequencia: attendancePercentage ?? 100,
        url_avatar: avatarUrl?.trim() || null,
        observacoes: notes?.trim() || (validCellIdNoAuth ? 'Cadastrado e vinculado à célula' : 'Cadastrado no Pool Geral'),
      };

      let { error: insertErrNoAuth } = await supabaseNoAuth.from('membros').insert([ptPayloadNoAuth]);

      if (insertErrNoAuth && (insertErrNoAuth.code === '42P01' || insertErrNoAuth.message?.includes('does not exist') || insertErrNoAuth.message?.includes('unidade_id'))) {
        const payloadLegacyNoAuth: any = { ...ptPayloadNoAuth, celula_id: validCellIdNoAuth };
        delete payloadLegacyNoAuth.unidade_id;
        const resLegacyNoAuth = await supabaseNoAuth.from('members').insert([payloadLegacyNoAuth]);
        insertErrNoAuth = resLegacyNoAuth.error;
      }

      if (insertErrNoAuth) {
        console.error('[POST /api/members/create] Erro ao cadastrar membro sem login:', insertErrNoAuth);
        return NextResponse.json(
          { error: `Falha ao cadastrar membro no banco: ${insertErrNoAuth.message}` },
          { status: 500 }
        );
      }

      if (validCellIdNoAuth) {
        const { count: cellCountNoAuth } = await supabaseNoAuth
          .from('membros')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', validCellIdNoAuth);
        if (typeof cellCountNoAuth === 'number') {
          await supabaseNoAuth
            .from('unidades')
            .update({ quantidade_membros: cellCountNoAuth, atualizado_em: new Date().toISOString() })
            .eq('id', validCellIdNoAuth);
        }
      }

      return NextResponse.json({
        success: true,
        member: {
          id: memberIdNoAuth,
          churchId: validChurchIdNoAuth || '',
          cellId: validCellIdNoAuth || '',
          name: name.trim(),
          login: null,
          role,
          roleId: ptPayloadNoAuth.papel_id,
          neighborhood: ptPayloadNoAuth.bairro,
          birthday: ptPayloadNoAuth.aniversario,
          phone: ptPayloadNoAuth.telefone || '',
          email: ptPayloadNoAuth.email || '',
          attendanceStatus: ptPayloadNoAuth.status_frequencia,
          attendancePercentage: ptPayloadNoAuth.percentual_frequencia,
          avatarUrl: ptPayloadNoAuth.url_avatar,
          notes: ptPayloadNoAuth.observacoes,
          authUserId: null,
        },
      });
    }

    if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim().startsWith('data:')) {
      if (!avatarUrl.trim().startsWith('data:image/webp')) {
        return NextResponse.json(
          { error: 'A foto do membro deve estar obrigatoriamente convertida no formato WebP.' },
          { status: 400 }
        );
      }
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

    // 2. Resolve papel_id exato a partir da função ou ID informado
    const roleNorm = (role || 'Membro').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let resolvedRoleId = roleId && String(roleId).includes('-') ? roleId : null;

    if (!resolvedRoleId) {
      if (roleNorm.includes('admin')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000001';
      else if (roleNorm.includes('pastor')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000002';
      else if (roleNorm.includes('supervisor')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000008';
      else if (roleNorm.includes('distrito')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000006';
      else if (roleNorm.includes('rede')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000005';
      else if (roleNorm.includes('area')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000004';
      else if (roleNorm.includes('setor')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000009';
      else if (roleNorm.includes('celula') || roleNorm.includes('lider')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000010';
      else if (roleNorm.includes('treinamento')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000011';
      else if (roleNorm.includes('anfitriao')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000012';
      else if (roleNorm.includes('secretario')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000013';
      else if (roleNorm.includes('intercessor')) resolvedRoleId = 'b2000000-0000-0000-0000-000000000014';
      else resolvedRoleId = 'b2000000-0000-0000-0000-000000000003';
    }

    // 3. Insere na tabela membros com o auth_user_id devidamente vinculado
    const ptPayload: any = {
      id: memberId,
      igreja_id: validChurchId,
      unidade_id: validCellId,
      papel_id: resolvedRoleId,
      funcao: role || 'Membro',
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

    if (validCellId) {
      const { count: cellCount } = await supabase
        .from('membros')
        .select('*', { count: 'exact', head: true })
        .eq('unidade_id', validCellId);
      if (typeof cellCount === 'number') {
        await supabase
          .from('unidades')
          .update({ quantidade_membros: cellCount, atualizado_em: new Date().toISOString() })
          .eq('id', validCellId);
      }
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
