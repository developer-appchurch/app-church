import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { createAuthUserForMember, deleteAuthUserForMember } from '@/lib/supabase/authAdmin';
import { AttendanceStatus } from '@/types';
import crypto from 'crypto';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface MemberListItem {
  id: string;
  name: string;
  role: string;
  cellId: string | null;
  cellName: string;
  neighborhood: string;
  phone?: string;
  avatarUrl?: string;
  isUnlinked: boolean;
}

/**
 * GET /api/members/pool
 * 
 * Implementa:
 * 1. Paginação por cursor / limit (25 itens por página com cursor baseado em (nome, id))
 * 2. SELECT APENAS das colunas estritamente necessárias (id, nome, funcao, papel_id, unidade_id, bairro, telefone, url_avatar). Sem email, status_frequencia, percentual_frequencia ou senha_hash.
 * 3. Busca e filtros no servidor (search, filter: all|unlinked|linked)
 * 4. Consulta direta das tabelas novas (membros, unidades) em join ou lote único sem cascata N+1
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'unlinked' | 'linked'
    const search = (searchParams.get('search') || '').trim();
    const cursorName = searchParams.get('cursorName') || null;
    const cursorId = searchParams.get('cursorId') || null;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25', 10), 1), 100);

    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Consulta em lote único e paralelo:
    // Query de membros com projeção restrita (sem senha_hash, email, status_frequencia, percentual_frequencia) + contadores + unidades
    const isFirstPage = !cursorName && !cursorId;

    const [membersRes, unitsRes, countsRes] = await Promise.all([
      (() => {
        // SELECT estrito sem senha_hash, email, status_frequencia ou percentual_frequencia
        let q = supabase
          .from('membros')
          .select('id, nome, funcao, papel_id, unidade_id, bairro, telefone, url_avatar')
          .eq('igreja_id', churchId);

        if (filter === 'unlinked') {
          q = q.is('unidade_id', null);
        } else if (filter === 'linked') {
          q = q.not('unidade_id', 'is', null);
        }

        if (search) {
          // Busca trigram / ilike no servidor
          q = q.or(`nome.ilike.%${search}%,bairro.ilike.%${search}%,telefone.ilike.%${search}%`);
        }

        // Paginação por cursor: (nome > cursorName) ou (nome = cursorName e id > cursorId)
        if (cursorName && cursorId) {
          q = q.or(`nome.gt."${cursorName}",and(nome.eq."${cursorName}",id.gt."${cursorId}")`);
        }

        q = q.order('nome', { ascending: true }).order('id', { ascending: true }).limit(limit + 1);

        return q;
      })(),
      supabase
        .from('unidades')
        .select('id, nome')
        .eq('igreja_id', churchId)
        .eq('ativo', true),
      isFirstPage
        ? Promise.all([
            supabase.from('membros').select('id', { count: 'exact', head: true }).eq('igreja_id', churchId),
            supabase.from('membros').select('id', { count: 'exact', head: true }).eq('igreja_id', churchId).is('unidade_id', null),
            supabase.from('membros').select('id', { count: 'exact', head: true }).eq('igreja_id', churchId).not('unidade_id', 'is', null),
          ])
        : Promise.resolve(null),
    ]);

    let membersData: any[] | null = membersRes.data;
    let queryError = membersRes.error;

    // Fallback rápido se a tabela ainda for legada
    if (queryError && (queryError.code === '42P01' || queryError.message?.includes('does not exist') || queryError.message?.includes('unidade_id'))) {
      let fallbackQuery = supabase
        .from('members')
        .select('id, nome, funcao, celula_id, bairro, telefone, url_avatar')
        .eq('igreja_id', churchId);

      if (filter === 'unlinked') {
        fallbackQuery = fallbackQuery.is('celula_id', null);
      } else if (filter === 'linked') {
        fallbackQuery = fallbackQuery.not('celula_id', 'is', null);
      }

      if (search) {
        fallbackQuery = fallbackQuery.ilike('nome', `%${search}%`);
      }

      if (cursorName && cursorId) {
        fallbackQuery = fallbackQuery.or(`nome.gt."${cursorName}",and(nome.eq."${cursorName}",id.gt."${cursorId}")`);
      }

      fallbackQuery = fallbackQuery.order('nome', { ascending: true }).order('id', { ascending: true }).limit(limit + 1);
      const fallbackRes = await fallbackQuery;
      membersData = fallbackRes.data;
      queryError = fallbackRes.error;
    }

    if (queryError) {
      console.error('Erro ao buscar membros no pool:', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    // Mapa de unidades em memória para acesso O(1) imediato
    const unitMap = new Map<string, string>();
    (unitsRes.data || []).forEach((u: any) => {
      unitMap.set(u.id, u.nome);
    });

    const rows = membersData || [];
    const hasNextPage = rows.length > limit;
    const pagedRows = hasNextPage ? rows.slice(0, limit) : rows;

    const lastItem = pagedRows.length > 0 ? pagedRows[pagedRows.length - 1] : null;
    const nextCursor = hasNextPage && lastItem
      ? { cursorName: lastItem.nome, cursorId: lastItem.id }
      : null;

    const members: MemberListItem[] = pagedRows.map((m: any) => {
      const effectiveUnitId = m.unidade_id || m.celula_id || null;
      const isUnlinked = !effectiveUnitId;
      const cellName = effectiveUnitId ? unitMap.get(effectiveUnitId) || 'Célula Vinculada' : 'Sem Célula (Geral)';

      return {
        id: m.id,
        name: m.nome,
        role: m.funcao || 'Membro',
        cellId: effectiveUnitId,
        cellName,
        neighborhood: m.bairro || 'Centro',
        phone: m.telefone || '',
        avatarUrl: m.url_avatar || undefined,
        isUnlinked,
      };
    });

    // Contadores
    let counts = { total: 0, unlinked: 0, linked: 0 };
    if (countsRes && countsRes.length === 3) {
      counts = {
        total: countsRes[0].count || 0,
        unlinked: countsRes[1].count || 0,
        linked: countsRes[2].count || 0,
      };
    }

    return NextResponse.json({
      success: true,
      members,
      nextCursor,
      hasNextPage,
      counts,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/members/pool GET:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      churchId,
      name,
      phone,
      email,
      neighborhood,
      role = 'Membro',
      cellId = null,
      notes,
    } = body;

    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'O nome do membro é obrigatório.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const supabase = supabaseAdmin || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const memberId = generateUUID();
    const cleanLogin = (
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 15) + Math.floor(100 + Math.random() * 900)
    ).trim();

    const validCellId = cellId && cellId.trim() !== '' ? cellId.trim() : null;
    const cleanPass = '123456';

    // Cria instantaneamente o usuário em auth.users para acesso imediato
    let authUserId: string | null = null;
    if (supabaseAdmin) {
      authUserId = await createAuthUserForMember({
        churchId,
        memberId,
        name: name.trim(),
        login: cleanLogin,
        password: cleanPass,
        email: email?.trim() || null,
        role,
      });
    }

    const payloadPt: any = {
      id: memberId,
      igreja_id: churchId,
      unidade_id: validCellId,
      nome: name.trim(),
      funcao: role,
      login: cleanLogin,
      senha_hash: cleanPass,
      auth_user_id: authUserId,
      bairro: neighborhood?.trim() || 'Centro',
      aniversario: '01/01',
      telefone: phone?.trim() || null,
      email: email?.trim() || null,
      status_frequencia: 'green',
      percentual_frequencia: 100,
      url_avatar: null,
      observacoes: notes?.trim() || (validCellId ? 'Cadastrado e vinculado à célula' : 'Cadastrado no Pool Geral da igreja'),
    };

    let { error: insertErr } = await supabase.from('membros').insert([payloadPt]);
    if (insertErr && (insertErr.code === '42P01' || insertErr.message?.includes('does not exist') || insertErr.message?.includes('unidade_id'))) {
      const payloadLegacy: any = { ...payloadPt, celula_id: validCellId };
      delete payloadLegacy.unidade_id;
      const resLegacy = await supabase.from('members').insert([payloadLegacy]);
      insertErr = resLegacy.error;
    }

    if (insertErr) {
      if (authUserId) {
        await deleteAuthUserForMember(authUserId);
      }
      console.error('Erro ao cadastrar membro:', insertErr);
      return NextResponse.json({ error: `Falha ao cadastrar membro: ${insertErr.message}` }, { status: 500 });
    }

    // Se vinculado à célula, atualizar contagem de membros em celulas se aplicável
    if (validCellId) {
      try {
        const { count: countPt } = await supabase
          .from('membros')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', validCellId);
        await supabase.from('celulas').update({ quantidade_membros: countPt || 1 }).eq('unidade_id', validCellId);
      } catch {}
    }

    return NextResponse.json({
      success: true,
      member: {
        id: memberId,
        churchId,
        cellId: validCellId || '',
        isUnlinked: !validCellId,
        name: name.trim(),
        role,
        neighborhood: neighborhood || 'Centro',
        phone: phone || '',
        email: email || '',
        attendanceStatus: 'green',
        attendancePercentage: 100,
      },
    });
  } catch (err: any) {
    console.error('Erro na rota /api/members/pool POST:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

// Vincular / Desvincular membro da Célula
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { memberId, cellId, churchId } = body;

    if (!memberId) {
      return NextResponse.json({ error: 'memberId é obrigatório.' }, { status: 400 });
    }
    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const validCellId = cellId && typeof cellId === 'string' && cellId.trim() !== '' ? cellId.trim() : null;

    // Se cellId foi passado, valida se corresponde a uma célula (nível folha) da igreja
    let targetCellName = '';
    if (validCellId) {
      const { data: unitCheck } = await supabase
        .from('unidades')
        .select('id, nome')
        .eq('id', validCellId)
        .eq('igreja_id', churchId)
        .maybeSingle();

      if (unitCheck) {
        targetCellName = unitCheck.nome;
      } else {
        const { data: cellCheck } = await supabase
          .from('cells')
          .select('id, nome')
          .eq('id', validCellId)
          .eq('igreja_id', churchId)
          .maybeSingle();

        if (cellCheck) {
          targetCellName = cellCheck.nome;
        } else {
          return NextResponse.json(
            { error: 'Célula selecionada não foi encontrada ou não pertence a esta igreja.' },
            { status: 400 }
          );
        }
      }
    }

    // Atualiza unidade_id do membro em 'membros'
    const noteText = validCellId
      ? `Membro vinculado à célula ${targetCellName} em ${new Date().toLocaleDateString('pt-BR')}`
      : 'Membro retornado ao Pool Geral';

    let { error: updateErr } = await supabase
      .from('membros')
      .update({
        unidade_id: validCellId,
        observacoes: noteText,
      })
      .eq('id', memberId)
      .eq('igreja_id', churchId);

    if (updateErr && (updateErr.code === '42P01' || updateErr.message?.includes('does not exist') || updateErr.message?.includes('unidade_id'))) {
      const legacyRes = await supabase
        .from('members')
        .update({
          celula_id: validCellId,
          observacoes: noteText,
        })
        .eq('id', memberId)
        .eq('igreja_id', churchId);
      updateErr = legacyRes.error;
    }

    if (updateErr) {
      console.error('Erro ao atualizar vinculação de membro:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Atualiza contadores
    if (validCellId) {
      try {
        const { count } = await supabase
          .from('membros')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', validCellId);
        await supabase.from('celulas').update({ quantidade_membros: count || 1 }).eq('unidade_id', validCellId);
      } catch {}
    }

    return NextResponse.json({
      success: true,
      memberId,
      cellId: cellId || null,
      cellName: targetCellName || 'Pool Geral (Sem Célula)',
      isUnlinked: !cellId,
    });
  } catch (err: any) {
    console.error('Erro na rota /api/members/pool PATCH:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}

/**
 * DELETE /api/members/pool
 * Exclui o membro da congregação e remove automaticamente seu usuário do auth.users
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId') || searchParams.get('id');

    if (!memberId) {
      return NextResponse.json({ error: 'memberId é obrigatório.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const supabase = supabaseAdmin || getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // Busca o auth_user_id do membro antes da exclusão
    const { data: memberData } = await supabase
      .from('membros')
      .select('id, auth_user_id, unidade_id')
      .eq('id', memberId)
      .maybeSingle();

    const authUserId = memberData?.auth_user_id;
    const oldUnitId = memberData?.unidade_id;

    // Exclui da tabela membros
    let { error: delErr } = await supabase.from('membros').delete().eq('id', memberId);
    if (delErr && (delErr.code === '42P01' || delErr.message?.includes('does not exist'))) {
      const legDel = await supabase.from('members').delete().eq('id', memberId);
      delErr = legDel.error;
    }

    if (delErr) {
      console.error('Erro ao excluir membro:', delErr);
      return NextResponse.json({ error: `Falha ao remover membro: ${delErr.message}` }, { status: 500 });
    }

    // Remove o usuário do auth.users
    if (authUserId) {
      await deleteAuthUserForMember(authUserId);
    }

    // Recalcula contadores de célula se aplicável
    if (oldUnitId) {
      try {
        const { count } = await supabase
          .from('membros')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', oldUnitId);
        await supabase.from('celulas').update({ quantidade_membros: count || 0 }).eq('unidade_id', oldUnitId);
      } catch {}
    }

    return NextResponse.json({ success: true, deletedMemberId: memberId, authDeleted: Boolean(authUserId) });
  } catch (err: any) {
    console.error('Erro na rota /api/members/pool DELETE:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
