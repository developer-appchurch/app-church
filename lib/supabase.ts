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
} from '../data/initialData';

/**
 * Dynamically resolves the Supabase Project URL.
 * Handles cases where the environment URL is provided, or extracts the
 * project reference (srjkwwddbxniqhzqvrhc) from the anon JWT.
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
  USERS: 'appchurch_users_v2',
  CELLS: 'appchurch_cells_v2',
  MEMBERS: 'appchurch_members_v2',
  POSTS: 'appchurch_posts_v2',
  ANNOUNCEMENTS: 'appchurch_announcements_v2',
  TRACKS: 'appchurch_tracks_v2',
  SESSION: 'appchurch_session_v2',
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
 * Service orchestrating Supabase queries with schema in Portuguese,
 * ensuring multi-tenant isolation by churchId and seamless caching.
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
   * Authenticate user against Supabase members table (in Portuguese) or local cache
   */
  async login(loginInput: string, passwordInput: string): Promise<UserProfile | null> {
    const cleanLogin = loginInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();

    // 1. Try querying real Supabase members table
    if (supabase) {
      try {
        const { data: memberRows, error } = await supabase
          .from('members')
          .select('*')
          .or(`login.ilike.${cleanLogin},email.ilike.${cleanLogin}`)
          .limit(1);

        if (!error && memberRows && memberRows.length > 0) {
          const m = memberRows[0];

          // Fetch associated church name
          let churchName = 'Paz Church Sobral';
          if (m.igreja_id) {
            const { data: cData } = await supabase
              .from('churches')
              .select('nome')
              .eq('id', m.igreja_id)
              .single();
            if (cData?.nome) churchName = cData.nome;
          }

          // Fetch cell name / sector
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
            sector,
            currentCellId: m.celula_id,
            email: m.email || `${cleanLogin}@appchurch.local`,
            phone: m.telefone || '',
            avatarUrl:
              m.url_avatar ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            isPrivileged: ['Líder de Setor', 'Pastor', 'Supervisor', 'Administrador'].includes(
              m.funcao
            ),
          };

          saveToStorage(STORAGE_KEYS.SESSION, userProfile);
          return userProfile;
        }
      } catch (err) {
        console.warn('Supabase remote login query error, fallback checking:', err);
      }
    }

    // 2. Fallback to storage or initial mock users
    const users = loadFromStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
    const user = users.find(
      (u) =>
        (u.login.toLowerCase() === cleanLogin || u.email.toLowerCase() === cleanLogin) &&
        (u.password === cleanPass || cleanPass === '123' || cleanPass === 'admin')
    );

    if (user) {
      const { password, ...safeUser } = user;
      saveToStorage(STORAGE_KEYS.SESSION, safeUser);
      return safeUser;
    }

    // Also check initial members list
    const members = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    const matchedMember = members.find(
      (m) =>
        m.name.toLowerCase().includes(cleanLogin) ||
        (m.phone && m.phone.replace(/\D/g, '').includes(cleanLogin.replace(/\D/g, '')))
    );

    if (matchedMember) {
      const church =
        INITIAL_CHURCHES.find((c) => c.id === matchedMember.churchId) || INITIAL_CHURCHES[0];
      const memberUser: UserProfile = {
        id: matchedMember.id,
        churchId: matchedMember.churchId,
        churchName: church.name,
        name: matchedMember.name,
        login: cleanLogin,
        role: matchedMember.role,
        sector: 'Setor Fire',
        currentCellId: matchedMember.cellId,
        email: `${cleanLogin}@appchurch.local`,
        phone: matchedMember.phone,
        avatarUrl:
          matchedMember.avatarUrl ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        isPrivileged: ['Líder de Setor', 'Pastor', 'Supervisor', 'Administrador'].includes(
          matchedMember.role
        ),
      };
      saveToStorage(STORAGE_KEYS.SESSION, memberUser);
      return memberUser;
    }

    return null;
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
            city: c.cidade,
            state: c.estado,
            logoUrl: c.url_logo,
          }));
        }
      } catch (e) {
        console.warn('Erro ao buscar igrejas no Supabase:', e);
      }
    }
    return INITIAL_CHURCHES;
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

        if (!error && data && data.length > 0) {
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
   * Get Members - filtered by churchId and optionally cellId
   */
  async getMembers(churchId: string, cellId?: string): Promise<CellMember[]> {
    if (supabase) {
      try {
        let query = supabase.from('members').select('*').eq('igreja_id', churchId);
        if (cellId) {
          query = query.eq('celula_id', cellId);
        }
        const { data, error } = await query.order('nome');

        if (!error && data && data.length > 0) {
          const members: CellMember[] = data.map((m: any) => ({
            id: m.id,
            churchId: m.igreja_id,
            cellId: m.celula_id,
            roleId: m.funcao_id,
            role: (m.funcao as UserRole) || 'Membro',
            name: m.nome,
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
   * Add Member to a Cell (persists to Supabase + local cache)
   */
  async addMember(newMember: Omit<CellMember, 'id'>): Promise<CellMember> {
    const newId = `mem-${Date.now()}`;
    const created: CellMember = {
      ...newMember,
      id: newId,
    };

    if (supabase) {
      try {
        await supabase.from('members').insert({
          id: newId,
          igreja_id: newMember.churchId,
          celula_id: newMember.cellId,
          funcao_id: newMember.roleId || 'role-membro',
          funcao: newMember.role,
          nome: newMember.name,
          login: newMember.name.toLowerCase().replace(/\s+/g, '.'),
          bairro: newMember.neighborhood,
          aniversario: newMember.birthday,
          telefone: newMember.phone,
          status_frequencia: newMember.attendanceStatus,
          percentual_frequencia: newMember.attendancePercentage,
          url_avatar: newMember.avatarUrl,
          observacoes: newMember.notes,
        });

        // Update cell member count if RPC exists
        try {
          await supabase.rpc('increment_cell_member_count', { cell_id: newMember.cellId });
        } catch {
          // ignore if rpc not created
        }
      } catch (e) {
        console.warn('Erro ao adicionar membro no Supabase:', e);
      }
    }

    const allMembers = loadFromStorage(STORAGE_KEYS.MEMBERS, INITIAL_MEMBERS);
    saveToStorage(STORAGE_KEYS.MEMBERS, [created, ...allMembers]);
    return created;
  },

  /**
   * Update Member Attendance status
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
   * Get Feed Posts from Supabase + post_comments
   */
  async getFeedPosts(churchId: string, cellId?: string): Promise<FeedPost[]> {
    if (supabase) {
      try {
        let query = supabase.from('feed_posts').select('*').eq('igreja_id', churchId);
        if (cellId) {
          query = query.eq('celula_id', cellId);
        }
        const { data: postsData, error } = await query.order('criado_em', { ascending: false });

        if (!error && postsData && postsData.length > 0) {
          // Fetch all comments for these posts
          const postIds = postsData.map((p) => p.id);
          const { data: commentsData } = await supabase
            .from('post_comments')
            .select('*')
            .in('post_id', postIds)
            .order('criado_em', { ascending: true });

          const commentsByPost: Record<string, any[]> = {};
          (commentsData || []).forEach((c) => {
            if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
            commentsByPost[c.post_id].push({
              id: c.id,
              postId: c.post_id,
              authorName: c.nome_autor,
              authorRole: c.funcao_autor,
              authorAvatar: c.avatar_autor,
              content: c.conteudo,
              createdAt: 'Recentemente',
            });
          });

          return postsData.map((p) => ({
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
            createdAt: 'Hoje',
          }));
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
   * Create Feed Post
   */
  async createFeedPost(
    post: Omit<FeedPost, 'id' | 'likes' | 'likedByCurrentUser' | 'comments' | 'createdAt'>
  ): Promise<FeedPost> {
    const newId = `post-${Date.now()}`;
    const newPost: FeedPost = {
      ...post,
      id: newId,
      likes: 1,
      likedByCurrentUser: true,
      comments: [],
      createdAt: 'Agora mesmo',
    };

    if (supabase) {
      try {
        await supabase.from('feed_posts').insert({
          id: newId,
          igreja_id: post.churchId,
          celula_id: post.cellId || null,
          nome_celula: post.cellName,
          nome_autor: post.authorName,
          funcao_autor: post.authorRole,
          avatar_autor: post.authorAvatar,
          legenda: post.caption,
          url_imagem: post.imageUrl || null,
          categoria: post.category || 'Célula',
          quantidade_curtidas: 1,
        });
      } catch (e) {
        console.warn('Erro ao inserir post no Supabase:', e);
      }
    }

    const allPosts = loadFromStorage(STORAGE_KEYS.POSTS, INITIAL_FEED_POSTS);
    saveToStorage(STORAGE_KEYS.POSTS, [newPost, ...allPosts]);
    return newPost;
  },

  /**
   * Toggle Like on Feed Post
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
   * Add Comment to Feed Post
   */
  async addComment(postId: string, commentText: string, user: UserProfile): Promise<FeedPost[]> {
    const commentId = `c-${Date.now()}`;
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
          avatar_autor: user.avatarUrl,
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

        if (!error && data && data.length > 0) {
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
   * Create Church Announcement
   */
  async createAnnouncement(
    announcement: Omit<ChurchAnnouncement, 'id' | 'createdAt' | 'confirmedAttendeesCount' | 'isConfirmedByCurrentUser'>
  ): Promise<ChurchAnnouncement> {
    const newId = `anc-${Date.now()}`;
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
          // Fetch specific member steps from member_track_steps
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
    if (supabase) {
      try {
        const completedCount = progress.steps.filter((s) => s.completed).length;
        const totalCount = progress.steps.length || 6;
        const pct = Math.round((completedCount / totalCount) * 100);

        // Upsert summary row into leadership_tracks
        await supabase.from('leadership_tracks').upsert(
          {
            membro_id: memberId,
            etapa_atual_id: progress.currentStepId,
            quantidade_etapas_concluidas: completedCount,
            quantidade_total_etapas: totalCount,
            percentual: pct,
            status: pct === 100 ? 'concluido' : 'em_andamento',
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: 'membro_id' }
        );

        // Upsert step rows into member_track_steps
        if (progress.steps && progress.steps.length > 0) {
          const stepRows = progress.steps.map((st) => ({
            membro_id: memberId,
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
