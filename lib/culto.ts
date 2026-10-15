import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  requireSession,
  resolveChurchId,
  forbiddenChurch,
  requireAnyPermission,
  type SessionActor,
} from '@/lib/requireSession';

/**
 * Contagem de Cultos — regras compartilhadas pelas rotas /api/culto/*.
 *
 * Quem lança/edita/configura: permissão 'culto:gerenciar' (Gestor de Culto), 'church:admin',
 * Pastor ou Administrador do Sistema. Tudo é validado aqui no servidor.
 * Total = adultos + crianças (voluntários ficam à parte) — calculado pelo banco.
 */

/** Lançar contagens e ver a lista de lançamentos: Gestor de Culto. */
export const CULTO_PERMISSION_CODES = ['culto:gerenciar', 'church:admin'];
/** Cadastrar campus e horários (Configurações da Igreja): NÃO vem com o Gestor de Culto. */
export const CULTO_CONFIG_PERMISSION_CODES = ['culto:configurar', 'church:admin'];

export const COUNT_FIELDS = [
  ['adults', 'adultos', 'Adultos'],
  ['children', 'criancas', 'Crianças'],
  ['volunteers', 'voluntarios', 'Voluntários'],
  ['conversions', 'conversoes', 'Conversões'],
  ['reconciliations', 'reconciliacoes', 'Reconciliações'],
  ['guests', 'convidados', 'Convidados'],
] as const;

export interface CultoAuthorized {
  supabase: SupabaseClient;
  actor: SessionActor;
  churchId: string;
}

/** Sessão + igreja + permissão (por padrão, a de Gestor de Culto). Devolve a resposta de erro pronta se negar. */
export async function authorizeCulto(
  req: NextRequest,
  churchIdHint: string | null,
  permissionCodes: string[] = CULTO_PERMISSION_CODES
): Promise<CultoAuthorized | NextResponse> {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  const { actor } = auth;

  const churchId = resolveChurchId(actor, churchIdHint);
  if (!churchId) return forbiddenChurch();

  const permErr = await requireAnyPermission(actor, permissionCodes);
  if (permErr) return permErr;

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Banco de dados não configurado.' }, { status: 500 });
  }
  return { supabase, actor, churchId };
}

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília — usada para impedir lançar culto no futuro. */
export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Lê os seis números do corpo. Em `partial` só valida os que vieram; senão ausentes valem 0.
 * Devolve as colunas do banco ou uma mensagem de erro.
 */
export function parseCounts(body: any, partial: boolean): Record<string, number> | string {
  const out: Record<string, number> = {};
  for (const [key, column, label] of COUNT_FIELDS) {
    const raw = body?.[key];
    if (raw === undefined || raw === null || raw === '') {
      if (!partial) out[column] = 0;
      continue;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 100000) {
      return `${label}: informe um número inteiro entre 0 e 100.000.`;
    }
    out[column] = n;
  }
  return out;
}

export function parseNote(value: unknown): string | null | string[] {
  if (value === undefined) return [];
  const text = String(value ?? '').trim();
  if (text.length > 500) return ['A observação pode ter no máximo 500 caracteres.'];
  return text || null;
}

export function mapSchedule(row: any) {
  return {
    id: row.id as string,
    campusId: row.campus_id as string,
    name: row.nome as string,
    dayOfWeek: Number(row.dia_semana),
    time: String(row.hora || '').slice(0, 5),
    active: Boolean(row.ativo),
  };
}

export function mapCount(row: any, scheduleById: Map<string, { name: string; campusId: string }>, campusName: Map<string, string>) {
  const sched = scheduleById.get(row.horario_id);
  return {
    id: row.id as string,
    scheduleId: row.horario_id as string,
    scheduleName: sched?.name ?? '',
    campusId: sched?.campusId ?? '',
    campusName: sched ? campusName.get(sched.campusId) ?? '' : '',
    date: row.data_culto as string,
    adults: Number(row.adultos),
    children: Number(row.criancas),
    volunteers: Number(row.voluntarios),
    conversions: Number(row.conversoes),
    reconciliations: Number(row.reconciliacoes),
    guests: Number(row.convidados),
    total: Number(row.total),
    note: (row.observacao as string | null) ?? '',
    updatedAt: row.atualizado_em as string,
  };
}

/** Traduz erros comuns do banco em mensagens claras. */
export function friendlyDbError(error: { code?: string; message: string }): { status: number; message: string } {
  switch (error.code) {
    case '23505':
      return { status: 409, message: 'Já existe um registro igual (nome, horário ou data repetidos).' };
    case '23503':
      return { status: 409, message: 'Este item já tem lançamentos ou itens ligados a ele. Desative-o em vez de excluir.' };
    case '42P01':
      return { status: 500, message: 'As tabelas de culto ainda não foram criadas no banco.' };
    default:
      return { status: 500, message: error.message };
  }
}
