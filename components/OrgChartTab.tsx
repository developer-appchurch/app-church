'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Loader2, Palette } from 'lucide-react';
import { UserProfile } from '../types';

/**
 * Aba "Organograma" de Indicadores da Igreja: árvore da igreja (Área → Setor → Célula)
 * com os líderes de cada unidade. Quem acessa a tela vê o organograma inteiro.
 *
 * - Uma única consulta (/api/indicators/org-chart); abrir/fechar nós e trocar cores
 *   acontece em memória, sem recarregar nada.
 * - Cor: cada Área/Setor tem a sua (padrão estável pelo id, ou a escolhida por quem lidera).
 *   Células repetem a cor do setor.
 * - Desktop: árvore horizontal. Celular: lista que abre e fecha.
 */

interface OrgNodeData {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  levelName: string;
  isLeaf: boolean;
  color: string | null;
  leaders: string;
}

interface OrgData {
  church: { name: string; leaders: string };
  nodes: OrgNodeData[];
  editableIds: string[];
  colorsAvailable: boolean;
}

interface TreeNode {
  id: string;
  name: string;
  leaders: string;
  levelName: string;
  isLeaf: boolean;
  color: string;
  ink: string;
  editable: boolean;
  children: TreeNode[];
  count: number;
}

const CHURCH_ID = '__church__';

/** Cores padrão (usadas quando ninguém escolheu uma cor). Não inclui branco nem cinza claro. */
const DEFAULT_COLORS = [
  '#d63a12',
  '#c2410c',
  '#f5b400',
  '#eab308',
  '#15803d',
  '#0e7490',
  '#2563eb',
  '#1d4ed8',
  '#6d28d9',
  '#be185d',
  '#52525b',
  '#1c1c1c',
];

/** Cores disponíveis para escolher (todas dão contraste suficiente com texto branco ou escuro). */
const COLOR_CHOICES: { hex: string; name: string }[] = [
  { hex: '#dc2626', name: 'Vermelho' },
  { hex: '#d63a12', name: 'Vermelho alaranjado' },
  { hex: '#f97316', name: 'Laranja' },
  { hex: '#c2410c', name: 'Laranja escuro' },
  { hex: '#f5b400', name: 'Âmbar' },
  { hex: '#eab308', name: 'Amarelo' },
  { hex: '#15803d', name: 'Verde' },
  { hex: '#0e7490', name: 'Azul petróleo' },
  { hex: '#2563eb', name: 'Azul' },
  { hex: '#1d4ed8', name: 'Azul royal' },
  { hex: '#1e3a8a', name: 'Azul marinho' },
  { hex: '#6d28d9', name: 'Roxo' },
  { hex: '#be185d', name: 'Rosa' },
  { hex: '#6b7280', name: 'Cinza' },
  { hex: '#52525b', name: 'Cinza escuro' },
  { hex: '#1c1c1c', name: 'Preto' },
  { hex: '#ffffff', name: 'Branco' },
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Cor padrão estável de uma unidade sem cor escolhida. */
function defaultColor(id: string): string {
  return DEFAULT_COLORS[hashId(id) % DEFAULT_COLORS.length];
}

function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Branco ou quase-preto, o que tiver mais contraste com o fundo. */
function inkFor(hex: string): string {
  const l = luminance(hex);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.0556 ? '#ffffff' : '#111111';
}

/** Cor da linha de ligação (cores muito escuras ou muito claras viram cinza para aparecer no fundo branco). */
function lineFor(hex: string): string {
  const l = luminance(hex);
  return l < 0.05 ? '#6b7280' : l > 0.85 ? '#94a3b8' : hex;
}

/** Cores muito claras (ex.: branco) precisam de borda para não sumir no fundo branco. */
function needsOutline(hex: string): boolean {
  return luminance(hex) > 0.85;
}

function pluralize(name: string): string {
  const n = name.trim();
  if (!n) return n;
  return /[rz]$/i.test(n) ? `${n}es` : /s$/i.test(n) ? n : `${n}s`;
}

function buildTree(data: OrgData): TreeNode {
  const ids = new Set(data.nodes.map((n) => n.id));
  const byParent = new Map<string | null, OrgNodeData[]>();
  data.nodes.forEach((n) => {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : null;
    const list = byParent.get(key) || [];
    list.push(n);
    byParent.set(key, list);
  });
  const editable = new Set(data.editableIds);

  const build = (n: OrgNodeData, inherited: string): TreeNode => {
    const color = n.isLeaf ? inherited : n.color || defaultColor(n.id);
    const children = (byParent.get(n.id) || []).map((c) => build(c, color));
    return {
      id: n.id,
      name: n.isLeaf || !n.levelName ? n.name : `${n.levelName} ${n.name}`,
      leaders: n.leaders,
      levelName: n.levelName,
      isLeaf: n.isLeaf,
      color,
      ink: inkFor(color),
      editable: editable.has(n.id),
      children,
      count: n.isLeaf ? 1 : children.reduce((a, c) => a + c.count, 0),
    };
  };

  const roots = (byParent.get(null) || []).map((n) => build(n, '#475569'));
  return {
    id: CHURCH_ID,
    name: data.church.name || 'Igreja',
    leaders: data.church.leaders ? `Prs. ${data.church.leaders}` : '',
    levelName: '',
    isLeaf: false,
    color: '#052447',
    ink: '#ffffff',
    editable: false,
    children: roots,
    count: roots.reduce((a, c) => a + c.count, 0),
  };
}

/** Nós com filhos (para "Expandir tudo") e áreas (abertas por padrão). */
function collectParents(node: TreeNode, out: Set<string>) {
  if (node.children.length > 0) {
    out.add(node.id);
    node.children.forEach((c) => collectParents(c, out));
  }
}

function findNode(node: TreeNode, id: string): TreeNode | null {
  if (node.id === id) return node;
  for (const c of node.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

/* ---------- layout horizontal (desktop) ---------- */

interface PlacedNode {
  node: TreeNode;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedPath {
  d: string;
  stroke: string;
  key: string;
}

const COL_GAP = 60;
const PAD = 16;

function layoutTree(root: TreeNode, open: Set<string>) {
  // largura por coluna (profundidade): colunas só de células são mais estreitas
  const hasParentAt: boolean[] = [];
  const scan = (n: TreeNode, d: number) => {
    if (n.children.length > 0 && !hasParentAt[d]) hasParentAt[d] = true;
    n.children.forEach((c) => scan(c, d + 1));
  };
  scan(root, 0);
  let maxDepth = 0;
  const depthOf = (n: TreeNode, d: number) => {
    maxDepth = Math.max(maxDepth, d);
    n.children.forEach((c) => depthOf(c, d + 1));
  };
  depthOf(root, 0);

  const widths: number[] = [];
  const xs: number[] = [];
  let x = PAD;
  for (let d = 0; d <= maxDepth; d++) {
    widths[d] = d === 0 ? 200 : hasParentAt[d] ? 180 : 164;
    xs[d] = x;
    x += widths[d] + COL_GAP;
  }

  const placed: PlacedNode[] = [];
  const paths: PlacedPath[] = [];
  const ys = new Map<string, number>();

  const place = (n: TreeNode, d: number, top: number): number => {
    const kids = n.children.length > 0 && open.has(n.id) ? n.children : [];
    const nodeH = n.isLeaf ? 30 : 48;
    let slot: number;
    let y: number;
    if (kids.length === 0) {
      slot = n.isLeaf ? 38 : 62;
      y = top + slot / 2;
    } else {
      let t = top;
      kids.forEach((k) => {
        t += place(k, d + 1, t);
      });
      slot = t - top;
      y = (ys.get(kids[0].id)! + ys.get(kids[kids.length - 1].id)!) / 2;
    }
    ys.set(n.id, y);
    placed.push({ node: n, depth: d, x: xs[d], y: y - nodeH / 2, w: widths[d], h: nodeH });
    kids.forEach((k) => {
      const x1 = xs[d] + widths[d];
      const x2 = xs[d + 1];
      const xm = (x1 + x2) / 2;
      const y2 = ys.get(k.id)!;
      paths.push({
        key: `${n.id}>${k.id}`,
        d: `M ${x1} ${y} C ${xm} ${y}, ${xm} ${y2}, ${x2} ${y2}`,
        stroke: lineFor(k.color),
      });
    });
    return slot;
  };

  const total = place(root, 0, 12);
  return { placed, paths, width: xs[maxDepth] + widths[maxDepth] + 30, height: total + 12 };
}

/* ---------- lista (celular) ---------- */

interface ListRow {
  node: TreeNode;
  depth: number;
}

function flattenVisible(root: TreeNode, open: Set<string>): ListRow[] {
  const rows: ListRow[] = [];
  const walk = (n: TreeNode, depth: number) => {
    rows.push({ node: n, depth });
    if (n.children.length > 0 && open.has(n.id)) n.children.forEach((c) => walk(c, depth + 1));
  };
  root.children.forEach((c) => walk(c, 0));
  return rows;
}

/* ---------- componente ---------- */

interface OrgChartTabProps {
  currentUser: UserProfile;
}

const toolbarBtn =
  'inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 rounded-lg border text-xs sm:text-sm font-semibold transition cursor-pointer';

export const OrgChartTab: React.FC<OrgChartTabProps> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const queryClient = useQueryClient();
  const queryKey = ['org-chart', churchId, currentUser.id];

  const { data, isLoading, error } = useQuery<OrgData>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/indicators/org-chart?churchId=${encodeURIComponent(churchId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Falha ao carregar o organograma.');
      return body as OrgData;
    },
    enabled: Boolean(churchId),
    staleTime: 1000 * 60 * 5,
  });

  const tree = useMemo(() => (data ? buildTree(data) : null), [data]);

  // Padrão: Áreas abertas (mostram os setores fechados, com a contagem de células).
  const [openIds, setOpenIds] = useState<Set<string> | null>(null);
  const open = useMemo(() => {
    if (openIds) return openIds;
    const initial = new Set<string>([CHURCH_ID]);
    tree?.children.forEach((c) => initial.add(c.id));
    return initial;
  }, [openIds, tree]);

  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canEditColors = Boolean(data?.colorsAvailable && data.editableIds.length > 0);

  const layout = useMemo(() => (tree ? layoutTree(tree, open) : null), [tree, open]);
  const rows = useMemo(() => (tree ? flattenVisible(tree, open) : []), [tree, open]);

  const summary = useMemo(() => {
    if (!data) return [];
    const byLevel = new Map<string, { order: number; count: number; leaf: boolean }>();
    data.nodes.forEach((n) => {
      const cur = byLevel.get(n.levelName) || { order: n.order, count: 0, leaf: n.isLeaf };
      cur.count += 1;
      byLevel.set(n.levelName, cur);
    });
    return Array.from(byLevel.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name, v]) => `${v.count} ${v.leaf ? 'células' : pluralize(name).toLowerCase()}`);
  }, [data]);

  const toggleOpen = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenIds(next);
  };

  const onNodeClick = (node: TreeNode) => {
    if (editing) {
      if (node.editable) setSelectedId(node.id);
      return;
    }
    if (node.children.length > 0 && node.id !== CHURCH_ID) toggleOpen(node.id);
  };

  const expandAll = () => {
    if (!tree) return;
    const all = new Set<string>();
    collectParents(tree, all);
    setOpenIds(all);
  };

  const collapseAll = () => setOpenIds(new Set([CHURCH_ID]));

  const saveColor = async (unitId: string, color: string | null) => {
    const previous = queryClient.getQueryData<OrgData>(queryKey);
    setSaveError(null);
    setSaving(true);
    // atualiza a tela na hora; volta atrás se o servidor recusar
    queryClient.setQueryData<OrgData>(queryKey, (old) =>
      old ? { ...old, nodes: old.nodes.map((n) => (n.id === unitId ? { ...n, color } : n)) } : old
    );
    try {
      const res = await fetch('/api/units/color', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, color, churchId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Não foi possível salvar a cor.');
    } catch (err: any) {
      queryClient.setQueryData<OrgData>(queryKey, previous);
      setSaveError(err?.message || 'Não foi possível salvar a cor.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEditing = () => {
    setEditing((v) => !v);
    setSelectedId(null);
    setSaveError(null);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-10 flex items-center justify-center text-slate-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error || !tree || !layout) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-rose-200 shadow-xs p-6 text-sm text-rose-600 font-semibold text-center">
        {(error as Error | null)?.message || 'Não foi possível carregar o organograma.'}
      </div>
    );
  }

  const selected = selectedId ? findNode(tree, selectedId) : null;

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-300 shadow-sm p-3 sm:p-5">
      {/* Barra: resumo + ações */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {summary.map((label) => (
            <span key={label} className="bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full">
              {label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={expandAll}
            className={`${toolbarBtn} border-slate-300 bg-white text-[#052447] hover:bg-slate-50`}
          >
            Expandir tudo
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className={`${toolbarBtn} border-slate-300 bg-white text-[#052447] hover:bg-slate-50`}
          >
            Recolher tudo
          </button>
          {canEditColors && (
            <button
              type="button"
              onClick={toggleEditing}
              aria-pressed={editing}
              className={`${toolbarBtn} border-[#052447] ${
                editing ? 'bg-[#052447] text-white' : 'bg-white text-[#052447] hover:bg-slate-50'
              }`}
            >
              <Palette size={15} />
              {editing ? 'Concluir edição' : 'Editar cores'}
            </button>
          )}
        </div>
      </div>

      {!editing && (
        <p className="mt-3 text-xs sm:text-sm text-slate-500">
          Toque em uma área ou setor para abrir as células. O número é a quantidade de células abaixo dele.
        </p>
      )}

      {/* Painel de cores (só no modo de edição) */}
      {editing && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {!selected ? (
            <span className="text-xs sm:text-sm text-sky-900">
              Selecione uma área ou setor para mudar a cor. As células seguem a cor do setor.
            </span>
          ) : (
            <>
              <span className="text-xs sm:text-sm font-bold text-[#052447]">Cor de {selected.name}</span>
              <div className="flex flex-wrap items-center gap-1">
                {COLOR_CHOICES.map(({ hex, name }) => {
                  const isCurrent = selected.color.toLowerCase() === hex;
                  return (
                    <button
                      key={hex}
                      type="button"
                      disabled={saving}
                      onClick={() => saveColor(selected.id, hex)}
                      aria-label={`Usar a cor ${name}`}
                      title={name}
                      aria-pressed={isCurrent}
                      className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center cursor-pointer disabled:opacity-60"
                    >
                      <span
                        className="block w-7 h-7 sm:w-6 sm:h-6 rounded-full"
                        style={{
                          background: hex,
                          boxShadow: isCurrent
                            ? '0 0 0 2px #fff, 0 0 0 4px #0f172a'
                            : 'inset 0 0 0 1px rgba(15,23,42,.25)',
                        }}
                      />
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveColor(selected.id, null)}
                  className="ml-1 px-3 min-h-11 sm:min-h-9 rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-700 cursor-pointer hover:bg-slate-50 disabled:opacity-60"
                >
                  Padrão
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {saveError && (
        <p role="alert" className="mt-2 text-xs sm:text-sm font-semibold text-rose-600">
          {saveError}
        </p>
      )}

      {/* Desktop: árvore horizontal */}
      <div className="hidden md:block overflow-x-auto mt-3 pb-3">
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          <svg width={layout.width} height={layout.height} aria-hidden="true" className="absolute left-0 top-0">
            {layout.paths.map((p) => (
              <path key={p.key} d={p.d} stroke={p.stroke} fill="none" strokeWidth={1.8} strokeLinecap="round" />
            ))}
          </svg>
          {layout.placed.map(({ node, x, y, w, h }) => {
            const isChurch = node.id === CHURCH_ID;
            const canToggle = !isChurch && node.children.length > 0;
            const isOpen = open.has(node.id);
            const dimmed = editing && !isChurch && !node.isLeaf && !node.editable;
            const style: React.CSSProperties = {
              position: 'absolute',
              left: x,
              top: y,
              width: w,
              height: h,
              background: node.color,
              color: node.ink,
              opacity: dimmed ? 0.45 : 1,
              border: needsOutline(node.color) ? '1.5px solid #cbd5e1' : undefined,
              boxShadow: editing && selectedId === node.id ? '0 0 0 3px #fff, 0 0 0 6px #38bdf8' : undefined,
            };
            if (!canToggle) {
              return (
                <div
                  key={node.id}
                  style={style}
                  className={`flex flex-col justify-center box-border ${
                    node.isLeaf ? 'rounded-lg px-3' : 'rounded-[10px] px-3.5'
                  }`}
                >
                  <span className={`truncate leading-tight ${node.isLeaf ? 'text-xs font-semibold' : 'text-[13px] font-bold'}`}>
                    {node.name}
                  </span>
                  {!node.isLeaf && node.leaders && (
                    <span className="truncate text-[11px] font-medium leading-snug">{node.leaders}</span>
                  )}
                </div>
              );
            }
            return (
              <button
                key={node.id}
                type="button"
                onClick={() => onNodeClick(node)}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Recolher' : 'Abrir'} ${node.name}, ${node.count} células`}
                style={style}
                className="flex flex-col justify-center text-left rounded-[10px] px-3.5 cursor-pointer"
              >
                <span className="truncate text-[13px] font-bold leading-tight">{node.name}</span>
                {node.leaders && <span className="truncate text-[11px] font-medium leading-snug">{node.leaders}</span>}
                <span
                  className="absolute -right-2.5 top-1/2 -mt-[11px] w-[22px] h-[22px] rounded-full bg-white text-slate-900 text-[11px] font-bold flex items-center justify-center box-border"
                  style={{ border: `2px solid ${lineFor(node.color)}` }}
                >
                  {isOpen ? '−' : node.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Celular: lista que abre e fecha */}
      <div className="md:hidden mt-3 rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3.5 py-3 bg-[#052447] text-white">
          <div className="text-sm font-bold">{tree.name}</div>
          {tree.leaders && <div className="text-xs mt-0.5">{tree.leaders}</div>}
        </div>
        {rows.map(({ node, depth }) => {
          const pad = node.isLeaf ? 14 + 18 * Math.min(depth, 3) : 14 + 14 * Math.min(depth, 3);
          const dimmed = editing && !node.isLeaf && !node.editable;
          const isOpen = open.has(node.id);
          if (node.children.length === 0) {
            return (
              <div
                key={node.id}
                className="flex items-center gap-2.5 min-h-10 py-1 pr-3.5 border-t border-slate-100"
                style={{ paddingLeft: pad, opacity: dimmed ? 0.45 : 1 }}
              >
                <span
                  className="shrink-0 w-2 h-2 rounded-full"
                  style={{ background: node.color, boxShadow: 'inset 0 0 0 1px rgba(15,23,42,.25)' }}
                />
                <span className="text-[13px] text-slate-800">{node.name}</span>
              </div>
            );
          }
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onNodeClick(node)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Recolher' : 'Abrir'} ${node.name}, ${node.count} células`}
              className="flex items-center gap-2.5 w-full min-h-13 py-1.5 pr-3.5 border-t border-slate-100 text-left cursor-pointer bg-white"
              style={{
                paddingLeft: pad,
                opacity: dimmed ? 0.45 : 1,
                boxShadow: editing && selectedId === node.id ? 'inset 0 0 0 3px #38bdf8' : undefined,
              }}
            >
              <span
                className="shrink-0 w-3 h-3 rounded"
                style={{ background: node.color, boxShadow: 'inset 0 0 0 1px rgba(15,23,42,.25)' }}
              />
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-sm font-bold leading-tight text-slate-900">{node.name}</span>
                {node.leaders && <span className="text-xs text-slate-500 leading-snug">{node.leaders}</span>}
              </span>
              <span className="shrink-0 min-w-[26px] text-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                {node.count}
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-slate-400 transition-transform"
                style={{ transform: isOpen ? 'rotate(90deg)' : undefined }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
