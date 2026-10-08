/** Cores por faixa de conclusão do Trilho de Liderança (Indicadores e Minha Célula). */
export const THRESHOLD_COLORS = {
  high: '#059669', // emerald-600 — ≥ 65%
  mid: '#d97706', // amber-600 — 30% a 65%
  low: '#dc2626', // red-600 — < 30%
};

export function colorForPercent(percent: number): string {
  if (percent >= 65) return THRESHOLD_COLORS.high;
  if (percent >= 30) return THRESHOLD_COLORS.mid;
  return THRESHOLD_COLORS.low;
}
