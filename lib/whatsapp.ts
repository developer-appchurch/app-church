/**
 * Telefones brasileiros para WhatsApp.
 * Os cadastros vêm em formatos variados (com +55, com 0 na frente, celular antigo sem o 9...).
 * Só consideramos válido um celular com DDD: 55 + DDD + 9 + 8 dígitos.
 */

export type PhoneCheck =
  | { valid: true; e164: string; display: string }
  | { valid: false; reason: 'empty' | 'no-ddd' | 'landline' | 'invalid' };

export function checkBrazilMobile(raw?: string | null): PhoneCheck {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return { valid: false, reason: 'empty' };

  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2); // +55
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1); // 0 + DDD
  if (d.length === 8 || d.length === 9) return { valid: false, reason: 'no-ddd' };

  const ddd = d.slice(0, 2);
  if (!/^[1-9][1-9]$/.test(ddd)) return { valid: false, reason: 'invalid' };
  let local = d.slice(2);

  // Celular antigo sem o 9 (8 dígitos começando com 6–9)
  if (local.length === 8) {
    if (!/^[6-9]/.test(local)) return { valid: false, reason: 'landline' };
    local = `9${local}`;
  }
  if (local.length !== 9 || !local.startsWith('9')) return { valid: false, reason: 'invalid' };

  return {
    valid: true,
    e164: `55${ddd}${local}`,
    display: `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`,
  };
}

export const PHONE_PROBLEM_LABEL: Record<Exclude<PhoneCheck, { valid: true }>['reason'], string> = {
  empty: 'Sem telefone cadastrado',
  'no-ddd': 'Número sem DDD — corrija o cadastro',
  landline: 'Telefone fixo — sem WhatsApp',
  invalid: 'Número incompleto ou inválido — corrija o cadastro',
};

const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || '';

/** Link do WhatsApp com a mensagem de boas-vindas já escrita. */
export function whatsappLink(e164: string, memberName: string, leaderName?: string | null, churchName?: string | null) {
  const leader = firstName(leaderName);
  const intro = [leader && `Aqui é ${leader}`, churchName && `da ${churchName}`].filter(Boolean).join(', ');
  const text = `Olá, ${firstName(memberName)}!${intro ? ` ${intro}.` : ''} Tudo bem com você?`;
  return `https://wa.me/${e164}?text=${encodeURIComponent(text)}`;
}
