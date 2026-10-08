import { NextRequest, NextResponse } from 'next/server';
import { requireSession, resolveChurchId, forbiddenChurch, requireAnyPermission, requireCanAssignRole, loadMemberInChurch, requireLevel } from '@/lib/requireSession';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { createAuthUserForMember, deleteAuthUserForMember } from '@/lib/supabase/authAdmin';
import { AttendanceStatus } from '@/types';
import crypto from 'crypto';

/** Nível mínimo para excluir membros: 3 = Líder de Setor (2º nível de liderança). */
const MIN_LEVEL_TO_DELETE_MEMBER = 3;

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

// Cache em memória de unidades por igreja (2 minutos) para evitar queries repetitivas na paginação
const serverUnitsCache = new Map<string, { data: any[]; expiry: number }>();

async function getCachedUnits(supabase: any, churchId: string) {
  const now = Date.now();
  const cached = serverUnitsCache.get(churchId);
  if (cached && cached.expiry > now) {
    return { data: cached.data, error: null };
  }
  let res = await supabase
    .from('unidades')
    .select('id, nome')
    .eq('igreja_id', churchId)
    .eq('ativo', true);
  if (res.error && (res.error.code === '42P01' || res.error.message?.includes('does not exist'))) {
    const fallbackCells = await supabase
      .from('cells')
      .select('id, name')
      .eq('church_id', churchId);
    if (!fallbackCells.error && fallbackCells.data) {
      res = { data: fallbackCells.data.map((c: any) => ({ id: c.id, nome: c.name })), error: null };
    }
  }
  if (!res.error && res.data) {
    serverUnitsCache.set(churchId, { data: res.data, expiry: now + 2 * 60 * 1000 });
  }
  return res;
}

/**
 * GET /api/members/pool
 * 
 * Implementa:
 * 1. Paginação por cursor / limit (25 itens por página com cursor baseado em (nome, id))
 * 2. SELECT APENAS das colunas estritamente necessárias (id, nome, funcao, papel_id, unidade_id, bairro, telefone, url_avatar). Sem email, status_frequencia, percentual_frequencia ou senha_hash.
 * 3. Busca e filtros no servidor (search por nome, bairro, telefone ou nome da célula; filter: all|unlinked|linked)
 * 4. Consulta direta das tabelas novas (membros, unidades) em join ou lote único sem cascata N+1
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    const churchId = resolveChurchId(auth.actor, searchParams.get('churchId'));
    if (searchParams.get('churchId') && !churchId) return forbiddenChurch();
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'unlinked' | 'linked'
    const rawSearch = (searchParams.get('search') || '').trim();
    // Sanitiza contra quebra de sintaxe PostgREST (.or(...) utiliza vírgulas e aspas)
    const search = rawSearch.replace(/[,()"'\\]/g, '');
    const cursorNameRaw = searchParams.get('cursorName') || null;
    const cursorName = cursorNameRaw ? cursorNameRaw.replace(/[,()"'\\]/g, '') : null;
    const cursorIdRaw = searchParams.get('cursorId') || null;
    const cursorId = cursorIdRaw && /^[a-zA-Z0-9_-]+$/.test(cursorIdRaw) ? cursorIdRaw : null;
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '25', 10), 1), 100);

    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // Busca unidades primeiro para resolver os IDs de células na busca textual
    const unitsRes = await getCachedUnits(supabase, churchId);
    const unitList: any[] = unitsRes.data || [];

    // Se houver termo de busca, verifica se coincide com o nome de alguma célula/unidade
    let matchingUnitIds: string[] = [];
    if (search) {
      const s = search.toLowerCase().trim();
      const searchWords = s
        .split(/\s+/)
        .filter((w) => w.length >= 3 && w !== 'celula' && w !== 'célula');

      matchingUnitIds = unitList
        .filter((u: any) => {
          const uName = (u.nome || u.name || '').toLowerCase();
          if (!uName) return false;
          if (uName.includes(s) || s.includes(uName)) return true;
          return searchWords.some((word) => uName.includes(word));
        })
        .map((u: any) => u.id);
    }

    // 1. Consulta em lote único e paralelo:
    // Query de membros com projeção restrita + contadores exatos via HEAD
    const isFirstPage = !cursorName && !cursorId;

    const [membersRes, countsRes] = await Promise.all([
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
          // Busca por nome, bairro, telefone ou célula vinculada
          const orConditions = [
            `nome.ilike.%${search}%`,
            `bairro.ilike.%${search}%`,
            `telefone.ilike.%${search}%`,
          ];
          if (matchingUnitIds.length > 0) {
            matchingUnitIds.forEach((uid) => {
              orConditions.push(`unidade_id.eq.${uid}`);
            });
          }
          q = q.or(orConditions.join(','));
        }

        // Paginação por cursor: (nome > cursorName) ou (nome = cursorName e id > cursorId)
        if (cursorName && cursorId) {
          q = q.or(`nome.gt."${cursorName}",and(nome.eq."${cursorName}",id.gt."${cursorId}")`);
        }

        q = q.order('nome', { ascending: true }).order('id', { ascending: true }).limit(limit + 1);

        return q;
      })(),
      isFirstPage && !search
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
        const fallbackOrConditions = [
          `nome.ilike.%${search}%`,
          `bairro.ilike.%${search}%`,
          `telefone.ilike.%${search}%`,
        ];
        if (matchingUnitIds.length > 0) {
          matchingUnitIds.forEach((uid) => {
            fallbackOrConditions.push(`celula_id.eq.${uid}`);
          });
        }
        fallbackQuery = fallbackQuery.or(fallbackOrConditions.join(','));
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
      const effectiveUnitId = m.unidade_id || null;
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
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const deniedCreate = await requireAnyPermission(auth.actor, ['member:create']);
    if (deniedCreate) return deniedCreate;
    const body = await req.json();
    const {
      churchId: requestedChurchId,
      name,
      phone,
      email,
      neighborhood,
      role = 'Membro',
      cellId = null,
      notes,
    } = body;

    const churchId = resolveChurchId(auth.actor, requestedChurchId);
    if (requestedChurchId && !churchId) return forbiddenChurch();
    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }
    const deniedRole = await requireCanAssignRole(auth.actor, role, null);
    if (deniedRole) return deniedRole;
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
    authUserId = await createAuthUserForMember({
      churchId,
      memberId,
      name: name.trim(),
      login: cleanLogin,
      password: cleanPass,
      email: email?.trim() || null,
      role,
    });

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

    // Sincroniza quantidade_membros na unidade (toda pessoa vinculada, independente da função)
    if (validCellId) {
      const { count: realCount } = await supabase
        .from('membros')
        .select('*', { count: 'exact', head: true })
        .eq('unidade_id', validCellId);
      if (typeof realCount === 'number') {
        await supabase
          .from('unidades')
          .update({ quantidade_membros: realCount, atualizado_em: new Date().toISOString() })
          .eq('id', validCellId);
      }
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
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const deniedEdit = await requireAnyPermission(auth.actor, ['member:edit']);
    if (deniedEdit) return deniedEdit;
    const body = await req.json();
    const { memberId, cellId, churchId: requestedChurchId } = body;
    const churchId = resolveChurchId(auth.actor, requestedChurchId);
    if (requestedChurchId && !churchId) return forbiddenChurch();

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
        return NextResponse.json(
          { error: 'Célula selecionada não foi encontrada ou não pertence a esta igreja.' },
          { status: 400 }
        );
      }
    }

    // Busca a unidade atual do membro para recalcular caso seja alterada/desvinculada
    const { data: memberBefore } = await supabase
      .from('membros')
      .select('id, unidade_id')
      .eq('id', memberId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    const previousUnitId = memberBefore?.unidade_id;

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

    // Se a unidade mudou, atualiza a contagem da unidade antiga e da nova
    if (previousUnitId !== validCellId) {
      if (previousUnitId) {
        const { count: oldCount } = await supabase
          .from('membros')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', previousUnitId);
        if (typeof oldCount === 'number') {
          await supabase
            .from('unidades')
            .update({ quantidade_membros: oldCount, atualizado_em: new Date().toISOString() })
            .eq('id', previousUnitId);
        }
      }
      if (validCellId) {
        const { count: newCount } = await supabase
          .from('membros')
          .select('*', { count: 'exact', head: true })
          .eq('unidade_id', validCellId);
        if (typeof newCount === 'number') {
          await supabase
            .from('unidades')
            .update({ quantidade_membros: newCount, atualizado_em: new Date().toISOString() })
            .eq('id', validCellId);
        }
      }
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
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    // Somente Líder de Setor (nível 3, 2º nível de liderança) ou acima, e com a permissão member:delete
    const deniedLevel = requireLevel(auth.actor, MIN_LEVEL_TO_DELETE_MEMBER);
    if (deniedLevel) return deniedLevel;
    const deniedDelete = await requireAnyPermission(auth.actor, ['member:delete']);
    if (deniedDelete) return deniedDelete;
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId') || searchParams.get('id');

    if (!memberId) {
      return NextResponse.json({ error: 'memberId é obrigatório.' }, { status: 400 });
    }
    const target = await loadMemberInChurch(auth.actor, memberId);
    if (target.error) return target.error;
    if (!auth.actor.isSystemAdmin && target.member.level > auth.actor.level) {
      return NextResponse.json(
        { error: 'Este membro tem um nível acima do seu.' },
        { status: 403 }
      );
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

    if (delErr?.code === '23503') {
      // Membro aparece como "lançado por"/tesoureiro em relatórios semanais: o histórico
      // dos relatórios é preservado e a exclusão é recusada com uma mensagem clara.
      return NextResponse.json(
        {
          error:
            'Este membro lançou ou conferiu relatórios semanais e não pode ser excluído para preservar o histórico. Use "Desvincular" para tirá-lo da célula.',
        },
        { status: 409 }
      );
    }

    if (delErr) {
      console.error('Erro ao excluir membro:', delErr);
      return NextResponse.json({ error: `Falha ao remover membro: ${delErr.message}` }, { status: 500 });
    }

    // Remove o usuário do auth.users
    if (authUserId) {
      await deleteAuthUserForMember(authUserId);
    }

    // Atualiza quantidade_membros da unidade correspondente
    if (oldUnitId) {
      const { count: remCount } = await supabase
        .from('membros')
        .select('*', { count: 'exact', head: true })
        .eq('unidade_id', oldUnitId);
      if (typeof remCount === 'number') {
        await supabase
          .from('unidades')
          .update({ quantidade_membros: remCount, atualizado_em: new Date().toISOString() })
          .eq('id', oldUnitId);
      }
    }

    return NextResponse.json({ success: true, deletedMemberId: memberId, authDeleted: Boolean(authUserId) });
  } catch (err: any) {
    console.error('Erro na rota /api/members/pool DELETE:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
  }
}
