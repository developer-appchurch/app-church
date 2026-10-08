export type AttendanceStatus = 'green' | 'yellow' | 'red' | 'black';

export type UserRole =
  | 'Membro'
  | 'Discipulador'
  | 'Discipulador em Treinamento'
  | 'Líder em Treinamento'
  | 'Líder em treinamento'
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
  module:
    | 'Célula'
    | 'Membros'
    | 'Frequência'
    | 'Trilho'
    | 'Relatórios'
    | 'Feed'
    | 'Admin'
    | 'Administração'
    | 'Segurança'
    | 'Estrutura'
    | 'Comunicação'
    | 'Liderança'
    | 'Comunidade'
    | (string & {});
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
 * Override individual de permissão por membro (membro_permissoes)
 */
export interface MemberPermissionRecord {
  memberId: string;
  permissionId: string;
  concedida: boolean;
  concedidaEm?: string;
}

/**
 * Permissão avaliada com regra de prioridade para a tela de permissões
 */
export interface MemberEffectivePermission {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string;
  inherited: boolean;
  override: boolean | null; // null = padrão do papel, true = concedida explicitamente, false = revogada explicitamente
  effective: boolean;
}

/**
 * Catálogo de Bairros por Igreja (public.bairros)
 */
export interface Neighborhood {
  id: string;
  churchId: string;
  name: string;
  active: boolean;
  usageCount: number; // quantos membros/células usam esse nome hoje
  createdAt?: string;
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
  cellId?: string;
  cellName?: string;
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
  leaderNames?: string[];
  sectorName: string;
  address: string;
  bairro?: string;
  fotoUrl?: string;
  meetingDay: string;
  meetingTime: string;
  memberCount: number;
  quantidade_membros?: number;
  parentUnitId?: string | null;
  parentName?: string;
  areaName?: string;
  areaUnitId?: string | null;
  leaderMemberIds?: string[];
  unidade_criadora_id?: string | null;
  unidade_mae_id?: string | null;
  motherCellId?: string;
  motherCellName?: string;
}

export interface CellMember {
  id: string;
  churchId: string;
  cellId: string; // Pertence à Célula
  cellName?: string;
  name: string;
  login?: string; // Login exclusivo para autenticação na aplicação
  password?: string; // Senha para acesso à aplicação
  assignLogin?: boolean; // Usado apenas no cadastro: true = provisionar login/senha agora; false/ausente = membro sem acesso ao app
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
  authorId?: string; // Vínculo com membros.id, usado para buscar a foto atual do autor
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
  authorId?: string; // Vínculo com membros.id, usado para buscar a foto atual do autor
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
  | 'our_cells'
  | 'multiply_cell'
  | 'leadership_track'
  | 'reports'
  | 'register_church'
  | 'hierarchy_units'
  | 'member_pool'
  | 'church_overview'
  | 'permissions_manage'
  | 'church_settings'
  | 'church_indicators'
  | 'tadel'
  | 'rankings';

export interface CelulaCardItem {
  id: string;
  unidadeId: string;
  churchId: string;
  nome: string;
  bairro: string;
  endereco: string;
  diaSemana: string;
  horario: string;
  fotoUrl?: string;
  memberCount: number;
  quantidade_membros?: number;
  leaderNames: string[];
  leaderMemberIds?: string[];
  sectorName?: string;
  areaName?: string;
}

export interface CelulasQueryParams {
  churchId: string;
  search?: string;
  diaSemana?: string;
  page?: number;
  pageSize?: number;
}

export interface CelulasPaginationResult {
  celulas: CelulaCardItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

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
  leaderCount?: number;
  meetingDay?: string;
  meetingTime?: string;
  neighborhood?: string;
  address?: string;
  fotoUrl?: string;
  latitude?: number;
  longitude?: number;
  memberCount: number;
  quantidade_membros?: number;
  createdAt?: string;
  createdByMemberId?: string;
  unidade_criadora_id?: string | null;
  unidade_mae_id?: string | null;
  motherCellId?: string;
  motherCellName?: string;
}

export interface CreateUnitInput {
  churchId: string;
  levelTypeId: string;
  name: string;
  parentId: string | null;
  leaderMemberIds?: string[];
  leaderNames?: string[];
  setAsHomeCell?: boolean;
  // Specific to leaf / cell level:
  neighborhood?: string;
  address?: string;
  meetingDay?: string;
  meetingTime?: string;
  latitude?: number;
  longitude?: number;
  fotoUrl?: string;
  createdByMemberId?: string;
  unidade_criadora_id?: string | null;
  unidade_mae_id?: string | null;
  motherCellId?: string;
  motherCellName?: string;
}

export interface UpdateUnitLeadersInput {
  unitId: string;
  churchId: string;
  leaderMemberIds: string[];
  setAsHomeCell?: boolean;
}

export interface RegisterChurchInput {
  // Gerado no navegador antes do envio apenas para correlacionar o upload do
  // logotipo (Storage) com a igreja que será criada; se ausente, o servidor gera um novo.
  churchId?: string;
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

export interface WeeklyReport {
  id: string;
  igreja_id: string;
  unidade_id: string;
  lancado_por?: string;
  lancado_por_nome?: string;
  data_relatorio: string;
  ano_iso?: number;
  numero_semana?: number;
  houve_reuniao?: boolean;
  valor_pix?: number | string | null;
  valor_especie?: number | string | null;
  qtd_membros: number;
  qtd_convidados?: number | null;
  qtd_criancas?: number | null;
  observacao?: string | null;
  supervisao?: boolean;
  tesouraria_recebido?: boolean;
  criado_em?: string;
  atualizado_em?: string;
  // Campos parseados
  tema_estudo?: string;
  pedidos_oracao?: string;
  visitantes?: number;
  oferta?: string;
  presentes_ids?: string[];
  presentes_nomes?: Record<string, string>;
  presentes_membros?: { id: string; nome: string }[];
  /** Nomes de quem estava presente mas depois foi excluído do cadastro */
  presentes_excluidos?: string[];
  observacao_texto?: string;
}


// ==============================================================================
// TADEL — Presença dos líderes
// ==============================================================================

export interface TadelSchedule {
  id: string;
  dayOfWeek: number; // 0 = domingo ... 6 = sábado
  startTime: string; // "HH:mm"
  minutesBefore: number;
  minutesAfter: number;
  location: string;
  active: boolean;
}

export type TadelOccurrenceStatus = 'upcoming' | 'open' | 'closed';

export interface TadelOccurrence {
  scheduleId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "HH:mm"
  location: string;
  opensAt: string; // ISO
  closesAt: string; // ISO
  status: TadelOccurrenceStatus;
}

export interface TadelWeek {
  startDate: string; // domingo YYYY-MM-DD
  endDate: string; // sábado YYYY-MM-DD
  year: number;
  week: number;
  label: string;
}

export interface TadelAttendanceRecord {
  date: string;
  scheduleId: string | null;
  startTime: string | null;
  registeredAt: string;
}

export interface TadelHistoryItem {
  week: TadelWeek;
  attendance: TadelAttendanceRecord | null;
}

export interface TadelStatusResponse {
  configured: boolean;
  name: string;
  eligible: boolean;
  eligibleUnits: { id: string; name: string; levelName: string }[];
  currentWeek: TadelWeek;
  occurrences: TadelOccurrence[];
  currentAttendance: TadelAttendanceRecord | null;
  history: TadelHistoryItem[];
  frequency: { present: number; total: number; percentage: number };
  canSupervise: boolean;
  canManage: boolean;
}

export interface TadelSupervisionLeader {
  memberId: string;
  name: string;
  avatarUrl: string | null;
  units: { id: string; name: string; levelName: string }[];
  attendance: TadelAttendanceRecord | null;
}

export interface TadelSupervisionResponse {
  name: string;
  week: TadelWeek;
  schedules: TadelSchedule[];
  leaders: TadelSupervisionLeader[];
  countsBySchedule: Record<string, number>;
}

export interface TadelConfigResponse {
  name: string;
  participatingLevelIds: string[];
  usingDefaultLevels: boolean;
  levels: { id: string; name: string; order: number }[];
  schedules: TadelSchedule[];
}
