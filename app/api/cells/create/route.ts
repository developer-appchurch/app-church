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
  unidade_criadora_id?: string | null;
  motherCellId?: string | null;
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

    const unitId = generateUUID();

    const formattedAddress =
      body.address?.trim() ||
      (body.neighborhood?.trim() ? `Bairro ${body.neighborhood.trim()}` : 'Endereço da Célula');
    const meetingDay = body.meetingDay?.trim() || 'Quarta-feira';
    const meetingTime = body.meetingTime?.trim() || '19:30';
    const sectorName = body.sectorName?.trim() || 'Geral';
    const leaderName = body.leaderName.trim();
    const cellName = body.name.trim();

    // 1. Descobrir nível 'Célula' em 'nivel_tipo' para esta igreja
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
            ordem: 40,
          },
        ])
        .select('id')
        .single();
      cellLevelId = newLvl?.id || newLvlId;
    }

    // 2. Inserir em 'unidades' com todos os atributos consolidados
    // quantidade_membros inicia em 0 e é mantido pelo trigger caso um líder seja associado
    const initialMembersCount = body.leaderMemberId ? 1 : 0;
    const motherCellId = body.unidade_criadora_id || body.motherCellId || null;

    const unitPayload: any = {
      id: unitId,
      igreja_id: body.churchId,
      nivel_tipo_id: cellLevelId,
      nome: cellName,
      pai_id: body.parentUnitId || null,
      unidade_criadora_id: motherCellId && motherCellId.trim() !== '' ? motherCellId.trim() : null,
      bairro: body.neighborhood?.trim() || 'Centro',
      endereco: formattedAddress,
      dia_semana: meetingDay,
      dia_reuniao: meetingDay,
      horario: meetingTime,
      horario_reuniao: meetingTime,
      quantidade_membros: 0,
      ativo: true,
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    };

    const { error: unitErr } = await supabase.from('unidades').insert([unitPayload]);
    if (unitErr) {
      console.error('Falha ao inserir em unidades:', unitErr);
      return NextResponse.json(
        { error: `Falha ao registrar unidade da célula: ${unitErr.message}` },
        { status: 500 }
      );
    }

    // 3. Sincronização secundária em 'celulas' (para compatibilidade retroativa)
    try {
      await supabase.from('celulas').upsert(
        [
          {
            unidade_id: unitId,
            bairro: body.neighborhood?.trim() || 'Centro',
            endereco: formattedAddress,
            dia_semana: meetingDay,
            horario: meetingTime,
            quantidade_membros: initialMembersCount,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          },
        ],
        { onConflict: 'unidade_id' }
      );
    } catch (cErr) {
      console.warn('Aviso ao registrar em celulas:', cErr);
    }

    // 4. Se houver líder especificado, vincula à célula em unidade_lideres e atualiza membro
    if (body.leaderMemberId) {
      await Promise.all([
        supabase
          .from('membros')
          .update({ unidade_id: unitId })
          .eq('id', body.leaderMemberId),
        supabase.from('unidade_lideres').insert([
          {
            unidade_id: unitId,
            pessoa_id: body.leaderMemberId,
            papel: 'Líder de Célula',
            ativo: true,
          },
        ]),
      ]);
    }

    const createdCell: CellGroup = {
      id: unitId,
      churchId: body.churchId,
      name: cellName,
      leaderName,
      sectorName,
      address: formattedAddress,
      meetingDay,
      meetingTime,
      memberCount: initialMembersCount,
      unidade_criadora_id: motherCellId,
      motherCellId: motherCellId || undefined,
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
