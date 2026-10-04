import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';

/**
 * Sessão do Administrador do Sistema (login "admin"). Uso exclusivo no servidor (rotas de API).
 *
 * - A senha NUNCA fica no código: o servidor compara com o hash bcrypt da
 *   variável de ambiente ADMIN_PASSWORD_HASH. Sem essa variável, o login de
 *   administrador fica desativado.
 * - O cookie de sessão é assinado (HMAC-SHA256) e expira. Antes o cookie era
 *   apenas "true" e qualquer pessoa podia criá-lo no navegador.
 * - A assinatura inclui o hash da senha: trocar a senha derruba todas as
 *   sessões de administrador abertas.
 */

export const ADMIN_LOGIN = 'admin';
export const ADMIN_SESSION_COOKIE = 'appchurch_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

function getAdminPasswordHash(): string | null {
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  return hash && hash.startsWith('$2') ? hash : null;
}

/** Segredo de assinatura: ADMIN_SESSION_SECRET ou, na falta dele, derivado da service role key. */
function getSigningSecret(): Buffer | null {
  const explicit = process.env.ADMIN_SESSION_SECRET?.trim();
  if (explicit) return Buffer.from(explicit, 'utf8');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;
  return crypto.createHmac('sha256', serviceKey).update('appchurch-admin-session-v1').digest();
}

function sign(payload: string): string | null {
  const secret = getSigningSecret();
  const passwordHash = getAdminPasswordHash();
  if (!secret || !passwordHash) return null;
  return crypto
    .createHmac('sha256', secret)
    .update(`${payload}|${passwordHash}`)
    .digest('base64url');
}

/** Retorna true se o login de administrador está configurado no servidor. */
export function isAdminLoginConfigured(): boolean {
  return Boolean(getAdminPasswordHash() && getSigningSecret());
}

/** Confere a senha do administrador contra ADMIN_PASSWORD_HASH (comparação bcrypt). */
export function verifyAdminPassword(password: string): boolean {
  const hash = getAdminPasswordHash();
  if (!hash || !password) return false;
  try {
    return bcrypt.compareSync(password, hash);
  } catch {
    return false;
  }
}

/** Gera o valor do cookie de sessão do administrador: "<expira_em>.<assinatura>". */
export function createAdminSessionToken(): string | null {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS;
  const payload = `${ADMIN_LOGIN}.${expiresAt}`;
  const signature = sign(payload);
  return signature ? `${expiresAt}.${signature}` : null;
}

/** Valida o cookie de sessão do administrador (assinatura e validade). */
export function isValidAdminSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [expiresAtRaw, signature] = token.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (!expiresAtRaw || !signature || !Number.isFinite(expiresAt)) return false;
  if (expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = sign(`${ADMIN_LOGIN}.${expiresAt}`);
  if (!expected) return false;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function hasValidAdminSession(req: NextRequest): boolean {
  return isValidAdminSessionToken(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}
