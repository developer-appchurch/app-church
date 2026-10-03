import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { createAuthUserForMember } from '@/lib/supabase/authAdmin';
import bcrypt from 'bcryptjs';

/**
 * GET /api/members/access?churchId=...&search=...
 * Lista membros da igreja para a aba "Gestão de Logins", com o estado
 * atual de acesso (membros.acesso_ativo).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');
    const search = (searchParams.get('search') || '').trim();

    if (!churchId) {
      return NextResponse.json({ error: 'Parâmetro churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    let query = supabase
      .from('membros')
      .select('id, nome, login, funcao, acesso_ativo, senha_temporaria, url_avatar, unidade:unidades(nome)')
      .eq('igreja_id', churchId)
      .order('nome', { ascending: true })
      .limit(200);

    if (search) {
      query = query.or(`nome.ilike.%${search}%,login.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const members = (data || []).map((m: any) => {
      const unidade = Array.isArray(m.unidade) ? m.unidade[0] : m.unidade;
      return {
        id: m.id,
        name: m.nome,
        login: m.login,
        role: m.funcao || 'Membro',
        cellName: unidade?.nome || '',
        avatarUrl: m.url_avatar,
        accessActive: m.acesso_ativo !== false,
        temporaryPassword: Boolean(m.senha_temporaria),
      };
    });

    return NextResponse.json({ success: true, members });
  } catch (err: any) {
    console.error('Erro na rota /api/members/access GET:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao listar membros.' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/members/access
 * Ativa/desativa o acesso de login de um membro.
 * Body: { memberId, churchId, accessActive }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { memberId, churchId, accessActive } = body || {};

    if (!memberId || typeof accessActive !== 'boolean') {
      return NextResponse.json(
        { error: 'memberId e accessActive (boolean) são obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    let query = supabase.from('membros').update({ acesso_ativo: accessActive }).eq('id', memberId);
    if (churchId) query = query.eq('igreja_id', churchId);

    const { data, error } = await query.select('id, nome, acesso_ativo').single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      member: { id: data.id, name: data.nome, accessActive: data.acesso_ativo !== false },
    });
  } catch (err: any) {
    console.error('Erro na rota /api/members/access PATCH:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao atualizar acesso.' },
      { status: 500 }
    );
  }
}

function generateTemporaryPassword(): string {
  // Evita caracteres ambíguos (0/O, 1/l/I) para facilitar repasse manual (WhatsApp, etc.)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 8; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

/**
 * POST /api/members/access
 * Gera uma senha temporária aleatória para o membro, mostrada uma única vez
 * para o admin repassar manualmente (WhatsApp, pessoalmente etc.).
 * Body: { memberId, churchId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { memberId, churchId } = body || {};

    if (!memberId) {
      return NextResponse.json({ error: 'memberId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const { data: member, error: memberErr } = await supabase
      .from('membros')
      .select('id, nome, login, funcao, igreja_id')
      .eq('id', memberId)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json({ error: 'Membro não encontrado.' }, { status: 404 });
    }

    const temporaryPassword = generateTemporaryPassword();
    const hash = bcrypt.hashSync(temporaryPassword, 10);

    const { error: updateErr } = await supabase
      .from('membros')
      .update({ senha_hash: hash, senha_temporaria: true })
      .eq('id', memberId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Sincroniza também no Supabase Auth (melhor esforço — login ainda funciona
    // via fallback legado em membros.senha_hash mesmo se isto falhar).
    if (member.login) {
      try {
        await createAuthUserForMember({
          churchId: member.igreja_id || churchId,
          memberId: member.id,
          name: member.nome,
          login: member.login,
          password: temporaryPassword,
          role: member.funcao,
        });
      } catch (authErr) {
        console.warn('[members/access POST] Falha ao sincronizar senha no Supabase Auth (seguindo com fallback legado):', authErr);
      }
    }

    return NextResponse.json({ success: true, temporaryPassword });
  } catch (err: any) {
    console.error('Erro na rota /api/members/access POST:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro interno ao resetar senha.' },
      { status: 500 }
    );
  }
}
