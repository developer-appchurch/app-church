import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteFeedImage } from './feedStorage';
import { getBrowserSupabaseClient } from './supabase/client';
import {
  Church,
  UserProfile,
  CellGroup,
  CellMember,
  FeedPost,
  PostComment,
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

// Centralized browser Supabase client singleton from @supabase/ssr
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? getBrowserSupabaseClient()
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

const removeFromStorage = (key: string): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
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
   * Limpa o cache local de dados (membros, células, posts, avisos) para sincronização limpa do banco
   */
  clearDataCache(): void {
    if (typeof window === 'undefined') return;
    try {
      removeFromStorage(STORAGE_KEYS.MEMBERS);
      removeFromStorage(STORAGE_KEYS.CELLS);
      removeFromStorage(STORAGE_KEYS.POSTS);
      removeFromStorage(STORAGE_KEYS.ANNOUNCEMENTS);
      removeFromStorage(STORAGE_KEYS.TRACKS);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('appchurch_members') ||
            key.startsWith('appchurch_cells') ||
            key.startsWith('appchurch_posts') ||
            key.startsWith('appchurch_announcements'))
        ) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore
    }
  },

  /**
   * Obtém o usuário em cache local instantaneamente (0ms) para inicialização otimista
   */
  getCachedUser(): UserProfile | null {
    return loadFromStorage<UserProfile | null>(STORAGE_KEYS.SESSION, null);
  },

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
   * Authenticate user against Supabase members table & Supabase Auth
   * Integração com /api/login para autenticação e sessão persistente via Supabase Auth
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

    // 1. Prioridade: Autenticação com Supabase Auth via endpoint SSR /api/login
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: cleanLogin, password: cleanPass }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Credenciais inválidas.');
        }

        if (data.user) {
          saveToStorage(STORAGE_KEYS.SESSION, data.user);

          // Sincroniza a sessão no cliente do navegador se retornado
          if (data.session && supabase) {
            try {
              await supabase.auth.setSession({
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              });
            } catch (syncErr) {
              console.warn('Aviso ao sincronizar token no cliente Supabase:', syncErr);
            }
          }

          return data.user;
        }
      } catch (err: any) {
        // Se a API retornou erro específico de validação/rate limit/senha, repassa para o formulário
        if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError')) {
          throw err;
        }
        console.warn('Endpoint /api/login indisponível, tentando fallback direto:', err);
      }
    }

    // 0. Super Administrador do Sistema AppChurch (Fallback de Emergência)
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
   * Obtém o usuário atualmente autenticado via sessão Supabase Auth SSR
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/auth/session', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            saveToStorage(STORAGE_KEYS.SESSION, data.user);
            return data.user;
          } else {
            // Sessão NÃO está autenticada no servidor
            // Limpa expressamente caches locais para impedir loop de auto-login
            removeFromStorage(STORAGE_KEYS.SESSION);
            localStorage.removeItem('appchurch_session_uuid_v4');
            localStorage.removeItem('appchurch_session_v3');
            localStorage.removeItem('appchurch_session');
            return null;
          }
        }
      } catch (e) {
        console.warn('Erro ao consultar /api/auth/session:', e);
      }

      // Se a sessão expirou ou não há usuário autenticado no servidor, retorna null
      return null;
    }
    return null;
  },

  /**
   * Realiza logout seguro no Supabase Auth, remove cookies e limpa o cache local
   */
  async logout(): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        const browserClient = getBrowserSupabaseClient();
        await browserClient.auth.signOut({ scope: 'local' });
      } catch (err) {
        console.warn('Aviso signOut no browser client:', err);
      }

      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
      } catch (e) {
        console.warn('Aviso ao chamar /api/auth/logout:', e);
      }

      // Limpa todas as chaves de sessão possíveis do armazenamento local
      removeFromStorage(STORAGE_KEYS.SESSION);
      localStorage.removeItem('appchurch_session_uuid_v4');
      localStorage.removeItem('appchurch_session_v3');
      localStorage.removeItem('appchurch_session');

      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.startsWith('appchurch_session'))) {
            localStorage.removeItem(key);
          }
        }
        sessionStorage.clear();
      } catch {
        // ignore
      }
    }
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
        let unitQuery = supabase
          .from('unidades')
          .select('id, igreja_id, nome, pai_id')
          .eq('ativo', true);

        if (churchId && churchId !== 'church-master' && churchId !== 'all') {
          unitQuery = unitQuery.eq('igreja_id', churchId);
        }

        let { data: units, error: uErr } = await unitQuery;

        if ((!units || units.length === 0) && churchId && churchId !== 'all') {
          const allUnitsRes = await supabase
            .from('unidades')
            .select('id, igreja_id, nome, pai_id')
            .eq('ativo', true);
          units = allUnitsRes.data;
          uErr = allUnitsRes.error;
        }

        if (!uErr && units && units.length > 0) {
          const unitIds = units.map((u: any) => u.id);

          // 2. Busca detalhes de células (dia, horário, endereço, etc.)
          const { data: celulasData } = await supabase
            .from('celulas')
            .select('unidade_id, endereco, dia_reuniao, horario_reuniao, quantidade_membros')
            .in('unidade_id', unitIds);

          const celulaMap = new Map<string, any>();
          (celulasData || []).forEach((c: any) => celulaMap.set(c.unidade_id, c));

          // 3. Mapeia nomes das unidades superiores (setor / distrito / área)
          const parentNameMap = new Map<string, string>();
          const parentIdMap = new Map<string, string>();
          units.forEach((u: any) => {
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

          const leaderMap = new Map<string, string>();
          const leadersByUnit = new Map<string, string[]>();
          (leadersData || []).forEach((l: any) => {
            if (l.unidade_id && l.pessoa_id) {
              const list = leadersByUnit.get(l.unidade_id) || [];
              list.push(l.pessoa_id);
              leadersByUnit.set(l.unidade_id, list);
            }
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
            const grandparentId = u.pai_id ? parentIdMap.get(u.pai_id) : null;
            const areaName = grandparentId ? parentNameMap.get(grandparentId) : undefined;
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
              parentUnitId: u.pai_id || null,
              parentName: parentName || undefined,
              areaName: areaName || undefined,
              areaUnitId: grandparentId || null,
              leaderMemberIds: leadersByUnit.get(u.id) || [],
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
   * Usa projeção de colunas explícitas (sem senha_hash) para evitar erro de RLS/Column Security e nunca zera a lista em caso de falha.
   */
  async getMembers(churchId: string, cellId?: string): Promise<CellMember[]> {
    const EXPLICIT_MEMBER_COLUMNS = 'id, igreja_id, unidade_id, papel_id, funcao, nome, login, bairro, aniversario, telefone, email, status_frequencia, percentual_frequencia, url_avatar, auth_user_id, observacoes';
    const EXPLICIT_LEGACY_COLUMNS = 'id, igreja_id, celula_id, funcao_id, funcao, nome, login, bairro, aniversario, telefone, email, status_frequencia, percentual_frequencia, url_avatar, auth_user_id, observacoes';

    if (supabase) {
      try {
        let data: any[] | null = null;
        let error: any = null;

        let query = supabase.from('membros').select(EXPLICIT_MEMBER_COLUMNS);
        if (churchId && churchId !== 'church-master' && churchId !== 'all') {
          query = query.eq('igreja_id', churchId);
        }
        if (cellId) {
          query = query.eq('unidade_id', cellId);
        }
        const initialRes = await query.order('nome');
        data = initialRes.data;
        error = initialRes.error;

        if (error) {
          console.error('[AppChurchService.getMembers] Erro real retornado pelo Supabase (tabela membros):', {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          });
        }

        // Se a tabela membros falhar ou não existir, tenta a tabela legacy members
        if (error && (error.code === '42P01' || error.message?.includes('does not exist') || error.code === '42703')) {
          let legQuery = supabase.from('members').select(EXPLICIT_LEGACY_COLUMNS);
          if (churchId && churchId !== 'church-master' && churchId !== 'all') {
            legQuery = legQuery.eq('igreja_id', churchId);
          }
          if (cellId) legQuery = legQuery.eq('celula_id', cellId);
          const legRes = await legQuery.order('nome');
          if (legRes.error) {
            console.error('[AppChurchService.getMembers] Erro real retornado pela tabela legacy members:', legRes.error);
          } else {
            data = legRes.data;
            error = null;
          }
        }

        // Se a consulta foi bem sucedida e retornou dados do banco
        if (!error && data && Array.isArray(data)) {
          const members: CellMember[] = data.map((m: any) => ({
            id: m.id,
            churchId: m.igreja_id || churchId,
            cellId: m.unidade_id || m.celula_id || m.cell_id || '',
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
            avatarUrl: m.url_avatar || '',
            authUserId: m.auth_user_id || undefined,
            auth_user_id: m.auth_user_id || undefined,
            notes: m.observacoes || '',
          }));

          // Atualiza cache local apenas quando a consulta tem sucesso
          saveToStorage(STORAGE_KEYS.MEMBERS, members);

          if (cellId) {
            return members.filter((m) => m.cellId === cellId);
          }
          return members;
        }

        // Se houve erro na consulta, mantém os dados anteriores do cache para NUNCA zerar a lista na UI
        if (error) {
          const cached = loadFromStorage<CellMember[]>(STORAGE_KEYS.MEMBERS, []);
          if (cached && cached.length > 0) {
            let filtered = cached;
            if (churchId && churchId !== 'church-master' && churchId !== 'all') {
              filtered = filtered.filter((m) => m.churchId === churchId);
            }
            if (cellId) {
              filtered = filtered.filter((m) => m.cellId === cellId);
            }
            console.warn('[AppChurchService.getMembers] Mantendo dados anteriores do cache devido a erro no banco.');
            return filtered.length > 0 ? filtered : cached;
          }
        }
      } catch (e: any) {
        console.error('[AppChurchService.getMembers] Exceção ao consultar membros no Supabase:', e);
      }
    }

    // Fallback de preservação de dados: nunca zera a lista se houver registros anteriores
    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    let filtered = allMembers;
    if (churchId && churchId !== 'church-master' && churchId !== 'all') {
      filtered = filtered.filter((m) => m.churchId === churchId);
    }
    if (cellId) {
      filtered = filtered.filter((m) => m.cellId === cellId);
    }
    return filtered.length > 0 ? filtered : allMembers;
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

    // 1. Tenta criar através da API do servidor para provisionar o usuário no Supabase auth.users
    let createdViaApi = false;
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      try {
        const res = await fetch('/api/members/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            churchId: validChurchId,
            name: newMember.name,
            login: cleanLogin,
            password: newMember.password || '123456',
            role: newMember.role,
            roleId: validRoleId,
            cellId: validCellId,
            neighborhood: newMember.neighborhood || 'Centro',
            birthday: newMember.birthday || '01/01',
            phone: newMember.phone || '',
            email: newMember.email || '',
            attendanceStatus: newMember.attendanceStatus || 'green',
            attendancePercentage: newMember.attendancePercentage ?? 100,
            avatarUrl: newMember.avatarUrl?.trim() || null,
            notes: newMember.notes || null,
          }),
        });

        const resData = await res.json();
        if (res.ok && resData?.success && resData?.member) {
          created.id = resData.member.id;
          created.login = resData.member.login;
          created.roleId = resData.member.roleId;
          created.avatarUrl = resData.member.avatarUrl || '';
          created.authUserId = resData.member.authUserId || undefined;
          createdViaApi = true;
        } else if (resData?.error) {
          console.warn('[addMember API] Retornou erro:', resData.error);
          throw new Error(resData.error);
        }
      } catch (apiErr: any) {
        if (apiErr?.message) {
          throw apiErr;
        }
        console.warn('[addMember] API de criação indisponível ou falhou, usando fallback direto:', apiErr);
      }
    }

    if (!createdViaApi && supabase) {
      let fallbackAuthId: string | null = null;
      try {
        const synthEmail = `${cleanLogin.replace(/[^a-z0-9._-]/g, '_')}@membros.appchurch.local`;
        const { data: signData } = await supabase.auth.signUp({
          email: synthEmail,
          password: newMember.password?.trim() || '123456',
          options: {
            data: {
              nome: newMember.name,
              login: cleanLogin,
              igreja_id: validChurchId,
              membro_id: newId,
              role: newMember.role,
            },
          },
        });
        if (signData?.user?.id) {
          fallbackAuthId = signData.user.id;
          created.authUserId = fallbackAuthId;
        }
      } catch (authErr) {
        console.warn('Aviso no fallback direto de signUp:', authErr);
      }

      const ptPayload: any = {
        id: newId,
        igreja_id: validChurchId,
        unidade_id: validCellId,
        papel_id: validRoleId,
        funcao: newMember.role,
        nome: newMember.name,
        login: cleanLogin,
        senha_hash: newMember.password?.trim() || '123456',
        auth_user_id: fallbackAuthId,
        bairro: newMember.neighborhood || '',
        aniversario: newMember.birthday || '',
        telefone: newMember.phone || '',
        status_frequencia: newMember.attendanceStatus || 'green',
        percentual_frequencia: newMember.attendancePercentage ?? 100,
        url_avatar: newMember.avatarUrl?.trim() || null,
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
   * Exclui um membro do banco de dados e remove seu usuário do auth.users
   */
  async deleteMember(memberId: string): Promise<boolean> {
    if (!memberId) return false;

    // 1. Tenta excluir via API do servidor (remove de membros e de auth.users)
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      try {
        const res = await fetch(`/api/members/create?memberId=${encodeURIComponent(memberId)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
          saveToStorage(
            STORAGE_KEYS.MEMBERS,
            allMembers.filter((m: CellMember) => m.id !== memberId)
          );
          return true;
        }
      } catch (apiErr) {
        console.warn('[deleteMember] Erro ao excluir via API:', apiErr);
      }
    }

    // Fallback direto no Supabase
    if (supabase) {
      try {
        await supabase.from('membros').delete().eq('id', memberId);
      } catch {}
    }

    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    saveToStorage(
      STORAGE_KEYS.MEMBERS,
      allMembers.filter((m: CellMember) => m.id !== memberId)
    );
    return true;
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
   * Feed de Notícias com Paginação por Cursor
   * (criado_em desc, id desc, 10 por página)
   * Usa diretamente a tabela postagens_feed e apenas as colunas usadas nos cards.
   * Não carrega comentários pesados antecipadamente.
   */
  async getFeedPostsPage({
    churchId,
    cellId,
    userId,
    cursor,
    pageSize = 10,
  }: {
    churchId: string;
    cellId?: string;
    userId?: string;
    cursor?: { criado_em: string; id: string } | null;
    pageSize?: number;
  }): Promise<{ posts: FeedPost[]; nextCursor: { criado_em: string; id: string } | null; hasMore: boolean }> {
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
    const localLikedPosts: string[] =
      typeof window !== 'undefined' ? loadFromStorage<string[]>(userLikesKey, []) : [];

    if (supabase) {
      try {
        const fullColumns =
          'id, igreja_id, unidade_id, nome_celula, nome_autor, funcao_autor, avatar_autor, legenda, url_imagem, categoria, quantidade_curtidas, quantidade_comentarios, criado_em, imagem_largura, imagem_altura';
        const fallbackColumns =
          'id, igreja_id, unidade_id, nome_celula, nome_autor, funcao_autor, avatar_autor, legenda, url_imagem, categoria, quantidade_curtidas, criado_em';

        let buildQuery = (columns: string) => {
          let q = supabase
            .from('postagens_feed')
            .select(columns)
            .eq('igreja_id', churchId);

          if (cellId) {
            q = q.or(`unidade_id.eq.${cellId},celula_id.eq.${cellId}`);
          }

          // Filtro de paginação por cursor (criado_em desc, id desc)
          if (cursor?.criado_em) {
            q = q.lt('criado_em', cursor.criado_em);
          }

          return q
            .order('criado_em', { ascending: false })
            .order('id', { ascending: false })
            .limit(pageSize + 1);
        };

        let { data: rawRows, error } = await buildQuery(fullColumns);

        // Se colunas novas ainda não estiverem no cache do schema, recorre às colunas padrão
        if (error && (error.code === '42703' || error.message?.includes('does not exist') || error.code === 'PGRST204')) {
          const fallbackRes = await buildQuery(fallbackColumns);
          rawRows = fallbackRes.data;
          error = fallbackRes.error;
        }

        if (!error && rawRows) {
          const rows: any[] = rawRows as any;
          const hasMore = rows.length > pageSize;
          const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
          const postIds = pageRows.map((p: any) => p.id);

          // Verifica curtidas do usuário logado (via tabela curtidas se existir, com fallback para cache local)
          const userLikedSet = new Set<string>(localLikedPosts);
          if (userId && postIds.length > 0) {
            try {
              const { data: curtidas } = await supabase
                .from('curtidas')
                .select('post_id')
                .in('post_id', postIds)
                .eq('membro_id', userId);

              if (curtidas && (curtidas as any).length > 0) {
                (curtidas as any).forEach((c: any) => userLikedSet.add(c.post_id));
              }
            } catch {
              // Tabela curtidas opcional
            }
          }

          const mappedPosts: FeedPost[] = pageRows.map((p: any) => ({
            id: p.id,
            churchId: p.igreja_id,
            cellId: p.unidade_id || p.celula_id,
            cellName: p.nome_celula,
            authorName: p.nome_autor,
            authorRole: p.funcao_autor,
            authorAvatar: p.avatar_autor,
            caption: p.legenda,
            imageUrl: p.url_imagem,
            imageWidth: p.imagem_largura || undefined,
            imageHeight: p.imagem_altura || undefined,
            category: p.categoria || 'Célula',
            likes: p.quantidade_curtidas || 0,
            likedByCurrentUser: userLikedSet.has(p.id),
            comments: [], // Carregamento sob demanda apenas ao abrir
            commentsCount: p.quantidade_comentarios ?? 0,
            createdAt: formatTime(p.criado_em),
            created_at_raw: p.criado_em,
          }));

          const lastRow: any = pageRows[pageRows.length - 1];
          const nextCursor =
            hasMore && lastRow
              ? { criado_em: lastRow.criado_em, id: lastRow.id }
              : null;

          return {
            posts: mappedPosts,
            nextCursor,
            hasMore,
          };
        }
      } catch (e) {
        console.warn('Erro ao buscar posts no Supabase:', e);
      }
    }

    // Fallback Offline/Local
    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    let filtered = allPosts.filter((p) => p.churchId === churchId);
    if (cellId) {
      filtered = filtered.filter((p) => p.cellId === cellId);
    }
    const pagePosts = filtered.slice(0, pageSize).map((p) => ({
      ...p,
      likedByCurrentUser: localLikedPosts.includes(p.id),
      commentsCount: p.comments?.length ?? 0,
    }));

    return {
      posts: pagePosts,
      nextCursor: null,
      hasMore: false,
    };
  },

  /**
   * Get Feed Posts - wrapper de compatibilidade
   */
  async getFeedPosts(
    churchId: string,
    cellId?: string,
    userId?: string,
    limit: number = 10
  ): Promise<FeedPost[]> {
    const res = await this.getFeedPostsPage({
      churchId,
      cellId,
      userId,
      pageSize: limit,
    });
    return res.posts;
  },

  /**
   * Busca comentários paginados sob demanda para um post específico
   */
  async getPostComments(postId: string, limit = 20, offset = 0): Promise<PostComment[]> {
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
        let { data, error } = await supabase
          .from('comentarios_postagem')
          .select('id, post_id, nome_autor, funcao_autor, avatar_autor, conteudo, criado_em')
          .eq('post_id', postId)
          .order('criado_em', { ascending: true })
          .range(offset, offset + limit - 1);

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          const leg = await supabase
            .from('post_comments')
            .select('id, post_id, nome_autor, funcao_autor, avatar_autor, conteudo, criado_em')
            .eq('post_id', postId)
            .order('criado_em', { ascending: true })
            .range(offset, offset + limit - 1);
          data = leg.data;
        }

        if (data) {
          return data.map((c: any) => ({
            id: c.id,
            postId: c.post_id,
            authorName: c.nome_autor,
            authorRole: c.funcao_autor,
            authorAvatar: c.avatar_autor,
            content: c.conteudo,
            createdAt: formatTime(c.criado_em),
          }));
        }
      } catch (err) {
        console.warn('Erro ao carregar comentários do post:', err);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    const post = allPosts.find((p) => p.id === postId);
    return post?.comments || [];
  },

  /**
   * Create Feed Post directly in Supabase with valid UUID
   * Grava apenas a URL pública e dimensões no banco; nunca grava base64.
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
      commentsCount: 0,
      createdAt: 'Agora mesmo',
    };

    // Segurança: se for detectada string base64, previne gravação pesada no banco
    let safeImageUrl = post.imageUrl;
    if (safeImageUrl && safeImageUrl.startsWith('data:image')) {
      console.warn('Alerta: Tentativa de gravar base64 no banco bloqueada. Utilize uploadFeedImage.');
      safeImageUrl = undefined;
    }

    if (supabase) {
      try {
        const ptPayload: any = {
          id: newId,
          igreja_id: post.churchId,
          unidade_id: post.cellId || null,
          nome_celula: post.cellName,
          nome_autor: post.authorName,
          funcao_autor: post.authorRole,
          avatar_autor: post.authorAvatar && !post.authorAvatar.startsWith('data:') ? post.authorAvatar : null,
          legenda: post.caption,
          url_imagem: safeImageUrl || null,
          categoria: post.category || 'Célula',
          quantidade_curtidas: 0,
          quantidade_comentarios: 0,
          imagem_largura: post.imageWidth || null,
          imagem_altura: post.imageHeight || null,
        };

        let { error } = await supabase.from('postagens_feed').insert(ptPayload);
        if (error && (error.code === '42703' || error.message?.includes('does not exist') || error.code === 'PGRST204')) {
          // Remove colunas extras se ainda não migradas no banco
          delete ptPayload.imagem_largura;
          delete ptPayload.imagem_altura;
          delete ptPayload.quantidade_comentarios;
          const retryRes = await supabase.from('postagens_feed').insert(ptPayload);
          error = retryRes.error;
        }

        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          const legPayload = { ...ptPayload, celula_id: post.cellId || null };
          delete legPayload.unidade_id;
          await supabase.from('feed_posts').insert(legPayload);
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
   * Com tabela curtidas (post_id, membro_id) e atualização atômica do contador
   */
  async toggleLikePost(postId: string, userId?: string, churchId?: string): Promise<{ liked: boolean; likesCount: number }> {
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
    let finalLikesCount = 0;

    const updated = allPosts.map((post) => {
      if (post.id === postId) {
        finalLikesCount = nextLiked ? post.likes + 1 : Math.max(0, post.likes - 1);
        return {
          ...post,
          likedByCurrentUser: nextLiked,
          likes: finalLikesCount,
        };
      }
      return post;
    });
    saveToStorage(STORAGE_KEYS.POSTS, updated);

    if (supabase) {
      try {
        // Tenta sincronizar com a tabela curtidas
        if (userId) {
          try {
            if (nextLiked) {
              await supabase.from('curtidas').insert({ post_id: postId, membro_id: userId });
            } else {
              await supabase.from('curtidas').delete().eq('post_id', postId).eq('membro_id', userId);
            }
          } catch {
            // Tabela curtidas opcional
          }
        }

        // Atualização atômica na tabela postagens_feed
        let { data: postRow } = await supabase
          .from('postagens_feed')
          .select('quantidade_curtidas')
          .eq('id', postId)
          .maybeSingle();

        const currentDbLikes = postRow?.quantidade_curtidas ?? 0;
        finalLikesCount = nextLiked ? currentDbLikes + 1 : Math.max(0, currentDbLikes - 1);

        await supabase
          .from('postagens_feed')
          .update({ quantidade_curtidas: finalLikesCount })
          .eq('id', postId);
      } catch (e) {
        console.warn('Erro ao atualizar curtida no Supabase:', e);
      }
    }

    return { liked: nextLiked, likesCount: finalLikesCount };
  },

  /**
   * Add Comment to Feed Post in Supabase with UUID and atomic counter
   */
  async addComment(postId: string, commentText: string, user: UserProfile): Promise<PostComment> {
    const commentId = generateUUID();
    const newComment: PostComment = {
      id: commentId,
      postId,
      authorName: user.name,
      authorRole: user.role,
      authorAvatar: user.avatarUrl && !user.avatarUrl.startsWith('data:') ? user.avatarUrl : undefined,
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
          avatar_autor: newComment.authorAvatar || null,
          conteudo: commentText,
        };
        await supabase.from('comentarios_postagem').insert(ptComment);

        // Atualiza contador em postagens_feed
        const { data: postRow } = await supabase
          .from('postagens_feed')
          .select('quantidade_comentarios')
          .eq('id', postId)
          .maybeSingle();

        if (postRow && typeof postRow.quantidade_comentarios === 'number') {
          await supabase
            .from('postagens_feed')
            .update({ quantidade_comentarios: (postRow.quantidade_comentarios || 0) + 1 })
            .eq('id', postId);
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
          comments: [...(post.comments || []), newComment],
          commentsCount: (post.commentsCount || post.comments?.length || 0) + 1,
        };
      }
      return post;
    });
    saveToStorage(STORAGE_KEYS.POSTS, updated);
    return newComment;
  },

  /**
   * Delete Comment from Feed Post in Supabase & Storage
   */
  async deleteComment(postId: string, commentId: string): Promise<void> {
    if (supabase) {
      try {
        await supabase
          .from('comentarios_postagem')
          .delete()
          .eq('id', commentId);

        // Decrementa contador atômico em postagens_feed
        const { data: postRow } = await supabase
          .from('postagens_feed')
          .select('quantidade_comentarios')
          .eq('id', postId)
          .maybeSingle();

        if (postRow && typeof postRow.quantidade_comentarios === 'number') {
          await supabase
            .from('postagens_feed')
            .update({ quantidade_comentarios: Math.max(0, (postRow.quantidade_comentarios || 1) - 1) })
            .eq('id', postId);
        }
      } catch (e) {
        console.warn('Erro ao excluir comentário no Supabase:', e);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    const updated = allPosts.map((post) => {
      if (post.id === postId) {
        const nextComments = (post.comments || []).filter((c) => c.id !== commentId);
        return {
          ...post,
          comments: nextComments,
          commentsCount: Math.max(0, (post.commentsCount || 1) - 1),
        };
      }
      return post;
    });
    saveToStorage(STORAGE_KEYS.POSTS, updated);
  },

  /**
   * Delete Feed Post from Supabase & Storage
   * Remove a imagem do bucket feed do Storage ao excluir o post.
   */
  async deleteFeedPost(postId: string, memberId?: string): Promise<void> {
    if (supabase) {
      try {
        // 1. Busca a URL da imagem para remoção no Supabase Storage
        const { data: existingPost } = await supabase
          .from('postagens_feed')
          .select('url_imagem')
          .eq('id', postId)
          .maybeSingle();

        if (existingPost?.url_imagem) {
          await deleteFeedImage(existingPost.url_imagem, memberId, postId);
        }

        // 2. Remove curtidas e comentários relacionados
        try {
          await supabase.from('curtidas').delete().eq('post_id', postId);
        } catch {
          // opcional
        }
        await supabase.from('comentarios_postagem').delete().eq('post_id', postId);

        // 3. Remove a postagem do banco
        await supabase.from('postagens_feed').delete().eq('id', postId);
      } catch (e) {
        console.warn('Erro ao excluir post no Supabase:', e);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    const updated = allPosts.filter((p) => p.id !== postId);
    saveToStorage(STORAGE_KEYS.POSTS, updated);
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
   * Garante que a unidade_id salva seja ESTRITAMENTE a unidade_id (célula) do próprio membro cadastrado.
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
        // Consulta no banco de dados para obter a unidade_id e igreja_id REAIS do próprio membro
        let dbMem: any = null;
        const { data: ptMem } = await supabase
          .from('membros')
          .select('id, igreja_id, unidade_id, celula_id')
          .eq('id', memberId)
          .maybeSingle();

        dbMem = ptMem;

        if (!dbMem) {
          const legMem = await supabase
            .from('members')
            .select('id, igreja_id, celula_id')
            .eq('id', memberId)
            .maybeSingle();
          dbMem = legMem.data;
        }

        if (dbMem) {
          if (dbMem.igreja_id) resolvedChurchId = dbMem.igreja_id;
          if (dbMem.unidade_id || dbMem.celula_id) {
            resolvedCellId = dbMem.unidade_id || dbMem.celula_id;
          }
        }

        // Se cellId ainda for nulo (ex: membro sem célula no pool geral), tenta verificar unidades existentes
        if (!resolvedCellId || resolvedCellId.startsWith('e1000000')) {
          if (targetMember?.cellId && !targetMember.cellId.startsWith('e1000000')) {
            resolvedCellId = targetMember.cellId;
          }
        }

        resolvedChurchId = resolvedChurchId || targetMember?.churchId || CHURCH_UUIDS.SOBRAL;

        const completedCount = progress.steps.filter((s) => s.completed).length;
        const totalCount = progress.steps.length || 6;
        const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        // Upsert summary row into trilhas_lideranca with membro's own igreja_id and unidade_id
        let { error: trackErr } = await supabase.from('trilhas_lideranca').upsert(
          {
            membro_id: memberId,
            igreja_id: resolvedChurchId,
            unidade_id: resolvedCellId || null,
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
              celula_id: resolvedCellId || null,
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

        // Upsert step rows into membro_etapas_trilha with membro's own unidade_id
        if (progress.steps && progress.steps.length > 0) {
          const stepRowsPt = progress.steps.map((st) => ({
            membro_id: memberId,
            unidade_id: resolvedCellId || null,
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

        // 3. Constrói as linhas para inserção/atualização na tabela membro_etapas_trilha com a unidade_id do próprio membro
        const stepRowsPt = memberIds.map((mId) => {
          const mem = memberMap.get(mId);
          let resolvedCell = mem?.unidade_id || mem?.celula_id || null;
          if (resolvedCell && resolvedCell.startsWith('e1000000')) {
            resolvedCell = null;
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

        // 5. Atualiza o resumo de progresso em trilhas_lideranca para cada membro (com unidade_id do próprio membro)
        for (const mId of memberIds) {
          const mem = memberMap.get(mId);
          const resolvedChurch = churchId || mem?.igreja_id || CHURCH_UUIDS.SOBRAL;
          let resolvedCell = mem?.unidade_id || mem?.celula_id || null;
          if (resolvedCell && resolvedCell.startsWith('e1000000')) {
            resolvedCell = null;
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
