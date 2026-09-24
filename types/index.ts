export type AttendanceStatus = 'green' | 'yellow' | 'red' | 'black';

export type UserRole =
  | 'Membro'
  | 'Discipulador'
  | 'Discipulador em Treinamento'
  | 'Líder em Treinamento'
  | 'Líder de Célula'
  | 'Líder de Setor'
  | 'Líder de Área'
  | 'Líder de Rede'
  | 'Líder de Distrito'
  | 'Pastor'
  | 'Pastor(a)'
  | 'Supervisor'
  | 'Administrador'
  | 'Anfitrião'
  | 'Intercessor'
  | 'Secretário'
  | (string & {});

/**
 * Tabela de Funções (Roles)
 */
export interface Role {
  id: string; // e.g. 'role-membro', 'role-lider-celula'
  name: UserRole;
  slug: string;
  description: string;
  hierarchyLevel: number;
  badgeColor?: string;
  createdAt?: string;
}

/**
 * Tabela de Permissões (Permissions)
 */
export interface Permission {
  id: string;
  code: string; // e.g. 'cell:view', 'cell:manage', 'track:update'
  name: string;
  module: 'Célula' | 'Membros' | 'Frequência' | 'Trilho' | 'Relatórios' | 'Feed' | 'Admin';
  description: string;
}

/**
 * Relação Função <-> Permissão
 */
export interface RolePermission {
  roleId: string;
  permissionId: string;
}

/**
 * Tabela de Etapas do Trilho de Liderança (etapa_trilhos)
 */
export interface TrackStep {
  id: number | string;
  id_igreja?: string;
  churchId?: string;
  stepNumber: number;
  title: string;
  description: string;
  required: boolean;
}

/**
 * Progresso específico de uma etapa do trilho para um membro (member_track_steps)
 */
export interface MemberTrackStepRecord {
  id?: string;
  memberId: string;
  cellId: string;
  stepId: number | string;
  completed: boolean;
  completedAt?: string;
  notes?: string;
  validatedBy?: string;
}

export interface Church {
  id: string; // e.g. 'church-sobral', 'church-jaibaras'
  name: string; // e.g. 'Paz Church Sobral', 'Paz Church Jaibaras'
  slug: string;
  cnpj?: string;
  city: string;
  state: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface UserProfile {
  id: string;
  churchId: string;
  churchName: string;
  name: string;
  login: string;
  role: UserRole;
  roleId?: string;
  permissions?: string[];
  sector: string;
  currentCellId: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  isPrivileged?: boolean; // Can post church-wide general notices (Líder de Setor, Pastor, etc.)
  isSystemAdmin?: boolean; // Administrador do Sistema com acesso a cadastros de congregações
}

export interface CellGroup {
  id: string;
  churchId: string;
  name: string;
  leaderName: string;
  sectorName: string;
  address: string;
  meetingDay: string;
  meetingTime: string;
  memberCount: number;
  parentUnitId?: string | null;
  parentName?: string;
  areaName?: string;
  areaUnitId?: string | null;
  leaderMemberIds?: string[];
}

export interface CellMember {
  id: string;
  churchId: string;
  cellId: string; // Pertence à Célula
  cellName?: string;
  name: string;
  login?: string; // Login exclusivo para autenticação na aplicação
  password?: string; // Senha para acesso à aplicação
  roleId?: string; // Tabela de Funções
  role: UserRole;
  permissions?: string[]; // Permissões herdadas e/ou customizadas
  neighborhood: string;
  birthday: string; // "dd/MM"
  birthDateFull?: string;
  phone?: string;
  email?: string;
  attendanceStatus: AttendanceStatus;
  attendancePercentage: number;
  avatarUrl?: string;
  authUserId?: string;
  auth_user_id?: string;
  notes?: string;
  trackProgress?: {
    currentStepId: number;
    completedStepsCount: number;
    totalStepsCount: number;
    percentage: number;
  };
}

export interface LeadershipTrackStep {
  id: number | string;
  stepNumber?: number;
  title: string;
  description: string;
  completed: boolean;
  completedAt?: string;
  notes?: string;
  validatedBy?: string;
}

export interface LeadershipTrackProgress {
  memberId: string;
  churchId?: string;
  currentStepId: number;
  steps: LeadershipTrackStep[];
}

export interface PostComment {
  id: string;
  postId: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
}

export interface FeedPost {
  id: string;
  churchId: string; // Strictly isolates posts per church
  cellId: string;
  cellName: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  createdAt: string;
  created_at_raw?: string;
  caption: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  likes: number;
  likedByCurrentUser: boolean;
  comments: PostComment[];
  commentsCount?: number;
  category?: 'Célula' | 'Comunhão' | 'Batismo' | 'Testemunho' | 'Liderança' | 'Jejum & Oração';
  isPending?: boolean;
  uploadProgress?: number;
  isError?: boolean;
}

export interface ChurchAnnouncement {
  id: string;
  churchId: string; // Strictly isolates announcements per church
  title: string;
  content: string;
  imageUrl?: string;
  authorName: string;
  authorRole: string;
  authorAvatar?: string;
  eventDate?: string;
  eventTime?: string;
  location?: string;
  category: 'Geral' | 'Conferência' | 'Encontro com Deus' | 'Culto Especial' | 'Treinamento' | 'Social';
  isImportant?: boolean;
  createdAt: string;
  confirmedAttendeesCount?: number;
  isConfirmedByCurrentUser?: boolean;
}

export type ActiveScreen =
  | 'login'
  | 'feed'
  | 'my_cell'
  | 'leadership_track'
  | 'reports'
  | 'register_church'
  | 'hierarchy_units'
  | 'member_pool'
  | 'church_overview';

export interface HierarchicalLevelInput {
  id?: string;
  name: string;
  order: number;
}

export interface ChurchHierarchicalLevel {
  id: string;
  churchId: string;
  name: string;
  order: number;
  isRoot: boolean;
  isLeaf: boolean;
}

export interface UnitLeader {
  id: string;
  name: string;
  role?: string;
  avatarUrl?: string;
  phone?: string;
}

export interface OrganizationalUnit {
  id: string;
  churchId: string;
  levelTypeId: string;
  levelTypeName: string;
  levelOrder: number;
  name: string;
  parentId: string | null;
  parentName?: string;
  isActive: boolean;
  leaders: UnitLeader[];
  meetingDay?: string;
  meetingTime?: string;
  neighborhood?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  memberCount: number;
  createdAt?: string;
}

export interface CreateUnitInput {
  churchId: string;
  levelTypeId: string;
  name: string;
  parentId: string | null;
  leaderMemberIds?: string[];
  leaderNames?: string[];
  // Specific to leaf / cell level:
  neighborhood?: string;
  address?: string;
  meetingDay?: string;
  meetingTime?: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateUnitLeadersInput {
  unitId: string;
  churchId: string;
  leaderMemberIds: string[];
}

export interface RegisterChurchInput {
  name: string;
  cnpj?: string;
  city: string;
  state: string;
  logoUrl?: string;
  levels: HierarchicalLevelInput[];
  pastorName: string;
  pastorPhone?: string;
  pastorEmail?: string;
  pastorLogin: string;
  pastorPassword: string;
}

export interface RegisterChurchResult {
  church: Church;
  pastor: UserProfile;
  levels: HierarchicalLevelInput[];
  seedCell?: CellGroup;
  initialPasswordGenerated?: string;
}
