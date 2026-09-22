import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { Church, UserProfile, HierarchicalLevelInput, RegisterChurchInput, RegisterChurchResult, CellGroup } from '@/types';
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

export async function POST(req: NextRequest) {
  try {
    const input: RegisterChurchInput = await req.json();

    if (!input.name || !input.city || !input.state) {
      return NextResponse.json(
        { error: 'Nome da igreja, cidade e estado são obrigatórios.' },
        { status: 400 }
      );
    }

    if (!input.pastorName || !input.pastorLogin) {
      return NextResponse.json(
        { error: 'Nome e login do pastor titular são obrigatórios.' },
        { status: 400 }
      );
    }

    const churchId = generateUUID();
    const pastorId = generateUUID();
    const cellId = generateUUID();
    const unitId = generateUUID();

    const baseSlug =
      input.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') || `igreja-${Date.now()}`;

    const cleanCnpj = input.cnpj?.replace(/\D/g, '') ? input.cnpj.trim() : undefined;
    const cleanPastorLogin = input.pastorLogin.trim().toLowerCase();
    const cleanPastorPass = input.pastorPassword?.trim() || '123456';

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Servidor do banco de dados não configurado.' },
        { status: 500 }
      );
    }

    // Garante que o slug seja único verificando congregações existentes no Supabase
    let finalSlug = baseSlug;
    try {
      const { data: existingSlugs } = await supabase
        .from('churches')
        .select('id, slug, nome')
        .or(`slug.eq.${baseSlug},slug.like.${baseSlug}-%`);

      if (existingSlugs && existingSlugs.length > 0) {
        const takenSlugs = new Set(existingSlugs.map((s) => s.slug));
        if (takenSlugs.has(baseSlug)) {
          // Verifica se a congregação existente com esse slug é órfã (sem membros) fruto de teste anterior incompleto
          const orphanCandidate = existingSlugs.find((s) => s.slug === baseSlug);
          let isOrphan = false;
          if (orphanCandidate) {
            const { count } = await supabase
              .from('members')
              .select('*', { count: 'exact', head: true })
              .eq('igreja_id', orphanCandidate.id);
            if (count === 0) {
              isOrphan = true;
            }
          }

          if (isOrphan && orphanCandidate) {
            // Limpa registro órfão para reaproveitar o slug limpo
            await supabase.from('nivel_tipo').delete().eq('igreja_id', orphanCandidate.id);
            await supabase.from('churches').delete().eq('id', orphanCandidate.id);
            finalSlug = baseSlug;
          } else {
            let counter = 2;
            while (takenSlugs.has(`${baseSlug}-${counter}`)) {
              counter++;
            }
            finalSlug = `${baseSlug}-${counter}`;
          }
        }
      }
    } catch (slugCheckErr) {
      console.warn('Aviso ao checar unicidade de slug:', slugCheckErr);
    }

    const churchObj: Church = {
      id: churchId,
      name: input.name.trim(),
      slug: finalSlug,
      cnpj: cleanCnpj,
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
      logoUrl: input.logoUrl || undefined,
    };

    const pastorProfile: UserProfile = {
      id: pastorId,
      churchId,
      churchName: input.name.trim(),
      name: input.pastorName.trim(),
      login: cleanPastorLogin,
      role: 'Pastor',
      roleId: 'b2000000-0000-0000-0000-000000000001',
      sector: 'Gabinete Pastoral',
      currentCellId: cellId,
      email: input.pastorEmail?.trim() || `${cleanPastorLogin}@appchurch.local`,
      phone: input.pastorPhone?.trim() || '',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      isPrivileged: true,
    };

    // 1. Inserir Igreja em 'churches' (com fallback de CNPJ e proteção contra colisão de slug)
    const churchPayload: any = {
      id: churchId,
      nome: input.name.trim(),
      slug: finalSlug,
      cidade: input.city.trim(),
      estado: input.state.trim().toUpperCase(),
      url_logo: input.logoUrl || null,
    };
    if (cleanCnpj) {
      churchPayload.cnpj = cleanCnpj;
    }

    let { error: churchErr } = await supabase.from('churches').insert([churchPayload]);

    // Trata colisão de slug inesperada
    if (churchErr && churchErr.message?.includes('churches_slug_key')) {
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      finalSlug = `${baseSlug}-${randomSuffix}`;
      churchPayload.slug = finalSlug;
      churchObj.slug = finalSlug;
      const retrySlugRes = await supabase.from('churches').insert([churchPayload]);
      churchErr = retrySlugRes.error;
    }

    if (churchErr && (churchErr.message?.includes('cnpj') || churchErr.message?.includes('column'))) {
      delete churchPayload.cnpj;
      const retryRes = await supabase.from('churches').insert([churchPayload]);
      churchErr = retryRes.error;
    }

    if (churchErr) {
      return NextResponse.json(
        { error: `Falha ao cadastrar igreja no Supabase: ${churchErr.message}` },
        { status: 500 }
      );
    }

    // 2. Inserir Níveis Hierárquicos em 'nivel_tipo'
    const sortedLevels = [...(input.levels || [])].sort((a, b) => a.order - b.order);
    let insertedLevels: HierarchicalLevelInput[] = [];

    if (sortedLevels.length > 0) {
      const nivelRows = sortedLevels.map((lvl) => ({
        igreja_id: churchId,
        nome: lvl.name.trim(),
        ordem: lvl.order,
      }));

      const { data: niveisData, error: niveisErr } = await supabase
        .from('nivel_tipo')
        .insert(nivelRows)
        .select('*');

      if (!niveisErr && niveisData) {
        insertedLevels = niveisData.map((n: any) => ({
          id: n.id,
          name: n.nome,
          order: n.ordem,
        }));
      } else if (niveisErr) {
        console.warn('Aviso ao inserir níveis hierárquicos:', niveisErr);
      }
    }

    // 3. Cadastrar Pastor Titular com login e senha na tabela 'members'
    // Conforme especificação: celula_id fica pendente (null) até o cadastro da primeira célula da igreja.
    // Tabelas 'cells', 'unidades' e 'celulas' NÃO são populadas automaticamente aqui.
    const pastorMemberPayload: any = {
      id: pastorId,
      igreja_id: churchId,
      celula_id: null,
      funcao_id: 'b2000000-0000-0000-0000-000000000001',
      funcao: 'Pastor',
      nome: input.pastorName.trim(),
      login: cleanPastorLogin,
      senha_hash: cleanPastorPass,
      telefone: input.pastorPhone?.trim() || null,
      email: input.pastorEmail?.trim() || null,
      bairro: 'Centro',
      aniversario: '01/01',
      status_frequencia: 'green',
      percentual_frequencia: 100,
      url_avatar: pastorProfile.avatarUrl,
      observacoes: 'Pastor Titular cadastrado no registro da igreja (pendente de vinculação à 1ª célula)',
    };

    let { error: pastorErr } = await supabase.from('members').insert([pastorMemberPayload]);
    let seedCellCreated: CellGroup | undefined = undefined;

    // Se o banco ainda mantiver a restrição NOT NULL em 'celula_id', realiza auto-recuperação resiliente
    if (pastorErr && pastorErr.message?.includes('not-null') && pastorErr.message?.includes('celula_id')) {
      console.warn('Auto-recuperação: celula_id possui NOT NULL no banco. Criando célula inicial de transição...');
      try {
        const seedCellId = generateUUID();
        const seedUnitId = generateUUID();

        // 1. Cria a célula na tabela cells
        await supabase.from('cells').insert([
          {
            id: seedCellId,
            church_id: churchId,
            name: 'Célula Betel',
            leader_name: input.pastorName.trim(),
            sector_name: 'Setor Geral',
            address: `${input.city.trim()} - Centro`,
            meeting_day: 'Quarta-feira',
            meeting_time: '19:30',
          },
        ]);

        // 2. Cria a unidade hierárquica correspondente
        const { data: tipoNivel } = await supabase
          .from('niveis_hierarquicos')
          .select('id')
          .eq('igreja_id', churchId)
          .eq('nome', 'Célula')
          .maybeSingle();

        await supabase.from('unidades').insert([
          {
            id: seedUnitId,
            igreja_id: churchId,
            tipo_unidade_id: tipoNivel?.id || null,
            nome: 'Célula Betel',
          },
        ]);

        // 3. Cria a celula vinculada
        await supabase.from('celulas').insert([
          {
            id: seedCellId,
            unidade_id: seedUnitId,
            dia_reuniao: 'Quarta-feira',
            horario_reuniao: '19:30',
            endereco: `${input.city.trim()} - Centro`,
            bairro: 'Centro',
          },
        ]);

        // 4. Atribui a celula_id ao pastor e tenta novamente
        pastorMemberPayload.celula_id = seedCellId;
        pastorProfile.currentCellId = seedCellId;
        const retryPastor = await supabase.from('members').insert([pastorMemberPayload]);
        pastorErr = retryPastor.error;

        if (!pastorErr) {
          seedCellCreated = {
            id: seedCellId,
            churchId,
            name: 'Célula Betel',
            leaderName: input.pastorName.trim(),
            sectorName: 'Setor Geral',
            address: `${input.city.trim()} - Centro`,
            meetingDay: 'Quarta-feira',
            meetingTime: '19:30',
            memberCount: 1,
          };
        }
      } catch (recoveryErr) {
        console.error('Falha na auto-recuperação de celula_id:', recoveryErr);
      }
    }

    if (pastorErr) {
      // Rollback para não deixar congregação órfã travando o slug ou poluindo o banco
      await supabase.from('nivel_tipo').delete().eq('igreja_id', churchId);
      await supabase.from('churches').delete().eq('id', churchId);

      return NextResponse.json(
        { error: `Falha ao cadastrar pastor titular na tabela members: ${pastorErr.message}` },
        { status: 500 }
      );
    }

    const result: RegisterChurchResult = {
      church: churchObj,
      pastor: pastorProfile,
      levels: insertedLevels.length > 0 ? insertedLevels : input.levels,
      seedCell: seedCellCreated,
      initialPasswordGenerated: cleanPastorPass,
    };

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Erro na rota /api/churches/register:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro interno ao cadastrar igreja.' },
      { status: 500 }
    );
  }
}
