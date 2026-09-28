import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { CelulaCardItem } from '@/types';

/**
 * Rota de listagem de Células da Igreja com busca multi-campo, paginação e isolamento estrito por igreja
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

    // 1. Busca todas as unidades ativas da igreja
    let unitsQuery = supabase
      .from('unidades')
      .select('id, igreja_id, nome, pai_id, ativo, dia_semana, dia_reuniao, horario, horario_reuniao, endereco, bairro, foto_url, quantidade_membros')
      .eq('ativo', true);

    if (churchId !== 'all' && churchId !== 'church-master') {
      unitsQuery = unitsQuery.eq('igreja_id', churchId);
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

    // 2. Opcional: Busca detalhes complementares em 'celulas' (para fallback durante migração suave)
    // Tabela celulas contém estritamente: unidade_id, bairro, endereco, dia_semana, horario, quantidade_membros
    const celulaDetailMap = new Map<string, any>();
    try {
      const { data: celulasRows } = await supabase
        .from('celulas')
        .select('unidade_id, bairro, endereco, dia_semana, horario, quantidade_membros')
        .in('unidade_id', unitIds);

      (celulasRows || []).forEach((c: any) => {
        celulaDetailMap.set(c.unidade_id, c);
      });
    } catch {
      // Tabela 'celulas' é opcional; dados primários estão em 'unidades'
    }

    // 3. Mapeia unidades pai (setores / áreas)
    const parentNameMap = new Map<string, string>();
    const parentIdMap = new Map<string, string>();
    rawUnits.forEach((u: any) => {
      parentNameMap.set(u.id, u.nome);
      if (u.pai_id) parentIdMap.set(u.id, u.pai_id);
    });

    // 4. Busca líderes atribuídos em unidade_lideres
    const { data: leadersData } = await supabase
      .from('unidade_lideres')
      .select('unidade_id, pessoa_id, papel')
      .in('unidade_id', unitIds)
      .eq('ativo', true);

    const leaderPessoaIds = (leadersData || []).map((l: any) => l.pessoa_id);
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

    // 5. Identifica unidades que são de fato células (possuem entrada em celulas ou não são nós pais)
    const parentIdsSet = new Set(rawUnits.map((u: any) => u.pai_id).filter(Boolean));
    let cellUnits = rawUnits.filter((u: any) => celulaDetailMap.has(u.id) || !parentIdsSet.has(u.id));
    if (cellUnits.length === 0) cellUnits = rawUnits;

    // 6. Monta a lista completa de células com quantidade_membros diretamente da coluna pré-calculada
    const allCelulas: CelulaCardItem[] = cellUnits.map((u: any) => {
      const detail = celulaDetailMap.get(u.id);
      const parentName = u.pai_id ? parentNameMap.get(u.pai_id) : 'Setor Geral';
      const grandparentId = u.pai_id ? parentIdMap.get(u.pai_id) : null;
      const areaName = grandparentId ? parentNameMap.get(grandparentId) : undefined;
      const leaderNames = leaderNamesByUnit.get(u.id) || [];
      const leaderIds = leadersByUnit.get(u.id) || [];

      // Mapeia prioritariamente as colunas de 'unidades' e fallback suave para 'celulas'
      const realDiaSemana =
        u?.dia_semana ||
        u?.dia_reuniao ||
        detail?.dia_semana ||
        detail?.dia_reuniao ||
        '';

      const realHorario =
        u?.horario ||
        u?.horario_reuniao ||
        detail?.horario ||
        detail?.horario_reuniao ||
        '';

      const realBairro = u?.bairro || detail?.bairro || 'Bairro Central';
      const realEndereco = u?.endereco || detail?.endereco || 'Endereço da Célula';
      const realFotoUrl = u?.foto_url || detail?.foto_url || undefined;
      
      // Quantidade de membros lida diretamente da coluna pré-calculada de unidades
      const finalMemberCount = typeof u?.quantidade_membros === 'number' 
        ? u.quantidade_membros 
        : (detail?.quantidade_membros ?? 0);

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
        sectorName: parentName,
        areaName,
      };
    });

    // 7. Aplicação de filtros combinados: nome, bairro e dia_semana (case-insensitive & sem acento)
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
