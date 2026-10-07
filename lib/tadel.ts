import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/config';
import { hasValidAdminSession } from '@/lib/adminSession';
import { getISOWeekAndYear } from '@/lib/dateUtils';
import type { TadelOccurrence, TadelSchedule, TadelWeek } from '@/types';

/**
 * Regras do TADEL (uso exclusivo no servidor, nas rotas /api/tadel*).
 *
 * - Horários são interpretados no fuso de Brasília/Fortaleza (UTC-03:00, sem horário de verão).
 * - Semana = domingo a sábado (mesma regra do Relatório Semanal), identificada pelo
 *   ano/semana ISO da quarta-feira.
 * - Basta UMA presença por semana, em qualquer um dos horários da igreja.
 */

export const TADEL_TZ_OFFSET = '-03:00';
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// ------------------------------------------------------------------------------
// Sessão
// ------------------------------------------------------------------------------

export interface TadelSessionMember {
  id: string | null; // null para o Administrador do Sistema (não é membro)
  churchId: string;
  name: string;
  role: string;
  roleId: string | null;
  isSystemAdmin: boolean;
}

/**
 * Identifica o usuário pela sessão do Supabase Auth (cookie), nunca por parâmetros
 * do cliente — assim um líder não consegue registrar presença por outro.
 * O Administrador do Sistema informa a igreja alvo via `churchIdHint`.
 */
export async function getTadelSessionMember(
  req: NextRequest,
  supabaseAdmin: SupabaseClient,
  churchIdHint?: string | null
): Promise<TadelSessionMember | null> {
  if (hasValidAdminSession(req)) {
    if (!churchIdHint) return null;
    return {
      id: null,
      churchId: churchIdHint,
      name: 'Administrador do Sistema',
      role: 'Administrador',
      roleId: null,
      isSystemAdmin: true,
    };
  }

  const ssrClient = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {
        // Rotas do TADEL não renovam cookies; /api/auth/session cuida disso.
      },
    },
  });

  // getClaims() valida a assinatura do JWT localmente (chaves assimétricas), sem ida ao
  // servidor de Auth a cada requisição; só recorre ao Auth quando não consegue validar localmente.
  const { data: claimsData } = await ssrClient.auth.getClaims();
  const claims: any = claimsData?.claims;
  if (!claims?.sub) return null;

  const { data: profileRows, error } = await supabaseAdmin.rpc('get_session_profile', {
    p_membro_id: claims.app_metadata?.membro_id || null,
    p_auth_user_id: claims.sub,
    p_login: claims.user_metadata?.login || null,
    p_email: claims.email ? String(claims.email).toLowerCase() : null,
  });
  if (error) {
    console.error('[tadel] Erro ao resolver sessão:', error);
    return null;
  }

  const member = Array.isArray(profileRows) ? profileRows[0] : profileRows;
  if (!member?.id || !member?.igreja_id) return null;

  return {
    id: member.id,
    churchId: member.igreja_id,
    name: member.nome || '',
    role: member.funcao || 'Membro',
    roleId: member.papel_id || null,
    isSystemAdmin: member.login === 'admin',
  };
}

/** Pastor, Administrador ou quem tiver church:admin / tadel:manage (papel ou permissão especial). */
export async function canManageTadel(
  supabase: SupabaseClient,
  member: TadelSessionMember
): Promise<boolean> {
  if (member.isSystemAdmin) return true;
  const roleNorm = normalize(member.role);
  if (roleNorm.includes('pastor') || roleNorm.includes('administrador')) return true;
  if (!member.id) return false;

  // Overrides do membro e permissões do papel em paralelo (uma ida ao banco)
  const codes = ['church:admin', 'tadel:manage'];
  const [{ data: overrides }, { data: rolePerms }] = await Promise.all([
    supabase
      .from('membro_permissoes')
      .select('permissao_id, concedida, permissao:permissoes!inner(codigo)')
      .eq('membro_id', member.id)
      .in('permissao.codigo', codes),
    member.roleId
      ? supabase
          .from('papel_permissoes')
          .select('permissao_id, permissao:permissoes!inner(codigo)')
          .eq('papel_id', member.roleId)
          .in('permissao.codigo', codes)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const overrideMap = new Map<string, boolean>();
  (overrides || []).forEach((o: any) => overrideMap.set(o.permissao_id, Boolean(o.concedida)));
  if (Array.from(overrideMap.values()).some(Boolean)) return true;

  return (rolePerms || []).some((rp: any) => overrideMap.get(rp.permissao_id) !== false);
}

// ------------------------------------------------------------------------------
// Configuração, níveis e líderes participantes
// ------------------------------------------------------------------------------

export interface TadelChurchConfig {
  name: string;
  configuredLevelIds: string[] | null;
  createdAt: string | null;
  schedules: TadelSchedule[];
}

export async function loadTadelConfig(
  supabase: SupabaseClient,
  churchId: string,
  includeInactive = false
): Promise<TadelChurchConfig> {
  const [{ data: config }, { data: rows }] = await Promise.all([
    supabase
      .from('tadel_configuracoes')
      .select('nome, niveis_participantes, criado_em')
      .eq('igreja_id', churchId)
      .maybeSingle(),
    supabase
      .from('tadel_horarios')
      .select('id, dia_semana, hora_inicio, minutos_antes, minutos_depois, local, ativo, criado_em')
      .eq('igreja_id', churchId)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true }),
  ]);

  const schedules = (rows || [])
    .filter((r: any) => includeInactive || r.ativo)
    .map(mapScheduleRow);

  const firstScheduleAt = (rows || [])
    .map((r: any) => r.criado_em as string)
    .sort()[0];

  return {
    name: config?.nome || 'TADEL',
    configuredLevelIds:
      Array.isArray(config?.niveis_participantes) && config.niveis_participantes.length > 0
        ? config.niveis_participantes
        : null,
    createdAt: config?.criado_em || firstScheduleAt || null,
    schedules,
  };
}

export function mapScheduleRow(r: any): TadelSchedule {
  return {
    id: r.id,
    dayOfWeek: r.dia_semana,
    startTime: String(r.hora_inicio || '').slice(0, 5),
    minutesBefore: r.minutos_antes,
    minutesAfter: r.minutos_depois,
    location: r.local || '',
    active: Boolean(r.ativo),
  };
}

export interface ChurchLevel {
  id: string;
  name: string;
  order: number;
}

export async function loadChurchLevels(supabase: SupabaseClient, churchId: string): Promise<ChurchLevel[]> {
  const { data } = await supabase
    .from('nivel_tipo')
    .select('id, nome, ordem')
    .eq('igreja_id', churchId)
    .order('ordem', { ascending: true });
  return (data || []).map((l: any) => ({ id: l.id, name: l.nome, order: l.ordem }));
}

/**
 * Padrão: os dois níveis mais baixos da hierarquia (maior "ordem"), ex.: Célula e Setor.
 * A igreja pode trocar/acrescentar níveis na configuração.
 */
export function resolveParticipatingLevelIds(levels: ChurchLevel[], configured: string[] | null): string[] {
  if (configured && configured.length > 0) {
    const valid = new Set(levels.map((l) => l.id));
    return configured.filter((id) => valid.has(id));
  }
  return [...levels]
    .sort((a, b) => b.order - a.order)
    .slice(0, 2)
    .map((l) => l.id);
}

export interface LeaderUnitLink {
  memberId: string;
  unitId: string;
  unitName: string;
  parentId: string | null;
  levelId: string;
}

/** Vínculos ativos de liderança (unidade_lideres) em unidades ativas da igreja. */
export async function loadLeaderLinks(
  supabase: SupabaseClient,
  churchId: string,
  opts: { memberId?: string; levelIds?: string[] } = {}
): Promise<LeaderUnitLink[]> {
  let query = supabase
    .from('unidade_lideres')
    .select('pessoa_id, unidade:unidades!inner(id, nome, pai_id, nivel_tipo_id, igreja_id, ativo)')
    .eq('ativo', true)
    .eq('unidade.igreja_id', churchId)
    .eq('unidade.ativo', true);

  if (opts.memberId) query = query.eq('pessoa_id', opts.memberId);
  if (opts.levelIds) {
    if (opts.levelIds.length === 0) return [];
    query = query.in('unidade.nivel_tipo_id', opts.levelIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[tadel] Erro ao buscar líderes:', error);
    return [];
  }

  return (data || []).map((row: any) => {
    const unit = Array.isArray(row.unidade) ? row.unidade[0] : row.unidade;
    return {
      memberId: row.pessoa_id,
      unitId: unit.id,
      unitName: unit.nome,
      parentId: unit.pai_id,
      levelId: unit.nivel_tipo_id,
    };
  });
}

// ------------------------------------------------------------------------------
// Datas, semanas e janelas de check-in
// ------------------------------------------------------------------------------

function normalize(value: string): string {
  return (value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  return toDateStr(new Date(Date.parse(`${dateStr}T00:00:00Z`) + days * DAY_MS));
}

/** Data local (YYYY-MM-DD) no fuso da igreja. */
export function localDateStr(nowMs: number = Date.now()): string {
  return toDateStr(new Date(nowMs + TZ_OFFSET_MS));
}

/** Semana (domingo a sábado) que contém a data informada. */
export function getTadelWeek(dateStr: string): TadelWeek {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  const startDate = addDays(dateStr, -dow);
  const endDate = addDays(startDate, 6);
  const iso = getISOWeekAndYear(addDays(startDate, 3));
  const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return {
    startDate,
    endDate,
    year: iso.year,
    week: iso.week,
    label: `${br(startDate)} a ${br(endDate)}/${endDate.slice(0, 4)}`,
  };
}

export function shiftWeek(week: TadelWeek, weeks: number): TadelWeek {
  return getTadelWeek(addDays(week.startDate, weeks * 7));
}

export function buildOccurrence(schedule: TadelSchedule, week: TadelWeek, nowMs: number): TadelOccurrence {
  const date = addDays(week.startDate, schedule.dayOfWeek);
  const startMs = Date.parse(`${date}T${schedule.startTime}:00${TADEL_TZ_OFFSET}`);
  const opensMs = startMs - schedule.minutesBefore * 60_000;
  const closesMs = startMs + schedule.minutesAfter * 60_000;
  return {
    scheduleId: schedule.id,
    date,
    startTime: schedule.startTime,
    location: schedule.location,
    opensAt: new Date(opensMs).toISOString(),
    closesAt: new Date(closesMs).toISOString(),
    status: nowMs < opensMs ? 'upcoming' : nowMs > closesMs ? 'closed' : 'open',
  };
}

/** Horário com janela aberta agora (considera a semana anterior para janelas que viram a meia-noite de sábado). */
export function findOpenOccurrence(
  schedules: TadelSchedule[],
  nowMs: number = Date.now()
): TadelOccurrence | null {
  const current = getTadelWeek(localDateStr(nowMs));
  for (const week of [current, shiftWeek(current, -1)]) {
    for (const schedule of schedules) {
      const occ = buildOccurrence(schedule, week, nowMs);
      if (occ.status === 'open') return occ;
    }
  }
  return null;
}

export function describeSchedule(schedule: Pick<TadelSchedule, 'dayOfWeek' | 'startTime'>): string {
  return `${WEEKDAY_SHORT[schedule.dayOfWeek] || ''} ${schedule.startTime}`;
}

export function mapAttendanceRow(row: any, schedules: TadelSchedule[]) {
  const schedule = schedules.find((s) => s.id === row.horario_id);
  return {
    date: row.data_encontro,
    scheduleId: row.horario_id || null,
    startTime: schedule?.startTime || null,
    registeredAt: row.registrado_em,
  };
}
