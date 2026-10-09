import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAuthUserForMember } from '@/lib/supabase/authAdmin';
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

    if (input.pastorPassword !== undefined && input.pastorPassword.trim().length > 0 && input.pastorPassword.trim().length < 6) {
      return NextResponse.json(
        { error: 'A senha do Pastor deve ter no mínimo 6 dígitos.' },
        { status: 400 }
      );
    }

    const churchId = (input.churchId && input.churchId.trim()) || generateUUID();
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

    // Aceita WebP (preferencial) e o fallback JPEG que optimizeImageToWebP usa
    // quando o navegador do cliente não sabe codificar WebP via Canvas (comum em
    // iOS Safari mais antigo e alguns WebViews). Na prática o logo chega aqui
    // como URL do Storage (https), então este bloco é só uma rede de segurança.
    if (input.logoUrl && input.logoUrl.trim().startsWith('data:')) {
      if (!input.logoUrl.trim().startsWith('data:image/webp') && !input.logoUrl.trim().startsWith('data:image/jpeg')) {
        return NextResponse.json(
          { error: 'O logotipo da igreja deve estar em WebP ou JPEG otimizado.' },
          { status: 400 }
        );
      }
    }

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
      let existingSlugs: any[] | null = null;
      const ptChurch = await supabase
        .from('igrejas')
        .select('id, slug, nome')
        .or(`slug.eq.${baseSlug},slug.like.${baseSlug}-%`);

      if (!ptChurch.error) {
        existingSlugs = ptChurch.data;
      } else {
        const legacyChurch = await supabase
          .from('churches')
          .select('id, slug, nome')
          .or(`slug.eq.${baseSlug},slug.like.${baseSlug}-%`);
        existingSlugs = legacyChurch.data;
      }

      if (existingSlugs && existingSlugs.length > 0) {
        const takenSlugs = new Set(existingSlugs.map((s) => s.slug));
        if (takenSlugs.has(baseSlug)) {
          // Verifica se a congregação existente com esse slug é órfã (sem membros) fruto de teste anterior incompleto
          const orphanCandidate = existingSlugs.find((s) => s.slug === baseSlug);
          let isOrphan = false;
          if (orphanCandidate) {
            let mCount = 0;
            const ptCount = await supabase
              .from('membros')
              .select('*', { count: 'exact', head: true })
              .eq('igreja_id', orphanCandidate.id);
            if (!ptCount.error && ptCount.count !== null) {
              mCount = ptCount.count;
            } else {
              const legCount = await supabase
                .from('members')
                .select('*', { count: 'exact', head: true })
                .eq('igreja_id', orphanCandidate.id);
              mCount = legCount.count || 0;
            }
            if (mCount === 0) {
              isOrphan = true;
            }
          }

          if (isOrphan && orphanCandidate) {
            // Limpa registro órfão para reaproveitar o slug limpo
            try {
              await supabase.from('nivel_tipo').delete().eq('igreja_id', orphanCandidate.id);
              await supabase.from('igrejas').delete().eq('id', orphanCandidate.id);
            } catch {}
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

    // 1. Inserir Igreja em 'igrejas' (ou fallback 'churches')
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

    let churchTargetTable = 'igrejas';
    let churchRes = await supabase.from('igrejas').insert([churchPayload]);
    if (churchRes.error && (churchRes.error.code === '42P01' || churchRes.error.message?.includes('does not exist'))) {
      churchTargetTable = 'churches';
      churchRes = await supabase.from('churches').insert([churchPayload]);
    }
    let churchErr = churchRes.error;

    // Trata colisão de slug inesperada
    if (churchErr && (churchErr.message?.includes('slug_key') || churchErr.message?.includes('unique'))) {
      const randomSuffix = Math.random().toString(36).substring(2, 7);
      finalSlug = `${baseSlug}-${randomSuffix}`;
      churchPayload.slug = finalSlug;
      churchObj.slug = finalSlug;
      const retrySlugRes = await supabase.from(churchTargetTable).insert([churchPayload]);
      churchErr = retrySlugRes.error;
    }

    if (churchErr && (churchErr.message?.includes('cnpj') || churchErr.message?.includes('column'))) {
      delete churchPayload.cnpj;
      const retryRes = await supabase.from(churchTargetTable).insert([churchPayload]);
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

    // 3. Resolver ID do Papel de Pastor no Supabase
    let resolvedRoleId: string | null = 'b2000000-0000-0000-0000-000000000001';
    try {
      let matchedRoles: any[] | null = null;
      const ptRoles = await supabase
        .from('papeis')
        .select('id, nome, slug')
        .or('slug.eq.pastor,slug.eq.PASTOR,nome.ilike.%pastor%')
        .limit(1);

      if (!ptRoles.error && ptRoles.data && ptRoles.data.length > 0) {
        matchedRoles = ptRoles.data;
      } else {
        const legRoles = await supabase
          .from('roles')
          .select('id, nome, slug')
          .or('slug.eq.pastor,slug.eq.PASTOR,nome.ilike.%pastor%')
          .limit(1);
        matchedRoles = legRoles.data;
      }

      if (matchedRoles && matchedRoles.length > 0) {
        resolvedRoleId = matchedRoles[0].id;
      } else {
        const defaultPastorRole = {
          id: 'b2000000-0000-0000-0000-000000000001',
          nome: 'Pastor',
          slug: 'pastor',
          descricao: 'Liderança pastoral e supervisão geral',
          nivel_hierarquia: 10,
          cor_distintivo: '#0284c7',
        };
        const ptRoleIns = await supabase.from('papeis').insert([defaultPastorRole]);
        if (!ptRoleIns.error) {
          resolvedRoleId = defaultPastorRole.id;
        } else {
          const { error: seedRoleErr } = await supabase.from('roles').insert([defaultPastorRole]);
          if (!seedRoleErr) {
            resolvedRoleId = defaultPastorRole.id;
          } else {
            const { data: anyRole } = await supabase.from('papeis').select('id').limit(1);
            if (anyRole && anyRole.length > 0) {
              resolvedRoleId = anyRole[0].id;
            }
          }
        }
      }
    } catch (roleErr) {
      console.warn('Aviso ao resolver role do pastor:', roleErr);
    }

    pastorProfile.roleId = resolvedRoleId || 'b2000000-0000-0000-0000-000000000001';

    // Cria o usuário correspondente no Supabase auth.users com confirmação ativa
    let pastorAuthUserId: string | null = null;
    try {
      pastorAuthUserId = await createAuthUserForMember({
        churchId,
        memberId: pastorId,
        name: input.pastorName.trim(),
        login: cleanPastorLogin,
        password: cleanPastorPass,
        email: input.pastorEmail?.trim() || null,
        role: 'Pastor',
      });
    } catch (authErr) {
      console.warn('Aviso ao criar auth.users para pastor:', authErr);
    }

    // 4. Cadastrar Pastor Titular na tabela 'membros' (ou fallback 'members')
    const pastorMemberPt: any = {
      id: pastorId,
      igreja_id: churchId,
      unidade_id: null,
      papel_id: resolvedRoleId,
      funcao: 'Pastor',
      nome: input.pastorName.trim(),
      login: cleanPastorLogin,
      senha_hash: cleanPastorPass,
      auth_user_id: pastorAuthUserId,
      telefone: input.pastorPhone?.trim() || null,
      email: input.pastorEmail?.trim() || null,
      bairro: 'Centro',
      aniversario: '01/01',
      status_frequencia: 'green',
      percentual_frequencia: 100,
      url_avatar: pastorProfile.avatarUrl,
      observacoes: 'Pastor Titular cadastrado no registro da igreja (pendente de vinculação à 1ª célula)',
    };

    let pastorIns = await supabase.from('membros').insert([pastorMemberPt]);
    if (pastorIns.error && (pastorIns.error.code === '42P01' || pastorIns.error.message?.includes('does not exist') || pastorIns.error.message?.includes('papel_id') || pastorIns.error.message?.includes('unidade_id'))) {
      const pastorMemberLeg: any = {
        ...pastorMemberPt,
        celula_id: null,
        funcao_id: resolvedRoleId,
      };
      delete pastorMemberLeg.unidade_id;
      delete pastorMemberLeg.papel_id;
      pastorIns = await supabase.from('members').insert([pastorMemberLeg]);
    }
    let pastorErr = pastorIns.error;
    let seedCellCreated: CellGroup | undefined = undefined;

    // Se violou FK em funcao/papel_id, tenta auto-recuperação buscando a role real do banco
    if (pastorErr && (pastorErr.message?.includes('papel_id') || pastorErr.message?.includes('funcao_id'))) {
      console.warn('Auto-recuperação: erro de FK em papel/funcao_id. Buscando roles válidas no banco...');
      try {
        let validRoles: any[] | null = null;
        const ptRoles = await supabase.from('papeis').select('id, nome, slug');
        if (!ptRoles.error && ptRoles.data) {
          validRoles = ptRoles.data;
        } else {
          const legRoles = await supabase.from('roles').select('id, nome, slug');
          validRoles = legRoles.data;
        }

        if (validRoles && validRoles.length > 0) {
          const matched =
            validRoles.find(
              (r: any) =>
                r.slug?.toLowerCase().includes('pastor') ||
                r.nome?.toLowerCase().includes('pastor')
            ) || validRoles[0];
          pastorMemberPt.papel_id = matched.id;
          pastorProfile.roleId = matched.id;
          const retryRes = await supabase.from('membros').insert([pastorMemberPt]);
          pastorErr = retryRes.error;
        }
      } catch (fkRecoveryErr) {
        console.warn('Falha na recuperação de FK de papel_id:', fkRecoveryErr);
      }
    }

    // Se o banco ainda mantiver a restrição NOT NULL em 'celula_id', realiza auto-recuperação resiliente
    if (pastorErr && pastorErr.message?.includes('not-null') && pastorErr.message?.includes('celula_id')) {
      console.warn('Auto-recuperação: celula_id possui NOT NULL no banco. Criando célula inicial de transição...');
      try {
        const seedUnitId = generateUUID();

        // 1. Cria a unidade hierárquica correspondente na tabela unidades
        const { data: tipoNivel } = await supabase
          .from('nivel_tipo')
          .select('id')
          .eq('igreja_id', churchId)
          .ilike('nome', 'Célula')
          .maybeSingle();

        await supabase.from('unidades').insert([
          {
            id: seedUnitId,
            igreja_id: churchId,
            nivel_tipo_id: tipoNivel?.id || null,
            nome: 'Célula Betel',
            bairro: 'Centro',
            endereco: `${input.city.trim()} - Centro`,
            dia_semana: 'Quarta-feira',
            dia_reuniao: 'Quarta-feira',
            horario: '19:30',
            horario_reuniao: '19:30',
            quantidade_membros: 1,
            ativo: true,
          },
        ]);

        // 2. Atribui a unidade_id ao pastor e tenta novamente
        pastorMemberPt.unidade_id = seedUnitId;
        pastorProfile.currentCellId = seedUnitId;
        const retryPastor = await supabase.from('membros').insert([pastorMemberPt]);
        if (retryPastor.error) {
          const legPayload: any = { ...pastorMemberPt, celula_id: seedUnitId, funcao_id: resolvedRoleId };
          delete legPayload.unidade_id;
          delete legPayload.papel_id;
          const retryLeg = await supabase.from('members').insert([legPayload]);
          pastorErr = retryLeg.error;
        } else {
          pastorErr = null;
        }

        if (!pastorErr) {
          seedCellCreated = {
            id: seedUnitId,
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
      await supabase.from('igrejas').delete().eq('id', churchId);
      await supabase.from('churches').delete().eq('id', churchId);

      return NextResponse.json(
        { error: `Falha ao cadastrar pastor titular na tabela de membros: ${pastorErr.message}` },
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
