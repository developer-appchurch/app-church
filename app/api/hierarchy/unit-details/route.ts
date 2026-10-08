import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireSession, resolveChurchId, forbiddenChurch } from '@/lib/requireSession';

export interface UnitDetailResponse {
  id: string;
  name: string;
  levelTypeId: string;
  levelTypeName: string;
  levelOrder: number;
  parentId: string | null;
  parentName?: string;
  isActive: boolean;
  meetingDay?: string;
  meetingTime?: string;
  neighborhood?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  memberCount: number;
  leaders: Array<{
    id: string;
    name: string;
    role?: string;
    avatarUrl?: string;
    phone?: string;
  }>;
  members?: Array<{
    id: string;
    name: string;
    role?: string;
    avatarUrl?: string;
    phone?: string;
  }>;
}

/**
 * GET /api/hierarchy/unit-details?unitId=...&churchId=...
 * Carregamento sob demanda (lazy) de detalhes pesados:
 * endereço, coordenadas, líderes e membros vinculados
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession(req);
    if (auth.error) return auth.error;
    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get('unitId');
    const churchId = searchParams.get('churchId');
    if (churchId && !resolveChurchId(auth.actor, churchId)) return forbiddenChurch();

    if (!unitId || !churchId) {
      return NextResponse.json(
        { error: 'unitId e churchId são parâmetros obrigatórios.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    }

    // 1. Busca unidade base com todas as colunas
    const { data: rawUnit, error: unitErr } = await supabase
      .from('unidades')
      .select('*')
      .eq('id', unitId)
      .eq('igreja_id', churchId)
      .maybeSingle();

    const unit = rawUnit as any;

    if (unitErr || !unit) {
      return NextResponse.json({ error: 'Unidade não encontrada.' }, { status: 404 });
    }

    // 2. Busca paralela de detalhes específicos sob demanda
    const [
      levelRes,
      parentRes,
      leadersRes,
      membersRes,
    ] = await Promise.all([
      supabase.from('nivel_tipo').select('nome, ordem').eq('id', unit.nivel_tipo_id).maybeSingle(),
      unit.pai_id ? supabase.from('unidades').select('nome').eq('id', unit.pai_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from('unidade_lideres')
        .select('pessoa_id, papel, ativo')
        .eq('unidade_id', unitId)
        .eq('ativo', true),
      supabase
        .from('membros')
        .select('id, nome, funcao, url_avatar, telefone')
        .eq('unidade_id', unitId),
    ]);


    // Resolução de nomes dos líderes
    const leaderIds = (leadersRes.data || []).map((l: any) => l.pessoa_id);
    let leaderDetails: any[] = [];
    if (leaderIds.length > 0) {
      const { data: lMembers } = await supabase
        .from('membros')
        .select('id, nome, funcao, url_avatar, telefone')
        .in('id', leaderIds);

      const leaderRoleMap = new Map<string, string>();
      (leadersRes.data || []).forEach((l: any) => leaderRoleMap.set(l.pessoa_id, l.papel || 'Líder'));

      leaderDetails = (lMembers || []).map((m: any) => ({
        id: m.id,
        name: m.nome,
        role: leaderRoleMap.get(m.id) || m.funcao || 'Líder',
        avatarUrl: m.url_avatar,
        phone: m.telefone,
      }));
    }

    const membersList = (membersRes.data || []).map((m: any) => ({
      id: m.id,
      name: m.nome,
      role: m.funcao || 'Membro',
      avatarUrl: m.url_avatar,
      phone: m.telefone,
    }));

    const realMembersCount = (membersRes.data || []).length;
    const finalMemberCount =
      typeof unit.quantidade_membros === 'number' && unit.quantidade_membros > 0
        ? unit.quantidade_membros
        : realMembersCount;

    // Se o valor no banco estiver desatualizado em relação aos membros vinculados, sincroniza
    if (typeof unit.quantidade_membros === 'number' && unit.quantidade_membros !== realMembersCount && realMembersCount > 0) {
      Promise.resolve(
        supabase
          .from('unidades')
          .update({ quantidade_membros: realMembersCount, atualizado_em: new Date().toISOString() })
          .eq('id', unit.id)
      ).catch(() => {});
    }

    const response: UnitDetailResponse = {
      id: unit.id,
      name: unit.nome,
      levelTypeId: unit.nivel_tipo_id,
      levelTypeName: levelRes.data?.nome || 'Unidade',
      levelOrder: levelRes.data?.ordem || 0,
      parentId: unit.pai_id,
      parentName: parentRes.data?.nome,
      isActive: unit.ativo !== false,
      meetingDay: unit.dia_semana || unit.dia_reuniao,
      meetingTime: unit.horario || unit.horario_reuniao,
      neighborhood: unit.bairro,
      address: unit.endereco,
      latitude: unit.latitude ? Number(unit.latitude) : undefined,
      longitude: unit.longitude ? Number(unit.longitude) : undefined,
      memberCount: finalMemberCount,
      leaders: leaderDetails,
      members: membersList,
    };

    return NextResponse.json({ success: true, details: response });
  } catch (err: any) {
    console.error('Erro ao buscar detalhes da unidade:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao buscar detalhes.' }, { status: 500 });
  }
}
