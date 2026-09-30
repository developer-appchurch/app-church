import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { CelulaCardItem } from '@/types';

/**
 * Cache em memória no servidor Next.js por congregação (TTL 5 minutos).
 * Evita execuções redundantes de consultas ao Supabase, economizando custos de Log Query
 * e reduzindo a latência de ~1.2s para < 2ms.
 */
interface CelulasCacheEntry {
  timestamp: number;
  celulas: CelulaCardItem[];
}
const serverCelulasCache = new Map<string, CelulasCacheEntry>();
const SERVER_CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateServerCelulasCache(churchId?: string) {
  if (churchId) {
    serverCelulasCache.delete(churchId);
  } else {
    serverCelulasCache.clear();
  }
}

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
    const forceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('force') === 'true';

    if (!churchId) {
      return NextResponse.json(
        { error: 'Parâmetro obrigatório: churchId' },
        { status: 400 }
      );
    }

    let allCelulas: CelulaCardItem[] = [];
    const cached = serverCelulasCache.get(churchId);

    // 1. Verifica cache em memória no servidor para economizar Log Queries no banco
    if (!forceRefresh && cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL_MS) {
      allCelulas = cached.celulas;
    } else {
      // 2. Identifica o(s) ID(s) do nível hierárquico 'Célula' em 'nivel_tipo' para a congregação
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
          cellLevelIds = [niveis[0].id];
        }
      }

      // 3. Consulta 'public.unidades' filtrando por igreja_id + nivel_tipo_id + ativo = true
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
        serverCelulasCache.set(churchId, { timestamp: Date.now(), celulas: [] });
        return NextResponse.json({
          celulas: [],
          total: 0,
          page,
          pageSize,
          hasMore: false,
        });
      }

      const unitIds = rawUnits.map((u) => u.id);
      const parentIds = [...new Set(rawUnits.map((u: any) => u.pai_id).filter(Boolean))];
      const parentMap = new Map<string, { id: string; nome: string; pai_id?: string | null }>();

      // 4. Executa em paralelo a busca de pais (Setores) e líderes de unidade (Promise.all)
      const [parentUnitsRes, leadersRes] = await Promise.all([
        parentIds.length > 0
          ? supabase.from('unidades').select('id, nome, pai_id').in('id', parentIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from('unidade_lideres')
          .select('unidade_id, pessoa_id, papel')
          .in('unidade_id', unitIds)
          .eq('ativo', true),
      ]);

      const parentUnits = parentUnitsRes?.data || [];
      const leadersData = leadersRes?.data || [];

      parentUnits.forEach((p: any) => parentMap.set(p.id, p));

      // Busca avós (Áreas) e membros líderes em paralelo (Promise.all)
      const grandParentIds = [
        ...new Set(
          parentUnits
            .map((p: any) => p.pai_id)
            .filter((id: string | null) => id && !parentMap.has(id))
        ),
      ];

      const leaderPessoaIds = [...new Set(leadersData.map((l: any) => l.pessoa_id).filter(Boolean))];
      const leaderMemberMap = new Map<string, string>();

      const [grandParentsRes, leaderMembersRes] = await Promise.all([
        grandParentIds.length > 0
          ? supabase.from('unidades').select('id, nome, pai_id').in('id', grandParentIds)
          : Promise.resolve({ data: [] }),
        leaderPessoaIds.length > 0
          ? supabase.from('membros').select('id, nome').in('id', leaderPessoaIds)
          : Promise.resolve({ data: [] }),
      ]);

      (grandParentsRes?.data || []).forEach((gp: any) => parentMap.set(gp.id, gp));
      (leaderMembersRes?.data || []).forEach((m: any) => leaderMemberMap.set(m.id, m.nome));

      const leadersByUnit = new Map<string, string[]>();
      const leaderNamesByUnit = new Map<string, string[]>();

      leadersData.forEach((l: any) => {
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

      // 5. Monta a lista completa de células
      allCelulas = rawUnits.map((u: any) => {
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

      // Salva no cache do servidor
      serverCelulasCache.set(churchId, {
        timestamp: Date.now(),
        celulas: allCelulas,
      });
    }

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
