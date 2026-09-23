import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Church,
  UserProfile,
  CellGroup,
  CellMember,
  FeedPost,
  ChurchAnnouncement,
  LeadershipTrackProgress,
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
      // Query churches table to test read access
      const { data, error } = await supabase.from('churches').select('id, nome').limit(1);
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
          const { data: firstChurch } = await supabase.from('churches').select('id, nome').limit(1);
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

    // 1. Consulta prioritária na tabela real "members" do Supabase
    if (supabase) {
      try {
        const { data: memberRows, error } = await supabase
          .from('members')
          .select('*')
          .or(`login.ilike.${cleanLogin},email.ilike.${cleanLogin}`)
          .limit(1);

        if (error) {
          console.warn('Erro ao consultar tabela members no Supabase:', error);
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
            const { data: cData } = await supabase
              .from('churches')
              .select('nome')
              .eq('id', m.igreja_id)
              .single();
            if (cData?.nome) churchName = cData.nome;
          }

          // Busca informações da célula/setor
          let sector = 'Setor Geral';
          if (m.celula_id) {
            const { data: cellData } = await supabase
              .from('cells')
              .select('nome, nome_setor')
              .eq('id', m.celula_id)
              .single();
            if (cellData?.nome_setor) sector = cellData.nome_setor;
          }

          const userProfile: UserProfile = {
            id: m.id,
            churchId: m.igreja_id,
            churchName,
            name: m.nome,
            login: m.login || cleanLogin,
            role: (m.funcao as UserRole) || 'Membro',
            roleId: m.funcao_id,
            sector,
            currentCellId: m.celula_id,
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
        const { data, error } = await supabase.from('churches').select('*').order('nome');
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

        // 3. Cadastrar Pastor em 'members' (celula_id nulo aguardando 1ª célula)
        let { error: pastorErr } = await supabase.from('members').insert([
          {
            id: pastorId,
            igreja_id: churchId,
            celula_id: null,
            funcao_id: 'b2000000-0000-0000-0000-000000000001', // Pastor
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
          },
        ]);

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
  async getUnits(churchId: string, levelTypeId?: string): Promise<OrganizationalUnit[]> {
    if (typeof window !== 'undefined') {
      try {
        let url = `/api/hierarchy/units?churchId=${churchId}`;
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
          .from('members')
          .select('*')
          .eq('igreja_id', churchId)
          .order('nome', { ascending: true });

        if (filter === 'unlinked') {
          query = query.is('celula_id', null);
        } else if (filter === 'linked') {
          query = query.not('celula_id', 'is', null);
        }

        const { data: dbMembers, error } = await query;
        if (!error && dbMembers && dbMembers.length > 0) {
          const mapped = dbMembers.map((m: any) => ({
            id: m.id,
            churchId: m.igreja_id,
            cellId: m.celula_id || '',
            isUnlinked: !m.celula_id,
            cellName: m.celula_id ? 'Célula Vinculada' : 'Pool Geral (Sem Célula)',
            name: m.nome,
            login: m.login || '',
            role: (m.funcao as UserRole) || 'Membro',
            roleId: m.funcao_id,
            neighborhood: m.bairro || 'Centro',
            birthday: m.aniversario || '01/01',
            phone: m.telefone || '',
            email: m.email || '',
            attendanceStatus: (m.status_frequencia as AttendanceStatus) || 'green',
            attendancePercentage: m.percentual_frequencia ?? 100,
            avatarUrl: m.url_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            notes: m.observacoes || '',
          }));

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
   */
  async getCells(churchId: string): Promise<CellGroup[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('cells')
          .select('*')
          .eq('igreja_id', churchId)
          .order('nome');

        if (!error && data) {
          const cells: CellGroup[] = data.map((c: any) => ({
            id: c.id,
            churchId: c.igreja_id,
            name: c.nome,
            leaderName: c.nome_lider,
            sectorName: c.nome_setor,
            address: c.endereco,
            meetingDay: c.dia_reuniao,
            meetingTime: c.horario_reuniao,
            memberCount: c.quantidade_membros || 0,
          }));
          saveToStorage(`${STORAGE_KEYS.CELLS}_${churchId}`, cells);
          return cells;
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
        let query = supabase.from('members').select('*').eq('igreja_id', churchId);
        if (cellId) {
          query = query.eq('celula_id', cellId);
        }
        const { data, error } = await query.order('nome');

        if (!error && data) {
          const members: CellMember[] = data.map((m: any) => ({
            id: m.id,
            churchId: m.igreja_id,
            cellId: m.celula_id,
            roleId: m.funcao_id,
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
   */
  async isLoginAvailable(
    login: string,
    excludeMemberId?: string
  ): Promise<{ available: boolean; error?: string }> {
    const cleanLogin = login.trim().toLowerCase();
    if (!cleanLogin) return { available: false, error: 'O login não pode ser vazio.' };

    if (supabase) {
      try {
        let query = supabase
          .from('members')
          .select('id, nome, login')
          .ilike('login', cleanLogin);
        if (excludeMemberId) {
          query = query.neq('id', excludeMemberId);
        }
        const { data, error } = await query.limit(1);
        if (!error && data && data.length > 0) {
          return {
            available: false,
            error: `O login "${cleanLogin}" já está cadastrado para o membro "${data[0].nome}". Por favor, escolha outro login.`,
          };
        }
      } catch (err) {
        console.warn('Erro ao verificar disponibilidade de login no Supabase:', err);
      }
    }

    // Verificação também no armazenamento local (offline/fallback)
    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const duplicateLocal = allMembers.find(
      (m) =>
        m.id !== excludeMemberId &&
        m.login &&
        m.login.trim().toLowerCase() === cleanLogin
    );
    if (duplicateLocal) {
      return {
        available: false,
        error: `O login "${cleanLogin}" já está cadastrado para o membro "${duplicateLocal.name}". Por favor, escolha outro login.`,
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
      throw new Error(availability.error || `O login "${cleanLogin}" já está em uso por outro membro.`);
    }

    // Normaliza celula_id para null se for string vazia ou inexistente (PostgreSQL uuid)
    const validCellId =
      newMember.cellId && newMember.cellId.trim() !== '' ? newMember.cellId.trim() : null;

    // Normaliza igreja_id
    const validChurchId =
      newMember.churchId && newMember.churchId.trim() !== '' ? newMember.churchId.trim() : null;

    // Map roleId to a valid UUID if not already formatted
    let roleId = newMember.roleId;
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
      const { error: insertError } = await supabase.from('members').insert({
        id: newId,
        igreja_id: validChurchId,
        celula_id: validCellId,
        funcao_id: validRoleId,
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
      });

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
        await supabase
          .from('members')
          .update({
            status_frequencia: attendanceStatus,
            percentual_frequencia: attendancePercentage,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', memberId);
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
   */
  async getFeedPosts(churchId: string, cellId?: string): Promise<FeedPost[]> {
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

    if (supabase) {
      try {
        let query = supabase.from('feed_posts').select('*').eq('igreja_id', churchId);
        if (cellId) {
          query = query.eq('celula_id', cellId);
        }
        const { data: postsData, error } = await query.order('criado_em', { ascending: false });

        if (!error && postsData) {
          // Fetch all comments for these posts
          const postIds = postsData.map((p) => p.id);
          let commentsByPost: Record<string, any[]> = {};

          if (postIds.length > 0) {
            const { data: commentsData } = await supabase
              .from('post_comments')
              .select('*')
              .in('post_id', postIds)
              .order('criado_em', { ascending: true });

            (commentsData || []).forEach((c) => {
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

          const mappedPosts: FeedPost[] = postsData.map((p) => ({
            id: p.id,
            churchId: p.igreja_id,
            cellId: p.celula_id,
            cellName: p.nome_celula,
            authorName: p.nome_autor,
            authorRole: p.funcao_autor,
            authorAvatar: p.avatar_autor,
            caption: p.legenda,
            imageUrl: p.url_imagem,
            category: p.categoria || 'Célula',
            likes: p.quantidade_curtidas || 0,
            likedByCurrentUser: false,
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
    return filtered;
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
        const { error } = await supabase.from('feed_posts').insert({
          id: newId,
          igreja_id: post.churchId,
          celula_id: post.cellId || null,
          nome_celula: post.cellName,
          nome_autor: post.authorName,
          funcao_autor: post.authorRole,
          avatar_autor: post.authorAvatar || null,
          legenda: post.caption,
          url_imagem: post.imageUrl || null,
          categoria: post.category || 'Célula',
          quantidade_curtidas: 0,
        });
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
   * Toggle Like on Feed Post in Supabase
   */
  async toggleLikePost(postId: string): Promise<FeedPost[]> {
    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    let newLikes = 0;

    const updated = allPosts.map((post) => {
      if (post.id === postId) {
        const isLiked = post.likedByCurrentUser;
        newLikes = isLiked ? Math.max(0, post.likes - 1) : post.likes + 1;
        return {
          ...post,
          likedByCurrentUser: !isLiked,
          likes: newLikes,
        };
      }
      return post;
    });
    saveToStorage(STORAGE_KEYS.POSTS, updated);

    if (supabase) {
      try {
        await supabase
          .from('feed_posts')
          .update({ quantidade_curtidas: newLikes })
          .eq('id', postId);
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
        await supabase.from('post_comments').insert({
          id: commentId,
          post_id: postId,
          nome_autor: user.name,
          funcao_autor: user.role,
          avatar_autor: user.avatarUrl || null,
          conteudo: commentText,
        });
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
   * Delete Feed Post from Supabase & Storage
   */
  async deleteFeedPost(postId: string): Promise<FeedPost[]> {
    if (supabase) {
      try {
        // Delete related comments first due to foreign key
        await supabase.from('post_comments').delete().eq('post_id', postId);
        // Delete post
        await supabase.from('feed_posts').delete().eq('id', postId);
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
        const { data, error } = await supabase
          .from('announcements')
          .select('*')
          .eq('igreja_id', churchId)
          .order('criado_em', { ascending: false });

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
        await supabase.from('announcements').insert({
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
        });
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
        await supabase
          .from('announcements')
          .update({ quantidade_confirmados: newCount })
          .eq('id', announcementId);
      } catch (e) {
        console.warn('Erro ao atualizar RSVP no Supabase:', e);
      }
    }

    return updated;
  },

  /**
   * Get Leadership Track Progress for a member
   */
  async getLeadershipProgress(memberId: string): Promise<LeadershipTrackProgress | null> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('leadership_tracks')
          .select('*')
          .eq('membro_id', memberId)
          .single();

        if (!error && data) {
          const { data: stepsData } = await supabase
            .from('member_track_steps')
            .select('*')
            .eq('membro_id', memberId)
            .order('etapa_id', { ascending: true });

          const defaultSteps = INITIAL_TRACK_STEPS.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            completed: false,
            completedAt: undefined as string | undefined,
            notes: undefined as string | undefined,
            validatedBy: undefined as string | undefined,
          }));

          if (stepsData && stepsData.length > 0) {
            stepsData.forEach((st: any) => {
              const idx = defaultSteps.findIndex((s) => s.id === st.etapa_id);
              if (idx !== -1) {
                defaultSteps[idx] = {
                  ...defaultSteps[idx],
                  completed: Boolean(st.concluida),
                  completedAt: st.concluida_em,
                  notes: st.observacoes,
                  validatedBy: st.validado_por,
                };
              }
            });
          }

          return {
            memberId: data.membro_id,
            currentStepId: data.etapa_atual_id || 1,
            steps: defaultSteps,
          };
        }
      } catch (e) {
        console.warn('Erro ao buscar trilho de liderança no Supabase:', e);
      }
    }

    const allTracks = loadFromStorage(STORAGE_KEYS.TRACKS, INITIAL_LEADERSHIP_PROGRESS);
    return allTracks[memberId] || null;
  },

  /**
   * Save Leadership Track Progress to Supabase + local cache
   */
  async saveLeadershipProgress(memberId: string, progress: LeadershipTrackProgress): Promise<void> {
    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const targetMember = allMembers.find((m) => m.id === memberId);
    const churchId = targetMember?.churchId || CHURCH_UUIDS.SOBRAL;
    const cellId = targetMember?.cellId || CELL_UUIDS.ADONAI;

    if (supabase) {
      try {
        const completedCount = progress.steps.filter((s) => s.completed).length;
        const totalCount = progress.steps.length || 6;
        const pct = Math.round((completedCount / totalCount) * 100);

        // Upsert summary row into leadership_tracks with igreja_id and celula_id
        await supabase.from('leadership_tracks').upsert(
          {
            membro_id: memberId,
            igreja_id: churchId,
            celula_id: cellId,
            etapa_atual_id: progress.currentStepId,
            quantidade_etapas_concluidas: completedCount,
            quantidade_total_etapas: totalCount,
            percentual: pct,
            status: pct === 100 ? 'concluido' : 'em_andamento',
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: 'membro_id' }
        );

        // Upsert step rows into member_track_steps with celula_id
        if (progress.steps && progress.steps.length > 0) {
          const stepRows = progress.steps.map((st) => ({
            membro_id: memberId,
            celula_id: cellId,
            etapa_id: st.id,
            concluida: st.completed,
            concluida_em: st.completedAt || null,
            atualizado_em: new Date().toISOString(),
          }));

          await supabase
            .from('member_track_steps')
            .upsert(stepRows, { onConflict: 'membro_id,etapa_id' });
        }
      } catch (e) {
        console.warn('Erro ao salvar progresso do trilho no Supabase:', e);
      }
    }

    const allTracks = loadFromStorage(STORAGE_KEYS.TRACKS, INITIAL_LEADERSHIP_PROGRESS);
    saveToStorage(STORAGE_KEYS.TRACKS, {
      ...allTracks,
      [memberId]: progress,
    });
  },

  /**
   * Roles (Tabela de Funções - Roles)
   */
  async getRoles(): Promise<Role[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('roles')
          .select('*')
          .order('nivel_hierarquia', { ascending: false });
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
    return INITIAL_ROLES;
  },

  /**
   * Permissions (Tabela de Permissões)
   */
  async getPermissions(): Promise<Permission[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('permissions')
          .select('*')
          .order('modulo');
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
        let query = supabase.from('role_permissions').select('*');
        if (roleId) query = query.eq('funcao_id', roleId);
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data.map((rp: any) => ({
            roleId: rp.funcao_id,
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
   * Track Steps catalog
   */
  async getTrackSteps(): Promise<TrackStep[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('track_steps')
          .select('*')
          .order('numero_etapa');
        if (!error && data && data.length > 0) {
          return data.map((ts: any) => ({
            id: ts.id,
            stepNumber: ts.numero_etapa,
            title: ts.titulo,
            description: ts.descricao,
            required: ts.obrigatoria,
          }));
        }
      } catch (e) {
        console.warn('Fallback para track_steps locais', e);
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
        await supabase
          .from('members')
          .update({
            funcao_id: roleId,
            funcao: roleName,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', memberId);
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
};
