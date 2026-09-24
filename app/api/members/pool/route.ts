import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { CellMember, UserRole, AttendanceStatus } from '@/types';
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId');
    const filter = searchParams.get('filter') || 'all'; // 'all' | 'unlinked' | 'linked'

    if (!churchId) {
      return NextResponse.json({ error: 'churchId é obrigatório.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // Executa em paralelo a busca de membros e a busca de unidades/células para máxima performance
    const [membersRes, unitsRes] = await Promise.all([
      (() => {
        let q = supabase
          .from('membros')
          .select('id, igreja_id, unidade_id, papel_id, funcao, nome, login, bairro, aniversario, telefone, email, status_frequencia, percentual_frequencia, url_avatar, observacoes')
          .eq('igreja_id', churchId)
          .order('nome', { ascending: true });

        if (filter === 'unlinked') {
          q = q.is('unidade_id', null);
        } else if (filter === 'linked') {
          q = q.not('unidade_id', 'is', null);
        }
        return q;
      })(),
      supabase
        .from('unidades')
        .select('id, nome')
        .eq('igreja_id', churchId)
        .eq('ativo', true),
    ]);

    let membersData = membersRes.data;
    let queryError = membersRes.error;

    // Fallback rápido se a tabela ainda for a legada
    if (queryError && (queryError.code === '42P01' || queryError.message?.includes('does not exist') || queryError.message?.includes('unidade_id'))) {
      let fallbackQuery = supabase
        .from('members')
        .select('*')
        .eq('igreja_id', churchId)
        .order('nome', { ascending: true });

      if (filter === 'unlinked') {
        fallbackQuery = fallbackQuery.is('celula_id', null);
      } else if (filter === 'linked') {
        fallbackQuery = fallbackQuery.not('celula_id', 'is', null);
      }
      const fallbackRes = await fallbackQuery;
      membersData = fallbackRes.data;
      queryError = fallbackRes.error;
    }

    if (queryError) {
      console.error('Erro ao buscar membros:', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    // Mapa de unidades em memória para acesso O(1)
    const cellMap = new Map<string, string>();
    (unitsRes.data || []).forEach((u: any) => {
      cellMap.set(u.id, u.nome);
    });

    let unlinkedCount = 0;
    let linkedCount = 0;

    const members: (CellMember & { isUnlinked: boolean; cellName?: string })[] = (
      membersData || []
    ).map((m: any) => {
      const effectiveCellId = m.unidade_id || m.celula_id || '';
      const isUnlinked = !effectiveCellId;

      if (isUnlinked) {
        unlinkedCount++;
      } else {
        linkedCount++;
      }

      return {
        id: m.id,
        churchId: m.igreja_id,
        cellId: effectiveCellId,
        isUnlinked,
        cellName: effectiveCellId ? cellMap.get(effectiveCellId) || 'Célula Vinculada' : 'Sem Célula (Geral)',
        name: m.nome,
        login: m.login || '',
        role: (m.funcao as UserRole) || 'Membro',
        roleId: m.papel_id || m.funcao_id,
        neighborhood: m.bairro || 'Centro',
        birthday: m.aniversario || '01/01',
        phone: m.telefone || '',
        email: m.email || '',
        attendanceStatus: (m.status_frequencia as AttendanceStatus) || 'green',
        attendancePercentage: m.percentual_frequencia ?? 100,
        avatarUrl: m.url_avatar,
        notes: m.observacoes || '',
      };
    });

    return NextResponse.json({
      success: true,
      members,
      counts: {
        total: members.length,
        unlinked: unlinkedCount,
        linked: linkedCount,
      },
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

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    const memberId = generateUUID();
    const cleanLogin = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 15) + Math.floor(100 + Math.random() * 900);

    const validCellId = cellId && cellId.trim() !== '' ? cellId.trim() : null;

    const payloadPt: any = {
      id: memberId,
      igreja_id: churchId,
      unidade_id: validCellId,
      nome: name.trim(),
      funcao: role,
      login: cleanLogin,
      senha_hash: '123456',
      bairro: neighborhood?.trim() || 'Centro',
      aniversario: '01/01',
      telefone: phone?.trim() || null,
      email: email?.trim() || null,
      status_frequencia: 'green',
      percentual_frequencia: 100,
      url_avatar: `https://images.unsplash.com/photo-${1534528741775 + Math.floor(Math.random() * 1000)}?w=150`,
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
      // 1. Verificar em celulas/unidades
      const { data: unitCheck } = await supabase
        .from('unidades')
        .select('id, nome, nivel_tipo_id')
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
