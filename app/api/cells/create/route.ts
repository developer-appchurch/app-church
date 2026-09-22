import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { CellGroup } from '@/types';
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

export interface CreateCellPayload {
  churchId: string;
  name: string;
  leaderName: string;
  leaderMemberId?: string;
  sectorName?: string;
  neighborhood?: string;
  address?: string;
  meetingDay?: string;
  meetingTime?: string;
  parentUnitId?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateCellPayload = await req.json();

    if (!body.churchId) {
      return NextResponse.json(
        { error: 'ID da igreja é obrigatório.' },
        { status: 400 }
      );
    }

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: 'Nome da célula é obrigatório.' },
        { status: 400 }
      );
    }

    if (!body.leaderName?.trim()) {
      return NextResponse.json(
        { error: 'Nome do líder da célula é obrigatório.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Servidor de banco de dados não configurado.' },
        { status: 500 }
      );
    }

    const cellId = generateUUID();
    const unitId = generateUUID();

    const formattedAddress =
      body.address?.trim() ||
      (body.neighborhood?.trim() ? `Bairro ${body.neighborhood.trim()}` : 'Endereço da Célula');
    const meetingDay = body.meetingDay?.trim() || 'Quarta-feira';
    const meetingTime = body.meetingTime?.trim() || '19:30';
    const sectorName = body.sectorName?.trim() || 'Geral';
    const leaderName = body.leaderName.trim();
    const cellName = body.name.trim();

    // 1. Inserir em 'cells'
    const cellRow = {
      id: cellId,
      igreja_id: body.churchId,
      nome: cellName,
      nome_lider: leaderName,
      nome_setor: sectorName,
      endereco: formattedAddress,
      dia_reuniao: meetingDay,
      horario_reuniao: meetingTime,
      quantidade_membros: body.leaderMemberId ? 1 : 0,
    };

    const { error: cellErr } = await supabase.from('cells').insert([cellRow]);
    if (cellErr) {
      return NextResponse.json(
        { error: `Falha ao criar célula em 'cells': ${cellErr.message}` },
        { status: 500 }
      );
    }

    // 2. Descobrir nível 'Célula' em 'nivel_tipo' para esta igreja
    let cellLevelId: string | null = null;
    const { data: niveis } = await supabase
      .from('nivel_tipo')
      .select('id, nome, ordem')
      .eq('igreja_id', body.churchId)
      .order('ordem', { ascending: false });

    if (niveis && niveis.length > 0) {
      const match = niveis.find((n: any) =>
        n.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('celula')
      );
      cellLevelId = match ? match.id : niveis[0].id;
    }

    // Se a igreja não tiver nenhum nível registrado, cria o nível padrão 'Célula'
    if (!cellLevelId) {
      const newLvlId = generateUUID();
      const { data: newLvl } = await supabase
        .from('nivel_tipo')
        .insert([
          {
            id: newLvlId,
            igreja_id: body.churchId,
            nome: 'Célula',
            ordem: 10,
          },
        ])
        .select('id')
        .single();
      cellLevelId = newLvl?.id || newLvlId;
    }

    // 3. Inserir em 'unidades'
    const { error: unitErr } = await supabase.from('unidades').insert([
      {
        id: unitId,
        igreja_id: body.churchId,
        nivel_tipo_id: cellLevelId,
        nome: cellName,
        pai_id: body.parentUnitId || null,
      },
    ]);
    if (unitErr) {
      console.warn('Aviso ao inserir em unidades:', unitErr);
    }

    // 4. Inserir em 'celulas'
    const { error: celulaErr } = await supabase.from('celulas').insert([
      {
        unidade_id: unitId,
        bairro: body.neighborhood?.trim() || 'Centro',
        endereco: formattedAddress,
        dia_semana: meetingDay,
        horario: meetingTime,
        quantidade_membros: body.leaderMemberId ? 1 : 0,
      },
    ]);
    if (celulaErr) {
      console.warn('Aviso ao inserir em celulas:', celulaErr);
    }

    // 5. Se houver líder especificado (ex: Pastor Titular da igreja), vincula à célula
    if (body.leaderMemberId) {
      const { error: updateMemberErr } = await supabase
        .from('members')
        .update({ celula_id: cellId })
        .eq('id', body.leaderMemberId);

      if (updateMemberErr) {
        console.warn('Aviso ao atualizar celula_id do membro líder:', updateMemberErr);
      }

      const { error: liderErr } = await supabase.from('unidade_lideres').insert([
        {
          unidade_id: unitId,
          pessoa_id: body.leaderMemberId,
          papel: 'Líder de Célula',
          ativo: true,
        },
      ]);
      if (liderErr) {
        console.warn('Aviso ao vincular unidade_lideres:', liderErr);
      }
    }

    const createdCell: CellGroup = {
      id: cellId,
      churchId: body.churchId,
      name: cellName,
      leaderName,
      sectorName,
      address: formattedAddress,
      meetingDay,
      meetingTime,
      memberCount: body.leaderMemberId ? 1 : 0,
    };

    return NextResponse.json({
      success: true,
      cell: createdCell,
      unitId,
    });
  } catch (error: any) {
    console.error('Erro na rota /api/cells/create:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao cadastrar célula.' },
      { status: 500 }
    );
  }
}
