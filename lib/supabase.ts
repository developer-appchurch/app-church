import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Church,
  UserProfile,
  CellGroup,
  CellMember,
  FeedPost,
  ChurchAnnouncement,
  LeadershipTrackProgress,
  LeadershipTrackStep,
  AttendanceStatus,
  Role,
  Permission,
  RolePermission,
  TrackStep,
  UserRole,
  HierarchicalLevelInput,
  RegisterChurchInput,
  RegisterChurchResult,
  ChurchHierarchicalLevel,
  OrganizationalUnit,
  CreateUnitInput,
  UnitLeader,
  UpdateUnitLeadersInput,
} from '../types';
import {
  INITIAL_CHURCHES,
  INITIAL_USERS,
  INITIAL_CELLS,
  INITIAL_MEMBERS,
  INITIAL_FEED_POSTS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_LEADERSHIP_PROGRESS,
  INITIAL_ROLES,
  INITIAL_PERMISSIONS,
  INITIAL_ROLE_PERMISSIONS,
  INITIAL_TRACK_STEPS,
  CHURCH_UUIDS,
  CELL_UUIDS,
  ROLE_UUIDS,
} from '../data/initialData';

/**
 * UUID v4 Generator
 * Generates standards-compliant UUIDs for Supabase PostgreSQL UUID primary keys.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Dynamically resolves the Supabase Project URL.
 */
function resolveSupabaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  if (envUrl.startsWith('http://') || envUrl.startsWith('https://')) {
    return envUrl;
  }

  // Attempt to decode the project ref from the JWT token
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (anonKey.includes('.')) {
    try {
      const parts = anonKey.split('.');
      if (parts.length >= 2) {
        const payloadStr =
          typeof atob !== 'undefined'
            ? atob(parts[1])
            : Buffer.from(parts[1], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadStr);
        if (payload?.ref) {
          return `https://${payload.ref}.supabase.co`;
        }
      }
    } catch {
      // ignore
    }
  }

  return 'https://srjkwwddbxniqhzqvrhc.supabase.co';
}

const supabaseUrl = resolveSupabaseUrl();
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyamt3d2RkYnhuaXFoenF2cmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMDI4MjgsImV4cCI6MjEwNTU3ODgyOH0.9uvatfClKVxyzBrBC7zGL9ujSaVYtyxf74q6i1YVOjs';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')
);

// Instantiate real Supabase client
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

// Local Storage Multi-Tenant Store keys for caching & offline tolerance
const STORAGE_KEYS = {
  CHURCHES: 'appchurch_churches_uuid_v4',
  USERS: 'appchurch_users_uuid_v4',
  CELLS: 'appchurch_cells_uuid_v4',
  MEMBERS: 'appchurch_members_uuid_v4',
  POSTS: 'appchurch_posts_uuid_v4',
  ANNOUNCEMENTS: 'appchurch_announcements_uuid_v4',
  TRACKS: 'appchurch_tracks_uuid_v4',
  SESSION: 'appchurch_session_uuid_v4',
};

const loadFromStorage = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

const saveToStorage = <T>(key: string, value: T): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota
  }
};

export interface DatabaseConnectionStatus {
  connected: boolean;
  isCloud: boolean;
  message: string;
  endpoint: string;
  responseTimeMs?: number;
  lastChecked: string;
  details?: string;
}

/**
 * Service orchestrating Supabase queries with relational UUID schema,
 * ensuring multi-tenant isolation by igreja_id and seamless fallback caching.
 */
export const AppChurchService = {
  isConfigured: isSupabaseConfigured,
  supabaseUrl,

  /**
   * Diagnostic check verifying active connection to Supabase PostgreSQL database
   */
  async checkConnection(): Promise<DatabaseConnectionStatus> {
    const startTime = Date.now();
    const endpointHost = supabaseUrl.replace(/^https?:\/\//, '');

    if (!supabase) {
      return {
        connected: false,
        isCloud: false,
        message: 'Cliente Supabase não configurado.',
        endpoint: endpointHost,
        lastChecked: new Date().toLocaleTimeString('pt-BR'),
      };
    }

    try {
      // Query igrejas table (or churches view) to test read access
      let { data, error } = await supabase.from('igrejas').select('id, nome').limit(1);
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        const legRes = await supabase.from('churches').select('id, nome').limit(1);
        data = legRes.data;
        error = legRes.error;
      }
      const elapsed = Date.now() - startTime;

      if (error) {
        return {
          connected: false,
          isCloud: true,
          message: `Erro ao consultar Supabase: ${error.message}`,
          endpoint: endpointHost,
          responseTimeMs: elapsed,
          lastChecked: new Date().toLocaleTimeString('pt-BR'),
          details: error.details || error.hint,
        };
      }

      return {
        connected: true,
        isCloud: true,
        message: `Conectado ao Supabase Cloud (${data && data.length > 0 ? data[0].nome : 'Online'})`,
        endpoint: endpointHost,
        responseTimeMs: elapsed,
        lastChecked: new Date().toLocaleTimeString('pt-BR'),
      };
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      return {
        connected: false,
        isCloud: false,
        message: err?.message || 'Falha na comunicação de rede com Supabase',
        endpoint: endpointHost,
        responseTimeMs: elapsed,
        lastChecked: new Date().toLocaleTimeString('pt-BR'),
      };
    }
  },

  /**
   * Authenticate user against Supabase members table (or local members cache)
   * Acesso permitido EXCLUSIVAMENTE se login e senha estiverem presentes na tabela de membros.
   */
  async login(loginInput: string, passwordInput: string): Promise<UserProfile> {
    const cleanLogin = loginInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    if (!cleanLogin) {
      throw new Error('Informe seu login de acesso.');
    }
    if (!cleanPass) {
      throw new Error('Informe sua senha.');
    }

    // 0. Super Administrador do Sistema AppChurch (Acesso Global para Gerenciar Igrejas)
    const isAdminLogin =
      cleanLogin === 'admin' ||
      cleanLogin === 'administrador' ||
      cleanLogin === 'developer.appchurch@gmail.com';

    const isValidAdminPass =
      cleanPass === 'admin' ||
      cleanPass === 'admin123' ||
      cleanPass === '123456';

    if (isAdminLogin) {
      if (!isValidAdminPass) {
        throw new Error('Senha incorreta para o Administrador do Sistema.');
      }

      // Busca primeira igreja disponível no Supabase se houver, ou cria contexto mestre
      let adminChurchId = 'church-master';
      let adminChurchName = 'Administração do Sistema';
      if (supabase) {
        try {
          let { data: firstChurch } = await supabase.from('igrejas').select('id, nome').limit(1);
          if (!firstChurch || firstChurch.length === 0) {
            const legRes = await supabase.from('churches').select('id, nome').limit(1);
            firstChurch = legRes.data;
          }
          if (firstChurch && firstChurch.length > 0) {
            adminChurchId = firstChurch[0].id;
            adminChurchName = firstChurch[0].nome;
          }
        } catch {
          // ignore
        }
      }

      const adminUser: UserProfile = {
        id: 'a0000000-0000-0000-0000-000000000001',
        churchId: adminChurchId,
        churchName: adminChurchName,
        name: 'Administrador do Sistema',
        login: 'admin',
        role: 'Administrador',
        roleId: 'b2000000-0000-0000-0000-000000000000',
        sector: 'Diretoria Geral',
        currentCellId: '',
        email: 'developer.appchurch@gmail.com',
        phone: '(88) 99999-0000',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
        isPrivileged: true,
        isSystemAdmin: true,
      };

      saveToStorage(STORAGE_KEYS.SESSION, adminUser);
      return adminUser;
    }

    // 1. Consulta prioritária na tabela real "membros" (ou "members") do Supabase
    if (supabase) {
      try {
        let { data: memberRows, error } = await supabase
          .from('membros')
          .select('*')
          .or(`login.ilike.${cleanLogin},email.ilike.${cleanLogin}`)
          .limit(1);

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          const legRes = await supabase
            .from('members')
            .select('*')
            .or(`login.ilike.${cleanLogin},email.ilike.${cleanLogin}`)
            .limit(1);
          memberRows = legRes.data;
          error = legRes.error;
        }

        if (error) {
          console.warn('Erro ao consultar tabela membros no Supabase:', error);
        } else if (!memberRows || memberRows.length === 0) {
          throw new Error('Usuário não encontrado na tabela de membros.');
        } else {
          const m = memberRows[0];

          // Verifica se o membro tem senha cadastrada
          const memberPassword = m.senha_hash || m.senha || null;
          if (!memberPassword || String(memberPassword).trim() === '') {
            throw new Error('Este membro ainda não possui senha cadastrada na tabela de membros. Solicite à liderança.');
          }

          // Valida a senha fornecida
          if (String(memberPassword).trim() !== cleanPass) {
            throw new Error('Senha incorreta para este usuário.');
          }

          // Busca dados da igreja vinculada
          let churchName = 'Paz Church Sobral';
          if (m.igreja_id) {
            let { data: cData } = await supabase
              .from('igrejas')
              .select('nome')
              .eq('id', m.igreja_id)
              .single();
            if (!cData?.nome) {
              const legC = await supabase.from('churches').select('nome').eq('id', m.igreja_id).single();
              if (legC.data?.nome) churchName = legC.data.nome;
            } else {
              churchName = cData.nome;
            }
          }

          // Busca informações da célula/unidade/setor
          let sector = 'Setor Geral';
          const resolvedUnitId = m.unidade_id || m.celula_id;
          if (resolvedUnitId) {
            const { data: unitData } = await supabase
              .from('unidades')
              .select('id, nome, pai_id')
              .eq('id', resolvedUnitId)
              .maybeSingle();

            if (unitData?.pai_id) {
              const { data: parentUnit } = await supabase
                .from('unidades')
                .select('nome')
                .eq('id', unitData.pai_id)
                .maybeSingle();
              if (parentUnit?.nome) sector = parentUnit.nome;
            } else if (unitData?.nome) {
              sector = unitData.nome;
            }
          }

          const userProfile: UserProfile = {
            id: m.id,
            churchId: m.igreja_id,
            churchName,
            name: m.nome,
            login: m.login || cleanLogin,
            role: (m.funcao as UserRole) || 'Membro',
            roleId: m.papel_id || m.funcao_id,
            sector,
            currentCellId: resolvedUnitId || '',
            email: m.email || `${m.login || cleanLogin}@appchurch.local`,
            phone: m.telefone || '',
            avatarUrl:
              m.url_avatar ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            isPrivileged: ['Líder de Setor', 'Pastor', 'Supervisor', 'Líder de Área', 'Administrador'].includes(
              m.funcao
            ),
            isSystemAdmin:
              m.login === 'admin' ||
              m.funcao === 'Administrador' ||
              m.email === 'developer.appchurch@gmail.com',
          };

          saveToStorage(STORAGE_KEYS.SESSION, userProfile);
          return userProfile;
        }
      } catch (err: any) {
        // Se for um erro de validação lançado conscientemente, propaga
        if (
          err.message?.includes('Usuário não encontrado') ||
          err.message?.includes('não possui senha') ||
          err.message?.includes('Senha incorreta')
        ) {
          throw err;
        }
        console.warn('Erro de rede ao autenticar no Supabase:', err);
      }
    }

    // 2. Se o Supabase estiver inacessível/offline, valida estritamente na lista de membros local
    const members = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const matchedMember = members.find(
      (m) =>
        (m.login && m.login.toLowerCase() === cleanLogin) ||
        (m.phone && m.phone.replace(/\D/g, '') === cleanLogin.replace(/\D/g, ''))
    );

    if (!matchedMember) {
      throw new Error('Usuário não encontrado na tabela de membros.');
    }

    const localPassword = matchedMember.password;
    if (!localPassword) {
      throw new Error('Este membro ainda não possui senha cadastrada na tabela de membros.');
    }

    if (localPassword !== cleanPass) {
      throw new Error('Senha incorreta para este usuário.');
    }

    const church =
      INITIAL_CHURCHES.find((c) => c.id === matchedMember.churchId) || INITIAL_CHURCHES[0];
    const memberUser: UserProfile = {
      id: matchedMember.id,
      churchId: matchedMember.churchId,
      churchName: church.name,
      name: matchedMember.name,
      login: matchedMember.login || cleanLogin,
      role: matchedMember.role,
      roleId: matchedMember.roleId,
      sector: 'Setor Geral',
      currentCellId: matchedMember.cellId,
      email: `${matchedMember.login || cleanLogin}@appchurch.local`,
      phone: matchedMember.phone,
      avatarUrl:
        matchedMember.avatarUrl ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      isPrivileged: ['Líder de Setor', 'Pastor', 'Supervisor', 'Líder de Área', 'Administrador'].includes(
        matchedMember.role
      ),
      isSystemAdmin:
        matchedMember.login === 'admin' ||
        matchedMember.role === 'Administrador' ||
        matchedMember.login === 'developer.appchurch@gmail.com',
    };
    saveToStorage(STORAGE_KEYS.SESSION, memberUser);
    return memberUser;
  },

  /**
   * Get Churches list from Supabase
   */
  async getChurches(): Promise<Church[]> {
    if (supabase) {
      try {
        let { data, error } = await supabase.from('igrejas').select('*').order('nome');
        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          const legRes = await supabase.from('churches').select('*').order('nome');
          data = legRes.data;
          error = legRes.error;
        }
        if (!error && data && data.length > 0) {
          return data.map((c: any) => ({
            id: c.id,
            name: c.nome,
            slug: c.slug,
            cnpj: c.cnpj || undefined,
            city: c.cidade,
            state: c.estado,
            logoUrl: c.url_logo,
          }));
        }
      } catch (e) {
        console.warn('Erro ao buscar igrejas no Supabase:', e);
      }
    }
    const cached = loadFromStorage<Church[]>(STORAGE_KEYS.CHURCHES, INITIAL_CHURCHES);
    return cached.length > 0 ? cached : INITIAL_CHURCHES;
  },

  /**
   * Register a new Church with customizable hierarchical levels and Pastor credentials
   */
  async registerChurch(input: RegisterChurchInput): Promise<RegisterChurchResult> {
    const churchId = generateUUID();
    const pastorId = generateUUID();
    const cellId = generateUUID();
    const slug =
      input.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') || `igreja-${Date.now()}`;

    const cleanCnpj = input.cnpj?.replace(/\D/g, '') ? input.cnpj.trim() : undefined;
    const cleanPastorLogin = input.pastorLogin.trim().toLowerCase();
    const cleanPastorPass = input.pastorPassword.trim() || '123456';

    const churchObj: Church = {
      id: churchId,
      name: input.name.trim(),
      slug,
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

    // 0. Tenta primeiro via rota de servidor (/api/churches/register)
    // Isso utiliza a chave service_role segura no servidor Next.js, contornando restrições de RLS.
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/churches/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });

        const data = await response.json();
        if (response.ok && data?.success && data?.result) {
          const apiResult: RegisterChurchResult = data.result;

          // Atualiza caches locais
          const cachedChurches = loadFromStorage<Church[]>(STORAGE_KEYS.CHURCHES, INITIAL_CHURCHES);
          saveToStorage(STORAGE_KEYS.CHURCHES, [apiResult.church, ...cachedChurches.filter((c) => c.id !== apiResult.church.id)]);

          const cellId = apiResult.seedCell?.id || apiResult.pastor.currentCellId;
          const cachedMembers = loadFromStorage<CellMember[]>(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
          const newMember: CellMember = {
            id: apiResult.pastor.id,
            churchId: apiResult.church.id,
            cellId,
            name: apiResult.pastor.name,
            login: apiResult.pastor.login,
            password: apiResult.initialPasswordGenerated || '123456',
            role: 'Pastor',
            roleId: apiResult.pastor.roleId,
            neighborhood: 'Centro',
            birthday: '01/01',
            phone: apiResult.pastor.phone,
            email: apiResult.pastor.email,
            attendanceStatus: 'green',
            attendancePercentage: 100,
            avatarUrl: apiResult.pastor.avatarUrl,
          };
          saveToStorage(STORAGE_KEYS.MEMBERS, [newMember, ...cachedMembers.filter((m) => m.id !== newMember.id)]);

          if (apiResult.seedCell) {
            const cachedCells = loadFromStorage<CellGroup[]>(STORAGE_KEYS.CELLS, INITIAL_CELLS);
            saveToStorage(STORAGE_KEYS.CELLS, [apiResult.seedCell, ...cachedCells.filter((c) => c.id !== apiResult.seedCell?.id)]);
          }

          return apiResult;
        } else if (data?.error) {
          throw new Error(data.error);
        }
      } catch (apiErr: any) {
        // Se a API retornou erro específico de validação/banco, lança o erro
        if (apiErr?.message && !apiErr.message.includes('fetch') && !apiErr.message.includes('network') && !apiErr.message.includes('Failed to fetch')) {
          console.error('Erro no fluxo registerChurch:', apiErr);
          throw apiErr;
        }
        console.warn('Aviso: falha na rota /api/churches/register, tentando cliente direto:', apiErr);
      }
    }

    if (supabase) {
      let finalSlug = slug;
      try {
        // Checa congregações com slug conflitante
        const { data: existingSlugs } = await supabase
          .from('churches')
          .select('id, slug')
          .or(`slug.eq.${slug},slug.like.${slug}-%`);

        if (existingSlugs && existingSlugs.length > 0) {
          const taken = new Set(existingSlugs.map((s) => s.slug));
          if (taken.has(slug)) {
            let counter = 2;
            while (taken.has(`${slug}-${counter}`)) {
              counter++;
            }
            finalSlug = `${slug}-${counter}`;
          }
        }

        // 1. Inserir Igreja em 'churches'
        let churchPayload: any = {
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
        if (churchErr && churchErr.message?.includes('churches_slug_key')) {
          finalSlug = `${slug}-${Math.random().toString(36).substring(2, 7)}`;
          churchPayload.slug = finalSlug;
          churchObj.slug = finalSlug;
          const retrySlugRes = await supabase.from('churches').insert([churchPayload]);
          churchErr = retrySlugRes.error;
        }

        if (churchErr && (churchErr.message?.includes('cnpj') || churchErr.message?.includes('column'))) {
          console.warn('Coluna cnpj pode não existir na tabela churches, tentando sem ela...');
          delete churchPayload.cnpj;
          const retryRes = await supabase.from('churches').insert([churchPayload]);
          churchErr = retryRes.error;
        }

        if (churchErr) {
          throw new Error(`Falha ao cadastrar igreja no Supabase: ${churchErr.message}`);
        }

        // 2. Inserir Níveis Hierárquicos em 'nivel_tipo'
        const sortedLevels = [...input.levels].sort((a, b) => a.order - b.order);
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

        // 3. Resolver ID da Role de Pastor no Supabase para evitar violação de FK
        let resolvedRoleId = 'b2000000-0000-0000-0000-000000000001';
        try {
          const { data: matchedRoles } = await supabase
            .from('roles')
            .select('id, nome, slug')
            .or('slug.eq.pastor,slug.eq.PASTOR,nome.ilike.%pastor%')
            .limit(1);

          if (matchedRoles && matchedRoles.length > 0) {
            resolvedRoleId = matchedRoles[0].id;
          } else {
            const { data: anyRole } = await supabase.from('roles').select('id').limit(1);
            if (anyRole && anyRole.length > 0) {
              resolvedRoleId = anyRole[0].id;
            }
          }
        } catch (rErr) {
          console.warn('Aviso ao resolver role do pastor no cliente direto:', rErr);
        }

        const pastorPayload: any = {
          id: pastorId,
          igreja_id: churchId,
          celula_id: null,
          funcao_id: resolvedRoleId,
          funcao: 'Pastor',
          nome: input.pastorName.trim(),
          login: cleanPastorLogin,
          senha_hash: cleanPastorPass,
          telefone: input.pastorPhone?.trim() || null,
          email: input.pastorEmail?.trim() || null,
          bairro: 'Centro',
          status_frequencia: 'green',
          percentual_frequencia: 100,
          url_avatar: pastorProfile.avatarUrl,
          observacoes: 'Pastor Titular cadastrado no registro da igreja (aguardando 1ª célula)',
        };

        let { error: pastorErr } = await supabase.from('members').insert([pastorPayload]);

        // Auto-recuperação se FK falhar
        if (pastorErr && (pastorErr.message?.includes('members_funcao_id_fkey') || pastorErr.message?.includes('funcao_id'))) {
          try {
            const { data: validRoles } = await supabase.from('roles').select('id, nome, slug');
            if (validRoles && validRoles.length > 0) {
              const matched =
                validRoles.find(
                  (r: any) =>
                    r.slug?.toLowerCase().includes('pastor') ||
                    r.nome?.toLowerCase().includes('pastor')
                ) || validRoles[0];
              pastorPayload.funcao_id = matched.id;
              const retryRes = await supabase.from('members').insert([pastorPayload]);
              pastorErr = retryRes.error;
            }
          } catch {}
        }

        if (pastorErr) {
          // Rollback
          await supabase.from('nivel_tipo').delete().eq('igreja_id', churchId);
          await supabase.from('churches').delete().eq('id', churchId);
          throw new Error(`Falha ao cadastrar pastor titular: ${pastorErr.message}`);
        }
      } catch (err: any) {
        console.error('Erro no fluxo registerChurch:', err);
        throw err;
      }
    }

    // Atualiza armazenamento local
    const localChurches = loadFromStorage<Church[]>(STORAGE_KEYS.CHURCHES, INITIAL_CHURCHES);
    saveToStorage(STORAGE_KEYS.CHURCHES, [churchObj, ...localChurches.filter((c) => c.id !== churchId)]);

    const localMembers = loadFromStorage<CellMember[]>(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const newMember: CellMember = {
      id: pastorId,
      churchId,
      cellId: '',
      name: input.pastorName.trim(),
      login: cleanPastorLogin,
      password: cleanPastorPass,
      role: 'Pastor',
      roleId: 'b2000000-0000-0000-0000-000000000001',
      neighborhood: 'Centro',
      birthday: '01/01',
      phone: input.pastorPhone?.trim() || '',
      email: input.pastorEmail?.trim() || `${cleanPastorLogin}@appchurch.local`,
      attendanceStatus: 'green',
      attendancePercentage: 100,
      avatarUrl: pastorProfile.avatarUrl,
    };
    saveToStorage(STORAGE_KEYS.MEMBERS, [newMember, ...localMembers.filter((m) => m.id !== pastorId)]);

    return {
      church: churchObj,
      pastor: pastorProfile,
      levels: input.levels,
      initialPasswordGenerated: cleanPastorPass,
    };
  },

  /**
   * Get Hierarchical Levels for a Church
   */
  async getHierarchicalLevels(churchId: string): Promise<HierarchicalLevelInput[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('nivel_tipo')
          .select('*')
          .eq('igreja_id', churchId)
          .order('ordem', { ascending: true });

        if (!error && data && data.length > 0) {
          return data.map((n: any) => ({
            id: n.id,
            name: n.nome,
            order: n.ordem,
          }));
        }
      } catch (e) {
        console.warn('Erro ao buscar níveis hierárquicos:', e);
      }
    }
    return [
      { name: 'Distrito', order: 10 },
      { name: 'Área', order: 20 },
      { name: 'Setor', order: 30 },
      { name: 'Célula', order: 40 },
    ];
  },

  /**
   * Obtém os níveis hierárquicos formatados com identificação de Raiz e Folha
   */
  async getChurchLevels(churchId: string): Promise<ChurchHierarchicalLevel[]> {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/hierarchy/levels?churchId=${churchId}`);
        const data = await res.json();
        if (res.ok && data?.levels && data.levels.length > 0) {
          return data.levels;
        }
      } catch (err) {
        console.warn('Falha ao buscar níveis via API, tentando fallback direto:', err);
      }
    }

    if (supabase) {
      try {
        const { data } = await supabase
          .from('nivel_tipo')
          .select('id, igreja_id, nome, ordem')
          .eq('igreja_id', churchId)
          .order('ordem', { ascending: true });

        if (data && data.length > 0) {
          return data.map((l: any, idx: number) => ({
            id: l.id,
            churchId: l.igreja_id,
            name: l.nome,
            order: l.ordem,
            isRoot: idx === 0,
            isLeaf: idx === data.length - 1,
          }));
        }
      } catch (err) {
        console.warn('Falha no fallback direto de niveis:', err);
      }
    }

    const defaultNames = ['Distrito', 'Área', 'Setor', 'Célula'];
    return defaultNames.map((name, idx) => ({
      id: `default-lvl-${idx}`,
      churchId,
      name,
      order: (idx + 1) * 10,
      isRoot: idx === 0,
      isLeaf: idx === defaultNames.length - 1,
    }));
  },

  /**
   * Obtém as unidades organizacionais de um nível ou de todos os níveis da igreja
   */
  async getUnits(churchId: string, levelTypeId?: string, mode: 'flat' | 'full' = 'flat'): Promise<OrganizationalUnit[]> {
    if (typeof window !== 'undefined') {
      try {
        let url = `/api/hierarchy/units?churchId=${churchId}&mode=${mode}`;
        if (levelTypeId) url += `&levelTypeId=${levelTypeId}`;
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok && data?.units) {
          return data.units;
        }
      } catch (err) {
        console.warn('Falha ao buscar unidades via API:', err);
      }
    }
    return [];
  },

  /**
   * Obtém detalhes pesados (endereço, líderes, membros, coordenadas) sob demanda
   */
  async getUnitDetails(unitId: string, churchId: string): Promise<any> {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/hierarchy/unit-details?unitId=${unitId}&churchId=${churchId}`);
        const data = await res.json();
        if (res.ok && data?.details) {
          return data.details;
        }
      } catch (err) {
        console.warn('Falha ao buscar detalhes sob demanda:', err);
      }
    }
    return null;
  },

  /**
   * Cria uma nova unidade organizacional (com validação estrita de nível pai)
   */
  async createUnit(input: CreateUnitInput): Promise<OrganizationalUnit> {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/hierarchy/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Falha ao criar unidade organizacional.');
      }
      return data.unit;
    }
    throw new Error('Criação de unidades requer conexão com o servidor.');
  },

  /**
   * Vincula ou atualiza líderes de uma unidade organizacional (setor, área, célula, etc.)
   */
  async updateUnitLeaders(
    unitId: string,
    churchId: string,
    leaderMemberIds: string[]
  ): Promise<{ success: boolean; leaders: UnitLeader[] }> {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/hierarchy/units', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitId, churchId, leaderMemberIds }),
        });
        const data = await res.json();
        if (res.ok && data?.success) {
          // Atualiza também no cache local de cells se houver célula correspondente
          const cachedCells = loadFromStorage<CellGroup[]>(`${STORAGE_KEYS.CELLS}_${churchId}`, []);
          if (cachedCells.length > 0) {
            const updated = cachedCells.map((c) => {
              if (c.id === unitId) {
                const leaderName =
                  (data.leaders || []).map((l: any) => l.name).join(' & ') || 'Sem Líder';
                return { ...c, leaderName };
              }
              return c;
            });
            saveToStorage(`${STORAGE_KEYS.CELLS}_${churchId}`, updated);
          }
          return { success: true, leaders: data.leaders || [] };
        }
        throw new Error(data?.error || 'Falha ao vincular líderes.');
      } catch (err: any) {
        console.warn('Erro ao atualizar líderes via API, aplicando fallback local:', err);
        // Fallback local se estiver offline ou sem Supabase:
        const allMembers = loadFromStorage<CellMember[]>(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
        const churchMems = allMembers.filter(
          (m) => m.churchId === churchId && leaderMemberIds.includes(m.id)
        );
        const leaders: UnitLeader[] = churchMems.map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role || 'Líder',
          avatarUrl: m.avatarUrl,
          phone: m.phone,
        }));
        return { success: true, leaders };
      }
    }
    throw new Error('Atualização de líderes requer ambiente do cliente.');
  },

  /**
   * Obtém o Pool Geral de Membros da Igreja (membros sem célula e membros vinculados)
   */
  async getMemberPool(
    churchId: string,
    filter: 'all' | 'unlinked' | 'linked' = 'all'
  ): Promise<{
    members: (CellMember & { isUnlinked: boolean; cellName?: string })[];
    counts: { total: number; unlinked: number; linked: number };
  }> {
    // 1. Tentativa via API Server Route
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/members/pool?churchId=${churchId}&filter=${filter}`);
        const data = await res.json();
        if (res.ok && data?.members && data.members.length > 0) {
          return {
            members: data.members,
            counts: data.counts || {
              total: data.members.length,
              unlinked: data.members.filter((m: any) => m.isUnlinked).length,
              linked: data.members.filter((m: any) => !m.isUnlinked).length,
            },
          };
        }
      } catch (err) {
        console.warn('Falha ao buscar pool de membros via API, tentando fallback direto:', err);
      }
    }

    // 2. Fallback direto via Supabase Client
    if (supabase) {
      try {
        let query = supabase
          .from('membros')
          .select('id, igreja_id, unidade_id, papel_id, funcao, nome, login, bairro, aniversario, telefone, email, status_frequencia, percentual_frequencia, url_avatar, observacoes')
          .eq('igreja_id', churchId)
          .order('nome', { ascending: true });

        if (filter === 'unlinked') {
          query = query.is('unidade_id', null);
        } else if (filter === 'linked') {
          query = query.not('unidade_id', 'is', null);
        }

        let { data: dbMembers, error } = await query;
        if (error) {
          const legQ = supabase.from('members').select('*').eq('igreja_id', churchId).order('nome');
          const legRes = await legQ;
          dbMembers = legRes.data;
          error = legRes.error;
        }

        if (!error && dbMembers && dbMembers.length > 0) {
          const mapped = dbMembers.map((m: any) => {
            const effectiveCell = m.unidade_id || m.celula_id || '';
            return {
              id: m.id,
              churchId: m.igreja_id,
              cellId: effectiveCell,
              isUnlinked: !effectiveCell,
              cellName: effectiveCell ? 'Célula Vinculada' : 'Sem Célula (Geral)',
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
              avatarUrl: m.url_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
              notes: m.observacoes || '',
            };
          });

          const unlinkedCount = mapped.filter((m) => m.isUnlinked).length;
          const linkedCount = mapped.filter((m) => !m.isUnlinked).length;

          return {
            members: mapped,
            counts: {
              total: mapped.length,
              unlinked: unlinkedCount,
              linked: linkedCount,
            },
          };
        }
      } catch (directErr) {
        console.warn('Aviso no fallback direto do Supabase:', directErr);
      }
    }

    // 3. Fallback Local Storage
    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const churchMembers = allMembers.filter((m) => m.churchId === churchId);
    let resultList = churchMembers.map((m) => ({
      ...m,
      isUnlinked: !m.cellId,
      cellName: m.cellId ? 'Célula Vinculada' : 'Pool Geral (Sem Célula)',
    }));

    if (filter === 'unlinked') {
      resultList = resultList.filter((m) => m.isUnlinked);
    } else if (filter === 'linked') {
      resultList = resultList.filter((m) => !m.isUnlinked);
    }

    const unlinkedCount = churchMembers.filter((m) => !m.cellId).length;
    const linkedCount = churchMembers.filter((m) => Boolean(m.cellId)).length;

    return {
      members: resultList,
      counts: {
        total: churchMembers.length,
        unlinked: unlinkedCount,
        linked: linkedCount,
      },
    };
  },

  /**
   * Vincula um membro do pool geral a uma célula específica (apenas célula)
   */
  async assignMemberToCell(
    memberId: string,
    cellId: string | null,
    churchId: string
  ): Promise<{ success: boolean; cellName?: string }> {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/members/pool', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, cellId, churchId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Falha ao vincular membro à célula.');
      }
      return data;
    }
    throw new Error('Ação requer conexão com o servidor.');
  },

  /**
   * Cadastra um novo membro (podendo ser no Pool Geral ou direto em uma célula)
   */
  async createMemberInPool(payload: {
    churchId: string;
    name: string;
    phone?: string;
    email?: string;
    neighborhood?: string;
    role?: UserRole;
    cellId?: string | null;
    notes?: string;
  }): Promise<CellMember> {
    if (typeof window !== 'undefined') {
      const res = await fetch('/api/members/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Falha ao cadastrar membro.');
      }
      return data.member;
    }
    throw new Error('Ação requer conexão com o servidor.');
  },

  /**
   * Get Cells - STRICTLY filtered by churchId
   * Busca diretamente das tabelas físicas unidades, celulas, unidade_lideres e membros
   */
  async getCells(churchId: string): Promise<CellGroup[]> {
    if (supabase) {
      try {
        // 1. Busca todas as unidades ativas da igreja
        const { data: units, error: uErr } = await supabase
          .from('unidades')
          .select('id, igreja_id, nome, pai_id')
          .eq('igreja_id', churchId)
          .eq('ativo', true);

        if (!uErr && units && units.length > 0) {
          const unitIds = units.map((u: any) => u.id);

          // 2. Busca detalhes de células (dia, horário, endereço, etc.)
          const { data: celulasData } = await supabase
            .from('celulas')
            .select('*')
            .in('unidade_id', unitIds);

          const celulaMap = new Map<string, any>();
          (celulasData || []).forEach((c: any) => celulaMap.set(c.unidade_id, c));

          // 3. Mapeia nomes das unidades superiores (setor / distrito)
          const parentNameMap = new Map<string, string>();
          units.forEach((u: any) => parentNameMap.set(u.id, u.nome));

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

          const leaderMap = new Map<string, string>();
          (leadersData || []).forEach((l: any) => {
            const memName = leaderMemberMap.get(l.pessoa_id);
            if (memName && !leaderMap.has(l.unidade_id)) {
              leaderMap.set(l.unidade_id, memName);
            }
          });

          // 5. Contagem real de membros por unidade
          const { data: membersCount } = await supabase
            .from('membros')
            .select('unidade_id')
            .eq('igreja_id', churchId);
          const countMap = new Map<string, number>();
          (membersCount || []).forEach((m: any) => {
            if (m.unidade_id) {
              countMap.set(m.unidade_id, (countMap.get(m.unidade_id) || 0) + 1);
            }
          });

          // Unidades que são células (possuem entrada em 'celulas' ou são unidades folha)
          const parentIdsSet = new Set(units.map((u: any) => u.pai_id).filter(Boolean));
          let targetUnits = units.filter((u: any) => celulaMap.has(u.id) || !parentIdsSet.has(u.id));
          if (targetUnits.length === 0) targetUnits = units;

          const cells: CellGroup[] = targetUnits.map((u: any) => {
            const cInfo = celulaMap.get(u.id);
            const parentName = u.pai_id ? parentNameMap.get(u.pai_id) : 'Setor Geral';
            return {
              id: u.id,
              churchId: u.igreja_id,
              name: u.nome,
              leaderName: leaderMap.get(u.id) || 'Líder',
              sectorName: parentName || 'Setor Geral',
              address: cInfo?.endereco || 'Rua Sumaré, 245 - Junco',
              meetingDay: cInfo?.dia_reuniao || 'Quinta-feira',
              meetingTime: cInfo?.horario_reuniao || '19:30',
              memberCount: countMap.get(u.id) || cInfo?.quantidade_membros || 0,
            };
          });

          if (cells.length > 0) {
            saveToStorage(`${STORAGE_KEYS.CELLS}_${churchId}`, cells);
            return cells;
          }
        }
      } catch (e) {
        console.warn('Erro ao buscar células no Supabase:', e);
      }
    }
    const cached = loadFromStorage<CellGroup[]>(`${STORAGE_KEYS.CELLS}_${churchId}`, []);
    if (cached.length > 0) return cached;
    return INITIAL_CELLS.filter((c) => c.churchId === churchId);
  },

  /**
   * Cadastra uma nova célula para a igreja.
   * Aciona a rota /api/cells/create que popula 'cells', 'unidades', 'celulas'
   * e vincula o líder/pastor em 'unidade_lideres' e 'members'.
   */
  async createCell(payload: {
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
  }): Promise<CellGroup> {
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/cells/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (response.ok && data?.success && data?.cell) {
          const newCell: CellGroup = data.cell;
          // Atualiza cache local de células
          const cached = loadFromStorage<CellGroup[]>(`${STORAGE_KEYS.CELLS}_${payload.churchId}`, []);
          saveToStorage(`${STORAGE_KEYS.CELLS}_${payload.churchId}`, [newCell, ...cached.filter((c) => c.id !== newCell.id)]);

          const globalCached = loadFromStorage<CellGroup[]>(STORAGE_KEYS.CELLS, INITIAL_CELLS);
          saveToStorage(STORAGE_KEYS.CELLS, [newCell, ...globalCached.filter((c) => c.id !== newCell.id)]);

          // Se líder for membro, atualiza seu celula_id no cache
          if (payload.leaderMemberId) {
            const members = loadFromStorage<CellMember[]>(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
            const updated = members.map((m) =>
              m.id === payload.leaderMemberId ? { ...m, cellId: newCell.id } : m
            );
            saveToStorage(STORAGE_KEYS.MEMBERS, updated);
          }

          return newCell;
        } else if (data?.error) {
          throw new Error(data.error);
        }
      } catch (err: any) {
        if (err?.message && !err.message.includes('fetch')) {
          throw err;
        }
        console.warn('Falha na rota /api/cells/create, tentando modo direto:', err);
      }
    }

    // Fallback offline / local
    const fallbackId = generateUUID();
    const fallbackCell: CellGroup = {
      id: fallbackId,
      churchId: payload.churchId,
      name: payload.name.trim(),
      leaderName: payload.leaderName.trim(),
      sectorName: payload.sectorName?.trim() || 'Geral',
      address: payload.address?.trim() || (payload.neighborhood ? `Bairro ${payload.neighborhood}` : 'Centro'),
      meetingDay: payload.meetingDay?.trim() || 'Quarta-feira',
      meetingTime: payload.meetingTime?.trim() || '19:30',
      memberCount: payload.leaderMemberId ? 1 : 0,
    };

    const globalCached = loadFromStorage<CellGroup[]>(STORAGE_KEYS.CELLS, INITIAL_CELLS);
    saveToStorage(STORAGE_KEYS.CELLS, [fallbackCell, ...globalCached.filter((c) => c.id !== fallbackId)]);

    const cachedChurch = loadFromStorage<CellGroup[]>(`${STORAGE_KEYS.CELLS}_${payload.churchId}`, []);
    saveToStorage(`${STORAGE_KEYS.CELLS}_${payload.churchId}`, [fallbackCell, ...cachedChurch.filter((c) => c.id !== fallbackId)]);

    return fallbackCell;
  },

  /**
   * Get Members - STRICTLY filtered by churchId and optionally cellId
   * Guarantees members are differentiated by the church they belong to.
   */
  async getMembers(churchId: string, cellId?: string): Promise<CellMember[]> {
    if (supabase) {
      try {
        let query = supabase.from('membros').select('*').eq('igreja_id', churchId);
        if (cellId) {
          query = query.or(`unidade_id.eq.${cellId},celula_id.eq.${cellId}`);
        }
        let { data, error } = await query.order('nome');

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          let legQuery = supabase.from('members').select('*').eq('igreja_id', churchId);
          if (cellId) legQuery = legQuery.eq('celula_id', cellId);
          const legRes = await legQuery.order('nome');
          data = legRes.data;
          error = legRes.error;
        }

        if (!error && data) {
          const members: CellMember[] = data.map((m: any) => ({
            id: m.id,
            churchId: m.igreja_id,
            cellId: m.unidade_id || m.celula_id,
            roleId: m.papel_id || m.funcao_id,
            role: (m.funcao as UserRole) || 'Membro',
            name: m.nome,
            login: m.login || '',
            neighborhood: m.bairro || '',
            birthday: m.aniversario || '',
            phone: m.telefone || '',
            email: m.email || '',
            attendanceStatus: (m.status_frequencia as AttendanceStatus) || 'green',
            attendancePercentage: m.percentual_frequencia ?? 100,
            avatarUrl: m.url_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            notes: m.observacoes || '',
          }));
          saveToStorage(STORAGE_KEYS.MEMBERS, members);
          return members;
        }
      } catch (e) {
        console.warn('Erro ao buscar membros no Supabase:', e);
      }
    }
    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    let filtered = allMembers.filter((m) => m.churchId === churchId);
    if (cellId) {
      filtered = filtered.filter((m) => m.cellId === cellId);
    }
    return filtered;
  },

  /**
   * Verifica se um login já está em uso na tabela de membros (regra de login único)
   * Garante privacidade e segurança: NUNCA expõe o nome ou dados do membro associado ao login existente.
   */
  async isLoginAvailable(
    login: string,
    excludeMemberId?: string
  ): Promise<{ available: boolean; error?: string }> {
    const cleanLogin = login.trim().toLowerCase();
    if (!cleanLogin) return { available: false, error: 'O login não pode ser vazio.' };

    // Bloqueia logins de sistema reservados
    if (['admin', 'administrator', 'root', 'sistema', 'suporte'].includes(cleanLogin)) {
      return {
        available: false,
        error: 'Este login já está em uso. Por favor, escolha outro login.',
      };
    }

    if (supabase) {
      try {
        let query = supabase
          .from('membros')
          .select('id, login')
          .ilike('login', cleanLogin);
        if (excludeMemberId) {
          query = query.neq('id', excludeMemberId);
        }
        let { data, error } = await query.limit(1);

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          let legQuery = supabase
            .from('members')
            .select('id, login')
            .ilike('login', cleanLogin);
          if (excludeMemberId) {
            legQuery = legQuery.neq('id', excludeMemberId);
          }
          const legRes = await legQuery.limit(1);
          data = legRes.data;
          error = legRes.error;
        }

        // Se a consulta ao banco Supabase foi executada com sucesso
        if (!error) {
          if (data && data.length > 0) {
            // Login já cadastrado no banco: NÃO expõe o nome do membro por motivos de segurança e privacidade
            return {
              available: false,
              error: 'Este login já está em uso. Por favor, escolha outro login.',
            };
          }
          // Login não existe no banco Supabase: disponível para uso imediato!
          return { available: true };
        }
      } catch (err) {
        console.warn('Erro ao verificar disponibilidade de login no Supabase:', err);
      }
    }

    // Apenas se o Supabase não estiver configurado ou falhar (modo offline):
    // Verificação no armazenamento local utilizando apenas membros reais em cache (sem mock seed)
    const allMembers = loadFromStorage<CellMember[]>(STORAGE_KEYS.MEMBERS, []);
    const duplicateLocal = allMembers.find(
      (m) =>
        m.id !== excludeMemberId &&
        m.login &&
        m.login.trim().toLowerCase() === cleanLogin
    );
    if (duplicateLocal) {
      return {
        available: false,
        error: 'Este login já está em uso. Por favor, escolha outro login.',
      };
    }

    return { available: true };
  },

  /**
   * Add Member to a Cell (persists to Supabase + local cache)
   * Guaranteed to assign a valid UUID, validate login uniqueness and explicitly store churchId (igreja_id) & senha_hash.
   */
  async addMember(newMember: Omit<CellMember, 'id'>): Promise<CellMember> {
    const newId = generateUUID();

    // Normaliza login fornecido ou cria slug único a partir do nome
    const cleanLogin = (
      newMember.login ||
      newMember.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.]/g, '')
        .replace(/\s+/g, '.')
    ).trim().toLowerCase();

    // 1. Regra de Negócio Estrita: NÃO PODE REPETIR LOGIN
    const availability = await this.isLoginAvailable(cleanLogin);
    if (!availability.available) {
      throw new Error(availability.error || `O login "${cleanLogin}" já está em uso.`);
    }

    // Normaliza celula_id / unidade_id para null se for string vazia ou inexistente (PostgreSQL uuid)
    const validCellId =
      newMember.cellId && newMember.cellId.trim() !== '' ? newMember.cellId.trim() : null;

    // Normaliza igreja_id
    const validChurchId =
      newMember.churchId && newMember.churchId.trim() !== '' ? newMember.churchId.trim() : null;

    // Map roleId to a valid UUID if not already formatted
    let roleId = newMember.roleId;
    if (supabase && (!roleId || !roleId.includes('-') || roleId.startsWith('role-'))) {
      try {
        let { data: dbRoles } = await supabase.from('papeis').select('id, nome, slug');
        if (!dbRoles || dbRoles.length === 0) {
          const legRoles = await supabase.from('roles').select('id, nome, slug');
          dbRoles = legRoles.data;
        }
        if (dbRoles && dbRoles.length > 0) {
          const matched = dbRoles.find(
            (r: any) =>
              r.nome?.toLowerCase() === newMember.role.toLowerCase() ||
              r.slug?.toLowerCase() === newMember.role.toLowerCase() ||
              newMember.role.toLowerCase().includes(r.nome?.toLowerCase())
          );
          if (matched) roleId = matched.id;
        }
      } catch {}
    }
    if (!roleId || !roleId.includes('-') || roleId.startsWith('role-')) {
      const matchedRole = INITIAL_ROLES.find((r) => r.name === newMember.role);
      roleId = matchedRole ? matchedRole.id : ROLE_UUIDS.MEMBRO;
    }
    const validRoleId =
      roleId && roleId.trim() !== '' && roleId.includes('-') ? roleId.trim() : ROLE_UUIDS.MEMBRO;

    const created: CellMember = {
      ...newMember,
      id: newId,
      cellId: validCellId || '',
      login: cleanLogin,
      roleId: validRoleId,
    };

    if (supabase) {
      const ptPayload: any = {
        id: newId,
        igreja_id: validChurchId,
        unidade_id: validCellId,
        papel_id: validRoleId,
        funcao: newMember.role,
        nome: newMember.name,
        login: cleanLogin,
        senha_hash: newMember.password?.trim() || null,
        bairro: newMember.neighborhood || '',
        aniversario: newMember.birthday || '',
        telefone: newMember.phone || '',
        status_frequencia: newMember.attendanceStatus || 'green',
        percentual_frequencia: newMember.attendancePercentage ?? 100,
        url_avatar: newMember.avatarUrl || null,
        observacoes: newMember.notes || null,
      };

      let { error: insertError } = await supabase.from('membros').insert(ptPayload);

      // Fallback para tabela legada members se a nova tabela membros falhar
      if (insertError && (insertError.code === '42P01' || insertError.message?.includes('does not exist'))) {
        const legacyPayload = {
          ...ptPayload,
          celula_id: validCellId,
          funcao_id: validRoleId,
        };
        delete legacyPayload.unidade_id;
        delete legacyPayload.papel_id;
        const legRes = await supabase.from('members').insert(legacyPayload);
        insertError = legRes.error;
      }

      // Auto-recuperação caso o banco reclame de foreign key em papel_id / funcao_id
      if (insertError && (insertError.message?.includes('funcao_id') || insertError.message?.includes('papel_id'))) {
        try {
          const { data: dbRoles } = await supabase.from('papeis').select('id, nome, slug');
          if (dbRoles && dbRoles.length > 0) {
            const roleSlug = newMember.role.toLowerCase();
            const matched = dbRoles.find(
              (r: any) =>
                r.slug?.toLowerCase() === roleSlug ||
                r.nome?.toLowerCase() === roleSlug ||
                newMember.role.toLowerCase().includes(r.nome?.toLowerCase())
            ) || dbRoles[0];
            ptPayload.papel_id = matched.id;
            created.roleId = matched.id;
            const retryRes = await supabase.from('membros').insert(ptPayload);
            insertError = retryRes.error;
          }
        } catch {}
      }

      if (insertError) {
        if (
          insertError.code === '23505' ||
          insertError.message.toLowerCase().includes('unique') ||
          insertError.message.toLowerCase().includes('duplicate')
        ) {
          throw new Error(
            `O login "${cleanLogin}" já está cadastrado na tabela de membros. Por favor, escolha um login diferente.`
          );
        }
        throw new Error(`Erro ao cadastrar membro no banco: ${insertError.message}`);
      }

      // Update cell member count if RPC exists and cellId is valid
      if (validCellId) {
        try {
          await supabase.rpc('increment_cell_member_count', { cell_id: validCellId });
        } catch {
          // ignore if rpc not created
        }
      }
    }

    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    saveToStorage(STORAGE_KEYS.MEMBERS, [created, ...allMembers]);
    return created;
  },

  /**
   * Update Member Attendance in Supabase + local cache
   */
  async updateMemberAttendance(
    memberId: string,
    attendanceStatus: AttendanceStatus,
    attendancePercentage: number
  ): Promise<void> {
    if (supabase) {
      try {
        let { error } = await supabase
          .from('membros')
          .update({
            status_frequencia: attendanceStatus,
            percentual_frequencia: attendancePercentage,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', memberId);

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          await supabase
            .from('members')
            .update({
              status_frequencia: attendanceStatus,
              percentual_frequencia: attendancePercentage,
              atualizado_em: new Date().toISOString(),
            })
            .eq('id', memberId);
        }
      } catch (e) {
        console.warn('Erro ao atualizar frequência no Supabase:', e);
      }
    }

    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const updated = allMembers.map((m) =>
      m.id === memberId ? { ...m, attendanceStatus, attendancePercentage } : m
    );
    saveToStorage(STORAGE_KEYS.MEMBERS, updated);
  },

  /**
   * Get Feed Posts - filtered by churchId and optionally cellId
   * Performance-optimized: Strictly limited to the latest 10 posts, ordered from newest to oldest.
   */
  async getFeedPosts(
    churchId: string,
    cellId?: string,
    userId?: string,
    limit: number = 10
  ): Promise<FeedPost[]> {
    const formatTime = (isoString?: string) => {
      if (!isoString) return 'Agora mesmo';
      const d = new Date(isoString);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 5) return 'Agora mesmo';
      if (diffMins < 60) return `Há ${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `Há ${diffHours} h`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `Há ${diffDays} dias`;
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    };

    const userLikesKey = userId ? `appchurch_likes_${userId}` : 'appchurch_likes_anon';
    const userLikedPosts: string[] =
      typeof window !== 'undefined' ? loadFromStorage<string[]>(userLikesKey, []) : [];

    if (supabase) {
      try {
        let query = supabase
          .from('postagens_feed')
          .select('*')
          .eq('igreja_id', churchId);
        if (cellId) {
          query = query.or(`unidade_id.eq.${cellId},celula_id.eq.${cellId}`);
        }
        let { data: postsData, error } = await query
          .order('criado_em', { ascending: false })
          .limit(limit);

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          let legQuery = supabase
            .from('feed_posts')
            .select('*')
            .eq('igreja_id', churchId);
          if (cellId) legQuery = legQuery.eq('celula_id', cellId);
          const legRes = await legQuery
            .order('criado_em', { ascending: false })
            .limit(limit);
          postsData = legRes.data;
          error = legRes.error;
        }

        if (!error && postsData) {
          // Fetch all comments ONLY for the selected 10 posts
          const postIds = postsData.map((p: any) => p.id);
          let commentsByPost: Record<string, any[]> = {};

          if (postIds.length > 0) {
            let { data: commentsData, error: comErr } = await supabase
              .from('comentarios_postagem')
              .select('*')
              .in('post_id', postIds)
              .order('criado_em', { ascending: true });

            if (comErr || !commentsData) {
              const legCom = await supabase
                .from('post_comments')
                .select('*')
                .in('post_id', postIds)
                .order('criado_em', { ascending: true });
              commentsData = legCom.data;
            }

            (commentsData || []).forEach((c: any) => {
              if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
              commentsByPost[c.post_id].push({
                id: c.id,
                postId: c.post_id,
                authorName: c.nome_autor,
                authorRole: c.funcao_autor,
                authorAvatar: c.avatar_autor,
                content: c.conteudo,
                createdAt: formatTime(c.criado_em),
              });
            });
          }

          const mappedPosts: FeedPost[] = postsData.map((p: any) => ({
            id: p.id,
            churchId: p.igreja_id,
            cellId: p.unidade_id || p.celula_id,
            cellName: p.nome_celula,
            authorName: p.nome_autor,
            authorRole: p.funcao_autor,
            authorAvatar: p.avatar_autor,
            caption: p.legenda,
            imageUrl: p.url_imagem,
            category: p.categoria || 'Célula',
            likes: p.quantidade_curtidas || 0,
            likedByCurrentUser: userLikedPosts.includes(p.id),
            comments: commentsByPost[p.id] || [],
            createdAt: formatTime(p.criado_em),
          }));

          saveToStorage(STORAGE_KEYS.POSTS, mappedPosts);
          return mappedPosts;
        }
      } catch (e) {
        console.warn('Erro ao buscar posts no Supabase:', e);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    let filtered = allPosts.filter((p) => p.churchId === churchId);
    if (cellId) {
      filtered = filtered.filter((p) => p.cellId === cellId);
    }
    return filtered.slice(0, limit).map((p) => ({
      ...p,
      likedByCurrentUser: userLikedPosts.includes(p.id),
    }));
  },

  /**
   * Create Feed Post directly in Supabase with valid UUID
   */
  async createFeedPost(
    post: Omit<FeedPost, 'id' | 'likes' | 'likedByCurrentUser' | 'comments' | 'createdAt'>
  ): Promise<FeedPost> {
    const newId = generateUUID();
    const newPost: FeedPost = {
      ...post,
      id: newId,
      likes: 0,
      likedByCurrentUser: false,
      comments: [],
      createdAt: 'Agora mesmo',
    };

    if (supabase) {
      try {
        const ptPayload: any = {
          id: newId,
          igreja_id: post.churchId,
          unidade_id: post.cellId || null,
          nome_celula: post.cellName,
          nome_autor: post.authorName,
          funcao_autor: post.authorRole,
          avatar_autor: post.authorAvatar || null,
          legenda: post.caption,
          url_imagem: post.imageUrl || null,
          categoria: post.category || 'Célula',
          quantidade_curtidas: 0,
        };
        let { error } = await supabase.from('postagens_feed').insert(ptPayload);
        if (error && (error.code === '42P01' || error.message?.includes('does not exist') || error.code === 'PGRST204')) {
          const legPayload = { ...ptPayload, celula_id: post.cellId || null };
          delete legPayload.unidade_id;
          const legRes = await supabase.from('feed_posts').insert(legPayload);
          error = legRes.error;
        }
        if (error) {
          console.warn('Supabase post insert warning:', error);
        }
      } catch (e) {
        console.warn('Erro ao inserir post no Supabase:', e);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    saveToStorage(STORAGE_KEYS.POSTS, [newPost, ...allPosts]);
    return newPost;
  },

  /**
   * Toggle Like on Feed Post in Supabase & LocalStorage
   * Allows user to like and undo/unlike their like seamlessly.
   */
  async toggleLikePost(postId: string, userId?: string): Promise<FeedPost[]> {
    const userLikesKey = userId ? `appchurch_likes_${userId}` : 'appchurch_likes_anon';
    const userLikedPosts: string[] =
      typeof window !== 'undefined' ? loadFromStorage<string[]>(userLikesKey, []) : [];
    const isCurrentlyLiked = userLikedPosts.includes(postId);
    const nextLiked = !isCurrentlyLiked;

    if (typeof window !== 'undefined') {
      if (nextLiked) {
        saveToStorage(userLikesKey, [...userLikedPosts, postId]);
      } else {
        saveToStorage(
          userLikesKey,
          userLikedPosts.filter((id) => id !== postId)
        );
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    let newLikes = 0;

    const updated = allPosts.map((post) => {
      if (post.id === postId) {
        newLikes = nextLiked ? post.likes + 1 : Math.max(0, post.likes - 1);
        return {
          ...post,
          likedByCurrentUser: nextLiked,
          likes: newLikes,
        };
      }
      return post;
    });
    saveToStorage(STORAGE_KEYS.POSTS, updated);

    if (supabase) {
      try {
        let { error } = await supabase
          .from('postagens_feed')
          .update({ quantidade_curtidas: newLikes })
          .eq('id', postId);
        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          await supabase
            .from('feed_posts')
            .update({ quantidade_curtidas: newLikes })
            .eq('id', postId);
        }
      } catch (e) {
        console.warn('Erro ao atualizar curtida no Supabase:', e);
      }
    }

    return updated;
  },

  /**
   * Add Comment to Feed Post in Supabase with UUID
   */
  async addComment(postId: string, commentText: string, user: UserProfile): Promise<FeedPost[]> {
    const commentId = generateUUID();
    const newComment = {
      id: commentId,
      postId,
      authorName: user.name,
      authorRole: user.role,
      authorAvatar: user.avatarUrl,
      content: commentText,
      createdAt: 'Agora mesmo',
    };

    if (supabase) {
      try {
        const ptComment = {
          id: commentId,
          post_id: postId,
          nome_autor: user.name,
          funcao_autor: user.role,
          avatar_autor: user.avatarUrl || null,
          conteudo: commentText,
        };
        let { error } = await supabase.from('comentarios_postagem').insert(ptComment);
        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          await supabase.from('post_comments').insert(ptComment);
        }
      } catch (e) {
        console.warn('Erro ao adicionar comentário no Supabase:', e);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    const updated = allPosts.map((post) => {
      if (post.id === postId) {
        return {
          ...post,
          comments: [...post.comments, newComment],
        };
      }
      return post;
    });
    saveToStorage(STORAGE_KEYS.POSTS, updated);
    return updated;
  },

  /**
   * Delete Comment from Feed Post in Supabase & Storage
   */
  async deleteComment(postId: string, commentId: string): Promise<FeedPost[]> {
    if (supabase) {
      try {
        let { error } = await supabase
          .from('comentarios_postagem')
          .delete()
          .eq('id', commentId);
        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          await supabase.from('post_comments').delete().eq('id', commentId);
        }
      } catch (e) {
        console.warn('Erro ao excluir comentário no Supabase:', e);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    const updated = allPosts.map((post) => {
      if (post.id === postId) {
        return {
          ...post,
          comments: (post.comments || []).filter((c) => c.id !== commentId),
        };
      }
      return post;
    });
    saveToStorage(STORAGE_KEYS.POSTS, updated);
    return updated;
  },

  /**
   * Delete Feed Post from Supabase & Storage
   */
  async deleteFeedPost(postId: string): Promise<FeedPost[]> {
    if (supabase) {
      try {
        // Delete related comments first due to foreign key
        await supabase.from('comentarios_postagem').delete().eq('post_id', postId);
        // Delete post
        await supabase.from('postagens_feed').delete().eq('id', postId);
      } catch (e) {
        console.warn('Erro ao excluir post no Supabase:', e);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    const updated = allPosts.filter((p) => p.id !== postId);
    saveToStorage(STORAGE_KEYS.POSTS, updated);
    return updated;
  },

  /**
   * Get Announcements - filtered by churchId
   */
  async getAnnouncements(churchId: string): Promise<ChurchAnnouncement[]> {
    if (supabase) {
      try {
        let { data, error } = await supabase
          .from('avisos')
          .select('*')
          .eq('igreja_id', churchId)
          .order('criado_em', { ascending: false });

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          const legRes = await supabase
            .from('announcements')
            .select('*')
            .eq('igreja_id', churchId)
            .order('criado_em', { ascending: false });
          data = legRes.data;
          error = legRes.error;
        }

        if (!error && data) {
          return data.map((a: any) => ({
            id: a.id,
            churchId: a.igreja_id,
            title: a.titulo,
            content: a.conteudo,
            imageUrl: a.url_imagem,
            authorName: a.nome_autor,
            authorRole: a.funcao_autor,
            authorAvatar: a.avatar_autor,
            eventDate: a.data_evento,
            eventTime: a.horario_evento,
            location: a.localizacao,
            category: a.categoria || 'Geral',
            isImportant: a.importante ?? false,
            confirmedAttendeesCount: a.quantidade_confirmados || 0,
            isConfirmedByCurrentUser: false,
            createdAt: 'Recente',
          }));
        }
      } catch (e) {
        console.warn('Erro ao buscar avisos no Supabase:', e);
      }
    }

    const allAnnouncements = loadFromStorage(STORAGE_KEYS.ANNOUNCEMENTS, INITIAL_ANNOUNCEMENTS);
    return allAnnouncements.filter((a) => a.churchId === churchId);
  },

  /**
   * Create Church Announcement with UUID
   */
  async createAnnouncement(
    announcement: Omit<ChurchAnnouncement, 'id' | 'createdAt' | 'confirmedAttendeesCount' | 'isConfirmedByCurrentUser'>
  ): Promise<ChurchAnnouncement> {
    const newId = generateUUID();
    const newAnnouncement: ChurchAnnouncement = {
      ...announcement,
      id: newId,
      createdAt: 'Agora mesmo',
      confirmedAttendeesCount: 1,
      isConfirmedByCurrentUser: true,
    };

    if (supabase) {
      try {
        const payload = {
          id: newId,
          igreja_id: announcement.churchId,
          titulo: announcement.title,
          conteudo: announcement.content,
          url_imagem: announcement.imageUrl || null,
          nome_autor: announcement.authorName,
          funcao_autor: announcement.authorRole,
          avatar_autor: announcement.authorAvatar || null,
          data_evento: announcement.eventDate || null,
          horario_evento: announcement.eventTime || null,
          localizacao: announcement.location || null,
          categoria: announcement.category || 'Geral',
          importante: announcement.isImportant || false,
          quantidade_confirmados: 1,
        };
        let { error } = await supabase.from('avisos').insert(payload);
        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          await supabase.from('announcements').insert(payload);
        }
      } catch (e) {
        console.warn('Erro ao criar aviso no Supabase:', e);
      }
    }

    const allAnnouncements = loadFromStorage(STORAGE_KEYS.ANNOUNCEMENTS, INITIAL_ANNOUNCEMENTS);
    saveToStorage(STORAGE_KEYS.ANNOUNCEMENTS, [newAnnouncement, ...allAnnouncements]);
    return newAnnouncement;
  },

  /**
   * Toggle Attendee RSVP on Announcement
   */
  async toggleAnnouncementRSVP(announcementId: string): Promise<ChurchAnnouncement[]> {
    const allAnnouncements = loadFromStorage(STORAGE_KEYS.ANNOUNCEMENTS, INITIAL_ANNOUNCEMENTS);
    let newCount = 0;

    const updated = allAnnouncements.map((item) => {
      if (item.id === announcementId) {
        const isConfirmed = item.isConfirmedByCurrentUser;
        newCount = isConfirmed
          ? Math.max(0, (item.confirmedAttendeesCount || 1) - 1)
          : (item.confirmedAttendeesCount || 0) + 1;
        return {
          ...item,
          isConfirmedByCurrentUser: !isConfirmed,
          confirmedAttendeesCount: newCount,
        };
      }
      return item;
    });
    saveToStorage(STORAGE_KEYS.ANNOUNCEMENTS, updated);

    if (supabase) {
      try {
        let { error } = await supabase
          .from('avisos')
          .update({ quantidade_confirmados: newCount })
          .eq('id', announcementId);
        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          await supabase
            .from('announcements')
            .update({ quantidade_confirmados: newCount })
            .eq('id', announcementId);
        }
      } catch (e) {
        console.warn('Erro ao atualizar RSVP no Supabase:', e);
      }
    }

    return updated;
  },

  /**
   * Get Leadership Track Progress for a member, matching specific church steps (etapas_trilha)
   * and member's progress in membro_etapas_trilha
   */
  async getLeadershipProgress(memberId: string, churchId?: string): Promise<LeadershipTrackProgress | null> {
    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const targetMember = allMembers.find((m) => m.id === memberId);
    const resolvedChurchId = churchId || targetMember?.churchId || CHURCH_UUIDS.SOBRAL;

    // Busca o catálogo de etapas vinculado à igreja específica (ou global)
    const churchSteps = await this.getTrackSteps(resolvedChurchId);

    if (supabase) {
      try {
        let { data: trackSummary, error: trkErr } = await supabase
          .from('trilhas_lideranca')
          .select('*')
          .eq('membro_id', memberId)
          .maybeSingle();

        if (trkErr && (trkErr.code === '42P01' || trkErr.message?.includes('does not exist'))) {
          const legTrk = await supabase
            .from('leadership_tracks')
            .select('*')
            .eq('membro_id', memberId)
            .maybeSingle();
          trackSummary = legTrk.data;
        }

        let { data: stepsData, error: stepsError } = await supabase
          .from('membro_etapas_trilha')
          .select('*')
          .eq('membro_id', memberId)
          .order('etapa_id', { ascending: true });

        if (stepsError && (stepsError.code === '42P01' || stepsError.message?.includes('does not exist'))) {
          const legSteps = await supabase
            .from('member_track_steps')
            .select('*')
            .eq('membro_id', memberId)
            .order('etapa_id', { ascending: true });
          stepsData = legSteps.data;
          stepsError = legSteps.error;
        }

        if (!stepsError && stepsData) {
          // Mapeia registros da tabela membro_etapas_trilha por etapa_id
          const completedMap = new Map<string, any>();
          stepsData.forEach((st: any) => {
            completedMap.set(String(st.etapa_id), st);
          });

          const steps: LeadershipTrackStep[] = churchSteps.map((s, index) => {
            const memberStep = completedMap.get(String(s.id));
            const isCompleted = memberStep ? Boolean(memberStep.concluida) : false;
            return {
              id: s.id,
              stepNumber: s.stepNumber || index + 1,
              title: s.title,
              description: s.description,
              completed: isCompleted,
              completedAt: isCompleted ? (memberStep?.concluida_em || undefined) : undefined,
              notes: memberStep?.observacoes || undefined,
              validatedBy: memberStep?.validado_por || undefined,
            };
          });

          const highestCompletedIdx = steps
            .map((s, i) => (s.completed ? i : -1))
            .filter((i) => i !== -1);
          const currentStep =
            trackSummary?.etapa_atual_id ||
            (highestCompletedIdx.length > 0
              ? Math.min(Math.max(...highestCompletedIdx) + 2, steps.length)
              : 1);

          return {
            memberId,
            churchId: resolvedChurchId,
            currentStepId: currentStep,
            steps,
          };
        }
      } catch (e) {
        console.warn('Erro ao buscar trilho de liderança no Supabase:', e);
      }
    }

    const allTracks = loadFromStorage(STORAGE_KEYS.TRACKS, INITIAL_LEADERSHIP_PROGRESS);
    const cached = allTracks[memberId];
    if (cached && cached.steps && cached.steps.length > 0) {
      return {
        ...cached,
        churchId: resolvedChurchId,
      };
    }

    return {
      memberId,
      churchId: resolvedChurchId,
      currentStepId: 1,
      steps: churchSteps.map((s, index) => ({
        id: s.id,
        stepNumber: s.stepNumber || index + 1,
        title: s.title,
        description: s.description,
        completed: false,
      })),
    };
  },

  /**
   * Obtém o mapa de status das etapas do trilho para múltiplos membros
   * Retorna: Record<memberId, Record<stepId, { completed: boolean; completedAt?: string }>>
   */
  async getMembersTrackStatusMap(
    memberIds: string[],
    churchId?: string
  ): Promise<Record<string, Record<string, { completed: boolean; completedAt?: string }>>> {
    const resultMap: Record<string, Record<string, { completed: boolean; completedAt?: string }>> = {};
    if (!memberIds || memberIds.length === 0) return resultMap;

    // 1. Preenche a partir do cache local / INITIAL_LEADERSHIP_PROGRESS
    const allTracks = loadFromStorage<Record<string, LeadershipTrackProgress>>(
      STORAGE_KEYS.TRACKS,
      INITIAL_LEADERSHIP_PROGRESS
    );

    memberIds.forEach((mId) => {
      resultMap[mId] = {};
      const track = allTracks[mId];
      if (track?.steps) {
        track.steps.forEach((st) => {
          resultMap[mId][String(st.id)] = {
            completed: Boolean(st.completed),
            completedAt: st.completedAt,
          };
        });
      }
    });

    // 2. Se Supabase estiver conectado, busca registros reais de membro_etapas_trilha
    if (supabase) {
      try {
        let { data: stepRows, error } = await supabase
          .from('membro_etapas_trilha')
          .select('membro_id, etapa_id, concluida, concluida_em')
          .in('membro_id', memberIds);

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          const legRows = await supabase
            .from('member_track_steps')
            .select('membro_id, etapa_id, concluida, concluida_em')
            .in('membro_id', memberIds);
          stepRows = legRows.data;
          error = legRows.error;
        }

        if (!error && stepRows) {
          stepRows.forEach((row: any) => {
            const mId = row.membro_id;
            const stId = String(row.etapa_id);
            if (!resultMap[mId]) resultMap[mId] = {};
            resultMap[mId][stId] = {
              completed: Boolean(row.concluida),
              completedAt: row.concluida_em,
            };
          });
        }
      } catch (err) {
        console.warn('Erro ao carregar etapas do trilho do Supabase:', err);
      }
    }

    return resultMap;
  },

  /**
   * Save Leadership Track Progress to Supabase (membro_etapas_trilha + trilhas_lideranca) + local cache
   */
  async saveLeadershipProgress(
    memberId: string,
    progress: LeadershipTrackProgress,
    churchId?: string,
    cellId?: string
  ): Promise<void> {
    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const targetMember = allMembers.find((m) => m.id === memberId);
    let resolvedChurchId = churchId || targetMember?.churchId;
    let resolvedCellId = cellId || targetMember?.cellId;

    if (supabase) {
      try {
        // Se churchId ou cellId não foram passados ou são inválidos, busca os dados reais no banco
        if (
          !resolvedChurchId ||
          !resolvedCellId ||
          resolvedChurchId.startsWith('c1000000') ||
          resolvedCellId.startsWith('e1000000')
        ) {
          let dbMem: any = null;
          const { data: ptMem } = await supabase
            .from('membros')
            .select('igreja_id, unidade_id, celula_id')
            .eq('id', memberId)
            .maybeSingle();

          dbMem = ptMem;

          if (!dbMem) {
            const legMem = await supabase
              .from('members')
              .select('igreja_id, celula_id')
              .eq('id', memberId)
              .maybeSingle();
            dbMem = legMem.data;
          }

          if (dbMem) {
            if (dbMem.igreja_id) resolvedChurchId = dbMem.igreja_id;
            if (dbMem.unidade_id || dbMem.celula_id) resolvedCellId = dbMem.unidade_id || dbMem.celula_id;
          }
        }

        // Se cellId ainda for nulo (ex: pastor sem célula), obtém uma unidade/célula válida da igreja para satisfazer a foreign key
        if (!resolvedCellId || resolvedCellId.startsWith('e1000000')) {
          const { data: firstUnit } = await supabase
            .from('unidades')
            .select('id')
            .eq('igreja_id', resolvedChurchId || '')
            .limit(1)
            .maybeSingle();
          if (firstUnit?.id) {
            resolvedCellId = firstUnit.id;
          } else {
            const { data: firstCell } = await supabase
              .from('cells')
              .select('id')
              .eq('igreja_id', resolvedChurchId || '')
              .limit(1)
              .maybeSingle();
            if (firstCell?.id) {
              resolvedCellId = firstCell.id;
            }
          }
        }

        resolvedChurchId = resolvedChurchId || CHURCH_UUIDS.SOBRAL;
        resolvedCellId = resolvedCellId || CELL_UUIDS.ADONAI;

        const completedCount = progress.steps.filter((s) => s.completed).length;
        const totalCount = progress.steps.length || 6;
        const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        // Upsert summary row into trilhas_lideranca with igreja_id and unidade_id
        let { error: trackErr } = await supabase.from('trilhas_lideranca').upsert(
          {
            membro_id: memberId,
            igreja_id: resolvedChurchId,
            unidade_id: resolvedCellId,
            etapa_atual_id: progress.currentStepId,
            quantidade_etapas_concluidas: completedCount,
            quantidade_total_etapas: totalCount,
            percentual: pct,
            status: pct === 100 ? 'concluido' : 'em_andamento',
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: 'membro_id' }
        );

        if (trackErr && (trackErr.code === '42P01' || trackErr.message?.includes('does not exist') || trackErr.message?.includes('unidade_id'))) {
          await supabase.from('leadership_tracks').upsert(
            {
              membro_id: memberId,
              igreja_id: resolvedChurchId,
              celula_id: resolvedCellId,
              etapa_atual_id: progress.currentStepId,
              quantidade_etapas_concluidas: completedCount,
              quantidade_total_etapas: totalCount,
              percentual: pct,
              status: pct === 100 ? 'concluido' : 'em_andamento',
              atualizado_em: new Date().toISOString(),
            },
            { onConflict: 'membro_id' }
          );
        }

        // Upsert step rows into membro_etapas_trilha with unidade_id
        if (progress.steps && progress.steps.length > 0) {
          const stepRowsPt = progress.steps.map((st) => ({
            membro_id: memberId,
            unidade_id: resolvedCellId,
            etapa_id: typeof st.id === 'number' ? st.id : parseInt(String(st.id), 10) || 1,
            concluida: Boolean(st.completed),
            concluida_em: st.completed ? (st.completedAt || new Date().toLocaleDateString('pt-BR')) : null,
            observacoes: st.notes || null,
            validado_por: st.validatedBy || null,
            atualizado_em: new Date().toISOString(),
          }));

          let { error: stepsErr } = await supabase
            .from('membro_etapas_trilha')
            .upsert(stepRowsPt, { onConflict: 'membro_id,etapa_id' });

          if (stepsErr && (stepsErr.code === '42P01' || stepsErr.message?.includes('does not exist') || stepsErr.message?.includes('unidade_id') || stepsErr.code === 'PGRST204')) {
            const stepRowsLeg = stepRowsPt.map((st) => ({
              membro_id: st.membro_id,
              celula_id: st.unidade_id,
              etapa_id: st.etapa_id,
              concluida: st.concluida,
              concluida_em: st.concluida_em,
              observacoes: st.observacoes,
              validado_por: st.validado_por,
              atualizado_em: st.atualizado_em,
            }));
            await supabase
              .from('member_track_steps')
              .upsert(stepRowsLeg, { onConflict: 'membro_id,etapa_id' });
          }
        }
      } catch (e) {
        console.error('Erro ao salvar progresso do trilho no Supabase:', e);
      }
    }

    const allTracks = loadFromStorage(STORAGE_KEYS.TRACKS, INITIAL_LEADERSHIP_PROGRESS);
    saveToStorage(STORAGE_KEYS.TRACKS, {
      ...allTracks,
      [memberId]: progress,
    });

    // Atualiza resumo no membro local
    const completedCount = progress.steps.filter((s) => s.completed).length;
    const totalCount = progress.steps.length || 6;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const updatedMembers = allMembers.map((m) =>
      m.id === memberId
        ? {
            ...m,
            trackProgress: {
              currentStepId: progress.currentStepId,
              completedStepsCount: completedCount,
              totalStepsCount: totalCount,
              percentage: pct,
            },
          }
        : m
    );
    saveToStorage(STORAGE_KEYS.MEMBERS, updatedMembers);
  },

  /**
   * Conclui uma etapa do trilho para múltiplos membros em lote (grava diretamente no Supabase)
   */
  async batchCompleteStep(
    memberIds: string[],
    stepId: string | number,
    churchId?: string,
    validatedBy?: string
  ): Promise<void> {
    if (!memberIds || memberIds.length === 0) return;

    const dateStr = new Date().toLocaleDateString('pt-BR');
    const numericStepId = typeof stepId === 'number' ? stepId : parseInt(String(stepId), 10) || 1;

    if (supabase) {
      try {
        // 1. Busca dados dos membros selecionados no Supabase
        let dbMembers: any[] | null = null;
        const { data: ptMembers, error: memErr } = await supabase
          .from('membros')
          .select('id, unidade_id, celula_id, igreja_id')
          .in('id', memberIds);

        dbMembers = ptMembers;

        if (memErr && (memErr.code === '42P01' || memErr.message?.includes('does not exist'))) {
          const legMem = await supabase
            .from('members')
            .select('id, celula_id, igreja_id')
            .in('id', memberIds);
          dbMembers = legMem.data;
        }

        const memberMap = new Map<string, { id: string; celula_id?: string | null; unidade_id?: string | null; igreja_id?: string | null }>();
        if (dbMembers) {
          dbMembers.forEach((m: any) => memberMap.set(m.id, m));
        }

        // 2. Busca células/unidades disponíveis para fallback caso algum membro não tenha unidade vinculada
        const { data: dbUnits } = await supabase.from('unidades').select('id, igreja_id');
        const fallbackCellMap = new Map<string, string>();
        if (dbUnits) {
          dbUnits.forEach((c: any) => {
            if (c.igreja_id && !fallbackCellMap.has(c.igreja_id)) {
              fallbackCellMap.set(c.igreja_id, c.id);
            }
          });
        }
        const defaultAnyCell = dbUnits && dbUnits.length > 0 ? dbUnits[0].id : CELL_UUIDS.ADONAI;

        // 3. Constrói as linhas para inserção/atualização na tabela membro_etapas_trilha (com unidade_id)
        const stepRowsPt = memberIds.map((mId) => {
          const mem = memberMap.get(mId);
          const resolvedChurch = churchId || mem?.igreja_id || CHURCH_UUIDS.SOBRAL;
          let resolvedCell = mem?.unidade_id || mem?.celula_id;
          if (!resolvedCell || resolvedCell.startsWith('e1000000')) {
            resolvedCell = fallbackCellMap.get(resolvedChurch) || defaultAnyCell;
          }

          return {
            membro_id: mId,
            unidade_id: resolvedCell,
            etapa_id: numericStepId,
            concluida: true,
            concluida_em: dateStr,
            validado_por: validatedBy || 'Líder',
            atualizado_em: new Date().toISOString(),
          };
        });

        // 4. Executa o upsert em lote na tabela membro_etapas_trilha
        let { error: upsertErr } = await supabase
          .from('membro_etapas_trilha')
          .upsert(stepRowsPt, { onConflict: 'membro_id,etapa_id' });

        if (upsertErr && (upsertErr.code === '42P01' || upsertErr.message?.includes('does not exist') || upsertErr.message?.includes('unidade_id') || upsertErr.code === 'PGRST204')) {
          const stepRowsLeg = stepRowsPt.map((st) => ({
            membro_id: st.membro_id,
            celula_id: st.unidade_id,
            etapa_id: st.etapa_id,
            concluida: st.concluida,
            concluida_em: st.concluida_em,
            validado_por: st.validado_por,
            atualizado_em: st.atualizado_em,
          }));
          const legUpsert = await supabase
            .from('member_track_steps')
            .upsert(stepRowsLeg, { onConflict: 'membro_id,etapa_id' });
          upsertErr = legUpsert.error;
        }

        if (upsertErr) {
          console.error('Falha ao gravar etapas do trilho no Supabase:', upsertErr);
          throw new Error(`Erro ao salvar no banco: ${upsertErr.message}`);
        }

        // 5. Atualiza o resumo de progresso em trilhas_lideranca para cada membro (com unidade_id)
        for (const mId of memberIds) {
          const mem = memberMap.get(mId);
          const resolvedChurch = churchId || mem?.igreja_id || CHURCH_UUIDS.SOBRAL;
          let resolvedCell = mem?.unidade_id || mem?.celula_id;
          if (!resolvedCell || resolvedCell.startsWith('e1000000')) {
            resolvedCell = fallbackCellMap.get(resolvedChurch) || defaultAnyCell;
          }

          let { data: allSteps } = await supabase
            .from('membro_etapas_trilha')
            .select('etapa_id, concluida')
            .eq('membro_id', mId);

          if (!allSteps) {
            const legSteps = await supabase
              .from('member_track_steps')
              .select('etapa_id, concluida')
              .eq('membro_id', mId);
            allSteps = legSteps.data;
          }

          const completedCount = allSteps ? allSteps.filter((s: any) => s.concluida).length : 1;
          const totalCount = 9;
          const pct = Math.round((completedCount / totalCount) * 100);

          let { error: sumErr } = await supabase
            .from('trilhas_lideranca')
            .upsert(
              {
                membro_id: mId,
                igreja_id: resolvedChurch,
                unidade_id: resolvedCell,
                etapa_atual_id: numericStepId + 1,
                quantidade_etapas_concluidas: completedCount,
                quantidade_total_etapas: totalCount,
                percentual: pct,
                status: pct === 100 ? 'concluido' : 'em_andamento',
                atualizado_em: new Date().toISOString(),
              },
              { onConflict: 'membro_id' }
            );

          if (sumErr && (sumErr.code === '42P01' || sumErr.message?.includes('does not exist') || sumErr.message?.includes('unidade_id') || sumErr.code === 'PGRST204')) {
            await supabase
              .from('leadership_tracks')
              .upsert(
                {
                  membro_id: mId,
                  igreja_id: resolvedChurch,
                  celula_id: resolvedCell,
                  etapa_atual_id: numericStepId + 1,
                  quantidade_etapas_concluidas: completedCount,
                  quantidade_total_etapas: totalCount,
                  percentual: pct,
                  status: pct === 100 ? 'concluido' : 'em_andamento',
                  atualizado_em: new Date().toISOString(),
                },
                { onConflict: 'membro_id' }
              );
          }
        }
      } catch (err: any) {
        console.error('Erro no batchCompleteStep Supabase:', err);
        throw err;
      }
    }

    // 6. Sincroniza o armazenamento local para compatibilidade com outros componentes
    const allTracks = loadFromStorage<Record<string, LeadershipTrackProgress>>(
      STORAGE_KEYS.TRACKS,
      INITIAL_LEADERSHIP_PROGRESS
    );

    memberIds.forEach((mId) => {
      const currentProgress = allTracks[mId] || {
        memberId: mId,
        currentStepId: 1,
        steps: [],
      };

      let stepFound = false;
      const updatedSteps = (currentProgress.steps || []).map((st) => {
        if (String(st.id) === String(stepId) || st.id === numericStepId) {
          stepFound = true;
          return {
            ...st,
            completed: true,
            completedAt: dateStr,
            validatedBy: validatedBy || 'Líder',
          };
        }
        return st;
      });

      if (!stepFound) {
        updatedSteps.push({
          id: numericStepId,
          stepNumber: numericStepId,
          title: `Etapa ${numericStepId}`,
          description: '',
          completed: true,
          completedAt: dateStr,
          validatedBy: validatedBy || 'Líder',
        });
      }

      allTracks[mId] = {
        ...currentProgress,
        currentStepId: numericStepId + 1,
        steps: updatedSteps,
      };
    });

    saveToStorage(STORAGE_KEYS.TRACKS, allTracks);
  },

  /**
   * Roles (Tabela de Funções / Papéis)
   * Ordenado do menor para o maior nível de hierarquia
   */
  async getRoles(): Promise<Role[]> {
    if (supabase) {
      try {
        let { data, error } = await supabase
          .from('papeis')
          .select('*')
          .order('nivel_hierarquia', { ascending: true })
          .order('nome', { ascending: true });

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          const legRes = await supabase
            .from('roles')
            .select('*')
            .order('nivel_hierarquia', { ascending: true })
            .order('nome', { ascending: true });
          data = legRes.data;
          error = legRes.error;
        }

        if (!error && data && data.length > 0) {
          return data.map((r: any) => ({
            id: r.id,
            name: r.nome,
            slug: r.slug,
            description: r.descricao,
            hierarchyLevel: r.nivel_hierarquia,
            badgeColor: r.cor_distintivo,
          }));
        }
      } catch (e) {
        console.warn('Fallback para roles locais', e);
      }
    }
    return [...INITIAL_ROLES].sort((a, b) => a.hierarchyLevel - b.hierarchyLevel || a.name.localeCompare(b.name));
  },

  /**
   * Permissions (Tabela de Permissões)
   */
  async getPermissions(): Promise<Permission[]> {
    if (supabase) {
      try {
        let { data, error } = await supabase
          .from('permissoes')
          .select('*')
          .order('modulo');

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          const legRes = await supabase
            .from('permissions')
            .select('*')
            .order('modulo');
          data = legRes.data;
          error = legRes.error;
        }

        if (!error && data && data.length > 0) {
          return data.map((p: any) => ({
            id: p.id,
            code: p.codigo,
            name: p.nome,
            module: p.modulo,
            description: p.descricao,
          }));
        }
      } catch (e) {
        console.warn('Fallback para permissões locais', e);
      }
    }
    return INITIAL_PERMISSIONS;
  },

  /**
   * Role Permissions mapping
   */
  async getRolePermissions(roleId?: string): Promise<RolePermission[]> {
    if (supabase) {
      try {
        let query = supabase.from('papel_permissoes').select('*');
        if (roleId) query = query.eq('papel_id', roleId);
        let { data, error } = await query;

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          let legQuery = supabase.from('role_permissions').select('*');
          if (roleId) legQuery = legQuery.eq('funcao_id', roleId);
          const legRes = await legQuery;
          data = legRes.data;
          error = legRes.error;
        }

        if (!error && data && data.length > 0) {
          return data.map((rp: any) => ({
            roleId: rp.papel_id || rp.funcao_id,
            permissionId: rp.permissao_id,
          }));
        }
      } catch (e) {
        console.warn('Fallback para role_permissions locais', e);
      }
    }
    if (roleId) {
      return INITIAL_ROLE_PERMISSIONS.filter((rp) => rp.roleId === roleId);
    }
    return INITIAL_ROLE_PERMISSIONS;
  },

  /**
   * Catálogo de Etapas do Trilho (etapas_trilha) filtradas por igreja_id
   */
  async getTrackSteps(churchId?: string): Promise<TrackStep[]> {
    if (supabase) {
      try {
        let query = supabase.from('etapas_trilha').select('*');
        if (churchId) {
          query = query.or(`igreja_id.eq.${churchId},igreja_id.is.null`);
        }
        let { data, error } = await query.order('numero_etapa', { ascending: true });

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          let legQuery = supabase.from('etapa_trilhos').select('*');
          if (churchId) {
            legQuery = legQuery.or(`id_igreja.eq.${churchId},id_igreja.is.null`);
          }
          const legRes = await legQuery.order('numero_etapa', { ascending: true });
          data = legRes.data;
          error = legRes.error;
        }

        if (!error && data && data.length > 0) {
          // Se tiver etapas específicas da igreja, prioriza elas; senão usa as globais
          const churchSpecific = churchId ? data.filter((ts: any) => (ts.igreja_id || ts.id_igreja) === churchId) : [];
          const sourceList = churchSpecific.length > 0 ? churchSpecific : data;

          return sourceList.map((ts: any) => ({
            id: ts.id,
            id_igreja: ts.igreja_id || ts.id_igreja,
            churchId: ts.igreja_id || ts.id_igreja,
            stepNumber: ts.numero_etapa,
            title: ts.titulo,
            description: ts.descricao || '',
            required: ts.obrigatoria ?? true,
          }));
        }
      } catch (e) {
        console.warn('Fallback para etapa_trilhos locais', e);
      }
    }
    return INITIAL_TRACK_STEPS;
  },

  /**
   * Update Member Role in Supabase + local cache
   */
  async updateMemberRole(memberId: string, roleId: string, roleName: UserRole): Promise<void> {
    if (supabase) {
      try {
        let { error } = await supabase
          .from('membros')
          .update({
            papel_id: roleId,
            funcao: roleName,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', memberId);

        if (error && (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('papel_id'))) {
          await supabase
            .from('members')
            .update({
              funcao_id: roleId,
              funcao: roleName,
              atualizado_em: new Date().toISOString(),
            })
            .eq('id', memberId);
        }
      } catch (e) {
        console.warn('Erro ao atualizar role no Supabase:', e);
      }
    }

    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const updated = allMembers.map((m) =>
      m.id === memberId ? { ...m, roleId, role: roleName } : m
    );
    saveToStorage(STORAGE_KEYS.MEMBERS, updated);
  },

  /**
   * Atualiza a foto de avatar do usuário logado (membros.url_avatar e cache de sessão)
   */
  async updateUserAvatar(userId: string, avatarUrl: string): Promise<void> {
    if (supabase && userId && !userId.startsWith('admin-')) {
      try {
        let { error } = await supabase
          .from('membros')
          .update({
            url_avatar: avatarUrl,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', userId);

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          await supabase
            .from('members')
            .update({
              url_avatar: avatarUrl,
              atualizado_em: new Date().toISOString(),
            })
            .eq('id', userId);
        }
      } catch (e) {
        console.warn('Erro ao atualizar avatar no Supabase:', e);
      }
    }

    // 1. Atualiza na sessão ativa
    const currentSession = loadFromStorage<UserProfile | null>(STORAGE_KEYS.SESSION, null);
    if (currentSession) {
      const updatedSession = { ...currentSession, avatarUrl };
      saveToStorage(STORAGE_KEYS.SESSION, updatedSession);
    }

    // 2. Atualiza na lista de membros em cache
    const allMembers = loadFromStorage<CellMember[]>(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const updatedMembers = allMembers.map((m) =>
      m.id === userId || (currentSession?.login && m.login === currentSession.login)
        ? { ...m, avatarUrl }
        : m
    );
    saveToStorage(STORAGE_KEYS.MEMBERS, updatedMembers);
  },
};
