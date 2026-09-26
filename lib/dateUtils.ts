/**
 * Utilitários para cálculo e manipulação de datas e semanas de relatórios no AppChurch.
 * Regra: Semana começa no domingo (início da semana) e termina no sábado.
 * Na segunda-feira pela manhã, o sistema verifica a semana imediatamente anterior.
 */

export interface WeekRange {
  startDate: string; // YYYY-MM-DD (Domingo)
  endDate: string;   // YYYY-MM-DD (Sábado)
  isoYear: number;
  isoWeek: number;
  label: string;     // Ex: "20/09 a 26/09/2026"
}

/**
 * Retorna o ano e a semana ISO a partir de uma data no formato YYYY-MM-DD
 */
export function getISOWeekAndYear(dateStr: string): { year: number; week: number } {
  try {
    const date = new Date(dateStr + 'T12:00:00Z');
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
  } catch {
    const d = new Date();
    return { year: d.getFullYear(), week: 1 };
  }
}

/**
 * Determina o intervalo da semana anterior considerando domingo como início da semana.
 * Se hoje for segunda-feira (ex: 28/09/2026), retorna:
 * - startDate: 2026-09-20 (Domingo)
 * - endDate: 2026-09-26 (Sábado)
 */
export function getPreviousWeekRange(referenceDate: Date = new Date()): WeekRange {
  // Cria cópia da data de referência
  const ref = new Date(referenceDate);
  const currentDayOfWeek = ref.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

  // Dias até o domingo da semana anterior:
  // Domingo (0) -> 7 dias atrás
  // Segunda (1) -> 8 dias atrás (1 + 7)
  // Terça (2) -> 9 dias atrás (2 + 7)
  // etc.
  const daysToPrevSunday = currentDayOfWeek === 0 ? 7 : currentDayOfWeek + 7;

  const prevSunday = new Date(ref);
  prevSunday.setDate(ref.getDate() - daysToPrevSunday);

  const prevSaturday = new Date(prevSunday);
  prevSaturday.setDate(prevSunday.getDate() + 6);

  const formatIsoDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startDate = formatIsoDate(prevSunday);
  const endDate = formatIsoDate(prevSaturday);

  // Ponto central da semana (quarta-feira) para obter o ano e semana ISO precisos
  const midWeek = new Date(prevSunday);
  midWeek.setDate(prevSunday.getDate() + 3);
  const iso = getISOWeekAndYear(formatIsoDate(midWeek));

  const formatBrDate = (d: Date): string => {
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${m}`;
  };

  return {
    startDate,
    endDate,
    isoYear: iso.year,
    isoWeek: iso.week,
    label: `${formatBrDate(prevSunday)} a ${formatBrDate(prevSaturday)}/${prevSaturday.getFullYear()}`,
  };
}
