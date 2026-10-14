/**
 * Regras compartilhadas do Organograma (Indicadores da Igreja).
 *
 * Cor de uma unidade (Área, Setor, Distrito...):
 *  - formato #RRGGBB, ou null = cor padrão do app;
 *  - células (nível mais baixo) NÃO têm cor própria: repetem a cor do setor;
 *  - quem pode alterar: Pastor (nível >= 6), Administrador do Sistema, e o líder ativo
 *    (unidade_lideres) da própria unidade ou de qualquer unidade acima dela.
 */

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export interface OrgUnitLite {
  id: string;
  pai_id: string | null;
  /** true = nível mais baixo da hierarquia (célula) */
  isLeaf: boolean;
}

/**
 * IDs das unidades (que não são células) cuja cor o usuário pode alterar.
 * `ledUnitIds` = unidades onde o usuário é líder ativo.
 */
export function computeEditableUnitIds(
  units: OrgUnitLite[],
  ledUnitIds: Set<string>,
  seesAll: boolean
): Set<string> {
  const byId = new Map(units.map((u) => [u.id, u]));
  const editable = new Set<string>();
  for (const unit of units) {
    if (unit.isLeaf) continue;
    if (seesAll) {
      editable.add(unit.id);
      continue;
    }
    // sobe a árvore (com trava contra ciclos) procurando uma unidade liderada pelo usuário
    let current: OrgUnitLite | undefined = unit;
    for (let guard = 0; current && guard < 50; guard++) {
      if (ledUnitIds.has(current.id)) {
        editable.add(unit.id);
        break;
      }
      current = current.pai_id ? byId.get(current.pai_id) : undefined;
    }
  }
  return editable;
}

/** Primeiro nome de uma pessoa, sem apelido entre parênteses. */
export function firstName(fullName: string | null | undefined): string {
  const clean = (fullName || '').replace(/\(.*?\)/g, '').trim();
  return clean.split(/\s+/)[0] || '';
}

/** "Rodolfo e Nathanna"; com 3+ líderes: "Rodolfo e Nathanna +1". */
export function formatLeaders(names: string[]): string {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (unique.length === 0) return '';
  if (unique.length <= 2) return unique.join(' e ');
  return `${unique[0]} e ${unique[1]} +${unique.length - 2}`;
}
