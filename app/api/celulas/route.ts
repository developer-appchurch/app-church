import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { CelulaCardItem } from '@/types';

/**
 * Rota de listagem de Células da Igreja utilizando 'public.unidades' como fonte única de verdade.
 * Identifica células pelo nivel_tipo_id correspondente ao nível "Célula".
 * A quantidade de membros é obtida diretamente de 'unidades.quantidade_membros' (mantida pelo trigger PostgreSQL).
 * 
 * GET /api/celulas?churchId=...&search=...&diaSemana=...&page=1&pageSize=12
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não inicializado.' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get('churchId') || searchParams.get('igrejaId') || '';
    const search = (searchParams.get('search') || '').trim();
    const diaSemana = (searchParams.get('diaSemana') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(1000, Math.max(1, parseInt(searchParams.get('pageSize') || '500', 10)));

    if (!churchId) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: churchId' },
        { status: 400 }
      );
    }

    // 1. Identifica o(s) ID(s) do nível hierárquico 'Célula' em 'nivel_tipo' para a congregação
    let cellLevelIds: string[] = [];
    let nivelQuery = supabase
      .from('nivel_tipo')
      .select('id, nome, ordem')
      .order('ordem', { ascending: false });

    if (churchId !== 'all' && churchId !== 'church-master') {
      nivelQuery = nivelQuery.eq('igreja_id', churchId);
    }

    const { data: niveis, error: nivelErr } = await nivelQuery;
    if (nivelErr) {
      console.warn('[API /api/celulas] Erro ao consultar nivel_tipo:', nivelErr.message);
    }

    if (niveis && niveis.length > 0) {
      const matchedLevels = niveis.filter((n: any) => {
        const nomeNorm = (n.nome || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
        return nomeNorm === 'celula' || nomeNorm.includes('celula') || n.ordem === 40;
      });

      if (matchedLevels.length > 0) {
        cellLevelIds = matchedLevels.map((n: any) => n.id);
      } else {
        // Fallback: se nenhum nome tiver 'celula', o nível de maior ordem (folha) é a célula
        cellLevelIds = [niveis[0].id];
      }
    }

    // 2. Consulta diretamente 'public.unidades' como fonte única de verdade
    // Filtrando por igreja_id + nivel_tipo_id + ativo = true
    let unitsQuery = supabase
      .from('unidades')
      .select(`
        id,
        igreja_id,
        nome,
        pai_id,
        unidade_criadora_id,
        ativo,
        dia_semana,
        dia_reuniao,
        horario,
        horario_reuniao,
        endereco,
        bairro,
        cep,
        cidade,
        estado,
        latitude,
        longitude,
        foto_url,
        quantidade_membros
      `)
      .eq('ativo', true);

    if (churchId !== 'all' && churchId !== 'church-master') {
      unitsQuery = unitsQuery.eq('igreja_id', churchId);
    }

    if (cellLevelIds.length === 1) {
      unitsQuery = unitsQuery.eq('nivel_tipo_id', cellLevelIds[0]);
    } else if (cellLevelIds.length > 1) {
      unitsQuery = unitsQuery.in('nivel_tipo_id', cellLevelIds);
    }

    const { data: rawUnits, error: unitsError } = await unitsQuery;

    if (unitsError) {
      console.error('Erro ao consultar unidades no Supabase:', unitsError);
      return NextResponse.json({ error: unitsError.message }, { status: 500 });
    }

    if (!rawUnits || rawUnits.length === 0) {
      return NextResponse.json({
        celulas: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      });
    }

    const unitIds = rawUnits.map((u) => u.id);

    // 3. Resolução hierárquica em lote: busca pais (Setores) e avós (Áreas) em 'unidades'
    const parentIds = [...new Set(rawUnits.map((u: any) => u.pai_id).filter(Boolean))];
    const parentMap = new Map<string, { id: string; nome: string; pai_id?: string | null }>();

    if (parentIds.length > 0) {
      const { data: parentUnits } = await supabase
        .from('unidades')
        .select('id, nome, pai_id')
        .in('id', parentIds);

      (parentUnits || []).forEach((p: any) => parentMap.set(p.id, p));

      // Busca avós (Áreas) se os pais possuírem pai_id
      const grandParentIds = [
        ...new Set(
          (parentUnits || [])
            .map((p: any) => p.pai_id)
            .filter((id: string | null) => id && !parentMap.has(id))
        ),
      ];

      if (grandParentIds.length > 0) {
        const { data: grandParents } = await supabase
          .from('unidades')
          .select('id, nome, pai_id')
          .in('id', grandParentIds);

        (grandParents || []).forEach((gp: any) => parentMap.set(gp.id, gp));
      }
    }

    // 4. Busca líderes atribuídos em 'unidade_lideres' em lote (evitando N+1)
    const { data: leadersData } = await supabase
      .from('unidade_lideres')
      .select('unidade_id, pessoa_id, papel')
      .in('unidade_id', unitIds)
      .eq('ativo', true);

    const leaderPessoaIds = [...new Set((leadersData || []).map((l: any) => l.pessoa_id).filter(Boolean))];
    const leaderMemberMap = new Map<string, string>();

    if (leaderPessoaIds.length > 0) {
      const { data: leaderMembers } = await supabase
        .from('membros')
        .select('id, nome')
        .in('id', leaderPessoaIds);

      (leaderMembers || []).forEach((m: any) => leaderMemberMap.set(m.id, m.nome));
    }

    const leadersByUnit = new Map<string, string[]>();
    const leaderNamesByUnit = new Map<string, string[]>();

    (leadersData || []).forEach((l: any) => {
      if (l.unidade_id && l.pessoa_id) {
        const idList = leadersByUnit.get(l.unidade_id) || [];
        if (!idList.includes(l.pessoa_id)) idList.push(l.pessoa_id);
        leadersByUnit.set(l.unidade_id, idList);

        const memName = leaderMemberMap.get(l.pessoa_id);
        if (memName) {
          const names = leaderNamesByUnit.get(l.unidade_id) || [];
          if (!names.includes(memName)) names.push(memName);
          leaderNamesByUnit.set(l.unidade_id, names);
        }
      }
    });

    // 5. Monta a lista completa de células utilizando unicamente os campos de 'unidades'
    const allCelulas: CelulaCardItem[] = rawUnits.map((u: any) => {
      const parentUnit = u.pai_id ? parentMap.get(u.pai_id) : undefined;
      const sectorName = parentUnit?.nome || 'Setor Geral';
      const grandParentUnit = parentUnit?.pai_id ? parentMap.get(parentUnit.pai_id) : undefined;
      const areaName = grandParentUnit?.nome || undefined;

      const leaderNames = leaderNamesByUnit.get(u.id) || [];
      const leaderIds = leadersByUnit.get(u.id) || [];

      const realDiaSemana = u.dia_semana || u.dia_reuniao || '';
      const realHorario = u.horario || u.horario_reuniao || '';
      const realBairro = u.bairro || 'Bairro Central';
      const realEndereco = u.endereco || 'Endereço da Célula';
      const realFotoUrl = u.foto_url || undefined;

      // Quantidade de membros lida diretamente de unidades.quantidade_membros (trigger mantido)
      const finalMemberCount = typeof u.quantidade_membros === 'number'
        ? u.quantidade_membros
        : (Number(u.quantidade_membros) || 0);

      return {
        id: u.id,
        unidadeId: u.id,
        churchId: u.igreja_id,
        nome: u.nome,
        bairro: realBairro,
        endereco: realEndereco,
        diaSemana: realDiaSemana || 'Dia a definir',
        horario: realHorario || 'Horário a definir',
        fotoUrl: realFotoUrl,
        memberCount: finalMemberCount,
        quantidade_membros: finalMemberCount,
        leaderNames,
        leaderMemberIds: leaderIds,
        sectorName,
        areaName,
      };
    });

    // 6. Aplicação de filtros combinados: dia_semana e busca textual (case-insensitive & sem acento)
    const normalizeText = (t: string) =>
      t
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    let filtered = allCelulas;

    if (diaSemana && diaSemana !== 'todos' && diaSemana !== 'all') {
      const targetDia = normalizeText(diaSemana);
      filtered = filtered.filter((c) => normalizeText(c.diaSemana).includes(targetDia));
    }

    if (search) {
      const searchNorm = normalizeText(search);
      filtered = filtered.filter((c) => {
        const nomeNorm = normalizeText(c.nome);
        const bairroNorm = normalizeText(c.bairro);
        const diaNorm = normalizeText(c.diaSemana);
        const enderecoNorm = normalizeText(c.endereco);
        const leadersNorm = normalizeText(c.leaderNames.join(' '));
        const setorNorm = normalizeText(c.sectorName || '');

        return (
          nomeNorm.includes(searchNorm) ||
          bairroNorm.includes(searchNorm) ||
          diaNorm.includes(searchNorm) ||
          enderecoNorm.includes(searchNorm) ||
          leadersNorm.includes(searchNorm) ||
          setorNorm.includes(searchNorm)
        );
      });
    }

    // Ordenação alfabética por nome
    filtered.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

    const total = filtered.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedCelulas = filtered.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < total;

    return NextResponse.json({
      celulas: paginatedCelulas,
      total,
      page,
      pageSize,
      hasMore,
    });
  } catch (error: any) {
    console.error('Erro na API /api/celulas:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao consultar células.' },
      { status: 500 }
    );
  }
}
