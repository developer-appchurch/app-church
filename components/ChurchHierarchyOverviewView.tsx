'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Compass,
  Layers,
  Users,
  Building2,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Loader2,
  MapPin,
  Calendar,
  CheckCircle2,
  UserCheck,
  ShieldCheck,
  ArrowRight,
  Filter,
  BarChart3,
  Network,
  X,
} from 'lucide-react';
import {
  UserProfile,
  ChurchHierarchicalLevel,
  OrganizationalUnit,
  CellMember,
} from '../types';
import { AppChurchService } from '../lib/supabase';

interface ChurchHierarchyOverviewViewProps {
  user: UserProfile;
  onNavigateAddUnit?: (levelIndex: number, parentId?: string) => void;
  onNavigatePool?: () => void;
}

interface TreeNode {
  unit: OrganizationalUnit;
  children: TreeNode[];
}

interface LevelLeaderItem {
  leaderId: string;
  leaderName: string;
  role?: string;
  avatarUrl?: string;
  phone?: string;
  unitId: string;
  unitName: string;
}

export function getPluralLevelName(name: string): string {
  const norm = (name || '').trim();
  const lower = norm.toLowerCase();
  if (lower === 'setor') return 'Setores';
  if (lower === 'distrito') return 'Distritos';
  if (lower === 'área' || lower === 'area') return 'Áreas';
  if (lower === 'célula' || lower === 'celula') return 'Células';
  if (lower.endsWith('r')) return `${norm}es`;
  if (lower.endsWith('s')) return norm;
  if (lower.endsWith('m')) return `${norm.slice(0, -1)}ns`;
  if (lower.endsWith('l')) return `${norm.slice(0, -1)}is`;
  return `${norm}s`;
}

export const ChurchHierarchyOverviewView: React.FC<ChurchHierarchyOverviewViewProps> = ({
  user,
  onNavigateAddUnit,
  onNavigatePool,
}) => {
  const [levels, setLevels] = useState<ChurchHierarchicalLevel[]>([]);
  const [units, setUnits] = useState<OrganizationalUnit[]>([]);
  const [totalMembers, setTotalMembers] = useState<number>(0);
  const [linkedCount, setLinkedCount] = useState<number>(0);
  const [unlinkedCount, setUnlinkedCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

  // Estado do modal compacto resumido por nível
  const [selectedLevelForModal, setSelectedLevelForModal] = useState<ChurchHierarchicalLevel | null>(null);
  const [modalSearchTerm, setModalSearchTerm] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLevelForModal) {
        setSelectedLevelForModal(null);
        setModalSearchTerm('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLevelForModal]);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [fetchedLevels, fetchedUnits, fetchedPool] = await Promise.all([
          AppChurchService.getChurchLevels(user.churchId),
          AppChurchService.getUnits(user.churchId),
          AppChurchService.getMemberPool(user.churchId, 'all'),
        ]);

        if (!isMounted) return;
        setLevels(fetchedLevels);
        setUnits(fetchedUnits);
        setTotalMembers(fetchedPool.counts.total);
        setLinkedCount(fetchedPool.counts.linked);
        setUnlinkedCount(fetchedPool.counts.unlinked);

        // Iniciar a árvore recolhida (Passo 7): por padrão recolhe todas as unidades que têm filhos
        const initialCollapsed = new Set<string>();
        fetchedUnits.forEach((u) => initialCollapsed.add(u.id));
        setCollapsedNodeIds(initialCollapsed);
      } catch (err: any) {
        console.error('Erro ao carregar visão geral da igreja:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [user.churchId]);

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const expandAll = () => setCollapsedNodeIds(new Set());
  const collapseAll = () => {
    const allIds = new Set<string>();
    units.forEach((u) => allIds.add(u.id));
    setCollapsedNodeIds(allIds);
  };

  // Nível raiz (nível com menor ordem) e nível folha (maior ordem)
  const rootLevel = levels[0];
  const leafLevel = levels[levels.length - 1];

  // Métricas por nível
  const unitCountsByLevel = useMemo(() => {
    const map = new Map<string, number>();
    levels.forEach((l) => map.set(l.id, 0));
    units.forEach((u) => {
      map.set(u.levelTypeId, (map.get(u.levelTypeId) || 0) + 1);
    });
    return map;
  }, [levels, units]);

  // Contagem de líderes únicos
  const totalUniqueLeaders = useMemo(() => {
    const leaderIds = new Set<string>();
    units.forEach((u) => {
      u.leaders.forEach((l) => leaderIds.add(l.id));
    });
    return leaderIds.size;
  }, [units]);

  // Líderes do nível selecionado com o nome da unidade que ele lidera em ordem alfabética
  const modalLeaderItems = useMemo<LevelLeaderItem[]>(() => {
    if (!selectedLevelForModal) return [];

    const targetUnits = units.filter(
      (u) => u.levelTypeId === selectedLevelForModal.id
    );

    const leaderMap = new Map<string, LevelLeaderItem>();

    targetUnits.forEach((unit) => {
      (unit.leaders || []).forEach((leader) => {
        const existing = leaderMap.get(leader.id);
        if (existing) {
          if (!existing.unitName.includes(unit.name)) {
            existing.unitName += `, ${unit.name}`;
          }
        } else {
          leaderMap.set(leader.id, {
            leaderId: leader.id,
            leaderName: leader.name,
            role: leader.role,
            avatarUrl: leader.avatarUrl,
            phone: leader.phone,
            unitId: unit.id,
            unitName: unit.name,
          });
        }
      });
    });

    const items = Array.from(leaderMap.values());
    // Apresentar em ordem alfabética pelo Nome do Líder
    items.sort((a, b) => a.leaderName.localeCompare(b.leaderName, 'pt-BR', { sensitivity: 'base' }));
    return items;
  }, [selectedLevelForModal, units]);

  // Filtro de busca dentro do modal
  const filteredModalLeaderItems = useMemo(() => {
    if (!modalSearchTerm.trim()) return modalLeaderItems;
    const term = modalSearchTerm.toLowerCase();
    return modalLeaderItems.filter(
      (item) =>
        item.leaderName.toLowerCase().includes(term) ||
        item.unitName.toLowerCase().includes(term) ||
        (item.role && item.role.toLowerCase().includes(term))
    );
  }, [modalLeaderItems, modalSearchTerm]);

  // Montagem da árvore a partir das unidades raiz usando Map por pai_id (Passo 1: O(N))
  const treeRoots = useMemo(() => {
    if (!rootLevel) return [];

    // Mapeamento indexado por parentId: parentId -> OrganizationalUnit[]
    const childrenByParentId = new Map<string, OrganizationalUnit[]>();
    units.forEach((u) => {
      const pId = u.parentId || '__ROOT__';
      const list = childrenByParentId.get(pId) || [];
      list.push(u);
      childrenByParentId.set(pId, list);
    });

    const rootUnits = units.filter(
      (u) => !u.parentId || u.levelTypeId === rootLevel.id
    );

    const buildSubtree = (parentUnit: OrganizationalUnit): TreeNode => {
      const childrenUnits = childrenByParentId.get(parentUnit.id) || [];
      return {
        unit: parentUnit,
        children: childrenUnits.map(buildSubtree),
      };
    };

    return rootUnits.map(buildSubtree);
  }, [units, rootLevel]);

  // Busca na árvore
  const filteredTreeRoots = useMemo(() => {
    if (!searchTerm.trim()) return treeRoots;
    const term = searchTerm.toLowerCase();

    const matchesSearch = (node: TreeNode): boolean => {
      const matchName = node.unit.name.toLowerCase().includes(term);
      const matchLeader = node.unit.leaders.some((l) => l.name.toLowerCase().includes(term));
      const matchNeigh = node.unit.neighborhood?.toLowerCase().includes(term);
      const matchChild = node.children.some(matchesSearch);
      return Boolean(matchName || matchLeader || matchNeigh || matchChild);
    };

    const filterNode = (node: TreeNode): TreeNode | null => {
      if (!matchesSearch(node)) return null;
      return {
        ...node,
        children: node.children.map(filterNode).filter(Boolean) as TreeNode[],
      };
    };

    return treeRoots.map(filterNode).filter(Boolean) as TreeNode[];
  }, [treeRoots, searchTerm]);

  // Renderizador recursivo de nó da árvore
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isLeaf =
      node.unit.levelTypeId === leafLevel?.id ||
      node.unit.levelOrder === 40 ||
      node.unit.levelTypeName?.toLowerCase() === 'célula';

    const isCollapsed = collapsedNodeIds.has(node.unit.id);
    const hasChildren = node.children.length > 0;

    // Encontrar índice do nível atual e do próximo nível para o botão "+ Filho"
    const currentLevelIdx = levels.findIndex((l) => l.id === node.unit.levelTypeId);
    const nextLevel = currentLevelIdx >= 0 && currentLevelIdx < levels.length - 1 ? levels[currentLevelIdx + 1] : null;

    const effectiveLevelIdx = currentLevelIdx >= 0 ? currentLevelIdx : depth;
    const isRoot = !isLeaf && (depth === 0 || node.unit.levelTypeId === rootLevel?.id || node.unit.levelOrder === 10);
    const isLevel2 = !isRoot && !isLeaf && (effectiveLevelIdx === 1 || node.unit.levelOrder === 20);
    const isLevel3 = !isRoot && !isLeaf && (effectiveLevelIdx === 2 || node.unit.levelOrder === 30);

    // Definição de paleta visual por nível
    let cardClasses = 'bg-white border-2 border-slate-300 text-slate-900 shadow-xs';
    let levelBadgeClasses = 'bg-slate-100 text-slate-700 border border-slate-200';
    let titleClasses = 'text-slate-900';
    let leaderTagClasses = 'bg-slate-100 text-slate-700 border border-slate-200';
    let actionBtnClasses = 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300';
    let chevronClasses = 'text-slate-500 hover:text-slate-900 hover:bg-slate-100';

    if (isLeaf) {
      // Nível 4 / Célula (Menor): Fundo branco e borda sutilmente nítida (1px)
      cardClasses = 'bg-white border border-slate-300 shadow-xs hover:border-slate-400';
      levelBadgeClasses = 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold';
      titleClasses = 'text-slate-900';
      leaderTagClasses = 'bg-slate-100/90 text-slate-800 border border-slate-200 font-semibold';
      actionBtnClasses = 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300';
      chevronClasses = 'text-slate-500 hover:text-slate-900 hover:bg-slate-100';
    } else if (isRoot) {
      // Nível 1 / Distrito (Nível maior): Escuro/Slate 900 preservado
      cardClasses = 'bg-slate-900 text-white border border-slate-800 shadow-sm';
      levelBadgeClasses = 'bg-sky-500/20 text-sky-300 border border-sky-400/30 font-bold';
      titleClasses = 'text-white';
      leaderTagClasses = 'bg-white/10 text-slate-200 border border-white/10 font-semibold';
      actionBtnClasses = 'bg-white/10 hover:bg-white/20 text-white border border-white/20';
      chevronClasses = 'text-slate-300 hover:text-white hover:bg-white/10';
    } else if (isLevel2) {
      // Nível 2 / Área: Tom pastel azul suave da paleta
      cardClasses = 'bg-[#e6f1fb] border-2 border-sky-300/80 text-slate-900 shadow-xs';
      levelBadgeClasses = 'bg-sky-700 text-white border border-sky-800 font-bold shadow-2xs';
      titleClasses = 'text-slate-900';
      leaderTagClasses = 'bg-white text-sky-950 border border-sky-200 font-semibold shadow-2xs';
      actionBtnClasses = 'bg-white hover:bg-sky-50 text-sky-900 border border-sky-300 shadow-xs font-bold';
      chevronClasses = 'text-sky-800 hover:text-sky-950 hover:bg-sky-200/60';
    } else if (isLevel3) {
      // Nível 3 / Setor: Tom cinza frio slate da paleta
      cardClasses = 'bg-[#edf2f7] border-2 border-slate-300 text-slate-900 shadow-xs';
      levelBadgeClasses = 'bg-slate-700 text-white border border-slate-800 font-bold shadow-2xs';
      titleClasses = 'text-slate-900';
      leaderTagClasses = 'bg-white text-slate-800 border border-slate-200 font-semibold shadow-2xs';
      actionBtnClasses = 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-xs font-bold';
      chevronClasses = 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60';
    }

    return (
      <div key={node.unit.id} className="relative">
        {/* Linha de conexão vertical para níveis filhos */}
        {depth > 0 && (
          <div
            className="absolute -left-5 top-5 w-5 h-px bg-slate-300"
            aria-hidden="true"
          />
        )}

        <div className={`p-3.5 sm:p-4 rounded-2xl transition ${cardClasses}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleCollapse(node.unit.id)}
                  className={`p-1 rounded-lg transition cursor-pointer ${chevronClasses}`}
                  title={isCollapsed ? 'Expandir' : 'Recolher'}
                >
                  {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                </button>
              ) : (
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isLeaf ? 'bg-emerald-500' : isRoot ? 'bg-sky-400' : 'bg-slate-400'
                    }`}
                  />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md ${levelBadgeClasses}`}
                  >
                    {node.unit.levelTypeName}
                  </span>

                  <h3 className={`text-xs sm:text-sm font-bold ${titleClasses}`}>
                    {node.unit.name}
                  </h3>

                  {isLeaf && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white shadow-2xs">
                      {node.unit.memberCount || 0} membros
                    </span>
                  )}
                </div>

                {/* Líderes vinculados */}
                {node.unit.leaders.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span
                      className={`text-[10px] ${
                        isRoot ? 'text-slate-400' : isLevel2 ? 'text-sky-900/70' : 'text-slate-500'
                      }`}
                    >
                      Liderança:
                    </span>
                    {node.unit.leaders.map((ldr) => (
                      <span
                        key={ldr.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${leaderTagClasses}`}
                      >
                        <UserCheck size={11} className={isRoot ? 'text-sky-300' : isLevel2 ? 'text-sky-700' : 'text-slate-600'} />
                        <span>{ldr.name}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p
                    className={`text-[10px] mt-1 ${
                      isRoot ? 'text-amber-300' : 'text-amber-700'
                    }`}
                  >
                    Sem líderes atribuídos
                  </p>
                )}

                {/* Detalhes de reunião para célula */}
                {isLeaf && (node.unit.meetingDay || node.unit.neighborhood) && (
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 mt-1">
                    {node.unit.meetingDay && (
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {node.unit.meetingDay} {node.unit.meetingTime ? `às ${node.unit.meetingTime}` : ''}
                      </span>
                    )}
                    {node.unit.neighborhood && (
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />
                        {node.unit.neighborhood}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Ações contextuais */}
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {nextLevel && onNavigateAddUnit && (
                <button
                  type="button"
                  onClick={() => onNavigateAddUnit(currentLevelIdx + 1, node.unit.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${actionBtnClasses}`}
                  title={`Adicionar ${nextLevel.name} vinculado a este ${node.unit.name}`}
                >
                  <Plus size={13} />
                  <span>+ {nextLevel.name}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filhos renderizados recursivamente */}
        {!isCollapsed && hasChildren && (
          <div className="pl-6 sm:pl-8 ml-3 sm:ml-4 border-l-2 border-slate-300 space-y-3 mt-3 relative">
            {node.children.map((childNode) => renderTreeNode(childNode, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="bg-[#e9eff6] min-h-screen pb-16 font-sans w-full">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4">
          <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-slate-500 bg-white rounded-xl sm:rounded-2xl border border-slate-200/90 shadow-2xs">
            <Loader2 size={36} className="animate-spin text-[#052447] mb-3" />
            <p className="text-sm font-semibold">Carregando organograma da igreja...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="screen-church-overview" className="bg-[#e9eff6] min-h-screen pb-16 font-sans w-full overflow-x-hidden">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 sm:pt-4 pb-4 space-y-4">
        {/* Header */}
        <div className="bg-[#04213d] text-white rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
            <Network size={24} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Visão Geral da Igreja
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Organograma & Estrutura Igreja
            </p>
          </div>
        </div>

        <div className="w-full sm:w-auto flex items-center gap-2 sm:gap-2.5">
          {onNavigatePool && (
            <button
              type="button"
              onClick={onNavigatePool}
              className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 sm:py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer border border-amber-400/30 whitespace-nowrap min-w-0"
            >
              <Users size={14} className="shrink-0" />
              <span>Nossos Membros</span>
            </button>
          )}
          {onNavigateAddUnit && (
            <button
              type="button"
              onClick={() => onNavigateAddUnit(0)}
              className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 sm:py-2.5 bg-[#073366] hover:bg-[#0a468c] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shadow-xs border border-sky-400/30 whitespace-nowrap min-w-0"
            >
              <Plus size={15} className="shrink-0" />
              <span>Cadastrar Unidades</span>
            </button>
          )}
        </div>
      </div>

      {/* KPIs da Igreja */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {levels.map((lvl) => {
          const count = unitCountsByLevel.get(lvl.id) || 0;
          const pluralTitle = getPluralLevelName(lvl.name);
          return (
            <div
              key={lvl.id}
              onClick={() => {
                setSelectedLevelForModal(lvl);
                setModalSearchTerm('');
              }}
              title={`Clique para ver líderes de ${pluralTitle}`}
              className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs cursor-pointer hover:border-sky-400 hover:shadow-md hover:bg-sky-50/20 transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 group-hover:text-sky-800 transition">
                  {pluralTitle}
                </p>
                <Users size={14} className="text-slate-300 group-hover:text-sky-600 transition" />
              </div>
              <p className="text-2xl font-black text-slate-900 mt-1">{count}</p>
              <p className="text-[10px] text-sky-700 font-semibold mt-1 flex items-center gap-1 group-hover:underline">
                Ver líderes &rarr;
              </p>
            </div>
          );
        })}

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Total Membros
            </p>
            <Users size={15} className="text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalMembers}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            <strong className="text-emerald-700">{linkedCount}</strong> em células •{' '}
            <strong className="text-amber-700">{unlinkedCount}</strong> no pool
          </p>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Líderes Ativos
            </p>
            <UserCheck size={15} className="text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-1">{totalUniqueLeaders}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Liderando na estrutura</p>
        </div>
      </div>

      {/* Controles de Árvore */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar na árvore por nome ou líder..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={expandAll}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Expandir Tudo
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Recolher Tudo
          </button>
        </div>
      </div>

      {/* Estrutura da Árvore */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        {filteredTreeRoots.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs px-4">
            <Building2 size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              Nenhuma unidade encontrada na árvore hierárquica.
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto mb-4">
              Comece cadastrando as unidades raiz (ex: {rootLevel?.name || 'Distrito'}) e seus níveis
              subordinados até as células.
            </p>
            {onNavigateAddUnit && (
              <button
                type="button"
                onClick={() => onNavigateAddUnit(0)}
                className="px-4 py-2 bg-[#052447] text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} />
                <span>Cadastrar Primeiro {rootLevel?.name || 'Nível'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTreeRoots.map((rootNode) => renderTreeNode(rootNode, 0))}
          </div>
        )}
        </div>
      </div>

      {/* Modal Compacto Resumido de Líderes por Nível */}
      {selectedLevelForModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => {
            setSelectedLevelForModal(null);
            setModalSearchTerm('');
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho do Modal */}
            <div className="bg-[#04213d] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
                  <Users size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                    Líderes de {getPluralLevelName(selectedLevelForModal.name)}
                  </h3>
                  <p className="text-xs text-sky-200/80 truncate">
                    {modalLeaderItems.length === 1
                      ? '1 líder cadastrado'
                      : `${modalLeaderItems.length} líderes cadastrados`}{' '}
                    • Ordem alfabética
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedLevelForModal(null);
                  setModalSearchTerm('');
                }}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
                aria-label="Fechar modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Busca rápida */}
            {modalLeaderItems.length > 4 && (
              <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    placeholder={`Filtrar por nome do líder ou ${selectedLevelForModal.name.toLowerCase()}...`}
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-sky-800"
                  />
                </div>
              </div>
            )}

            {/* Lista compacta resumida: Nome do Líder - Unidade do Nível (ex: Distrito, Área, Setor, Célula) */}
            <div className="overflow-y-auto divide-y divide-slate-100 flex-1 p-2">
              {filteredModalLeaderItems.length === 0 ? (
                <div className="py-10 text-center text-slate-400 px-4">
                  <Users size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-semibold text-slate-600">
                    {modalLeaderItems.length === 0
                      ? `Nenhum líder cadastrado para este nível (${selectedLevelForModal.name}).`
                      : 'Nenhum resultado para a busca realizada.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {modalLeaderItems.length === 0
                      ? 'Você pode vincular líderes diretamente na edição da unidade organizacional.'
                      : 'Tente buscar com outro termo.'}
                  </p>
                </div>
              ) : (
                filteredModalLeaderItems.map((item) => (
                  <div
                    key={`${item.leaderId}-${item.unitId}`}
                    className="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 rounded-xl transition"
                  >
                    {/* Nome do Líder */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-800 font-bold text-xs flex items-center justify-center shrink-0">
                        {item.leaderName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {item.leaderName}
                        </p>
                        {item.role && item.role !== 'Líder' && (
                          <p className="text-[11px] text-slate-400 truncate">
                            {item.role}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Nome do Nível / Unidade que ele lidera (ex: Distrito, Área, Setor ou Célula) */}
                    <div className="text-right shrink-0">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-100 text-sky-900 text-xs font-semibold max-w-[180px] sm:max-w-[220px] truncate"
                        title={`${selectedLevelForModal.name}: ${item.unitName}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />
                        <span className="truncate">{item.unitName}</span>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Rodapé compacto */}
            <div className="bg-slate-50 p-3 px-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span>
                Total: <strong className="text-slate-800">{filteredModalLeaderItems.length}</strong> {filteredModalLeaderItems.length === 1 ? 'líder' : 'líderes'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedLevelForModal(null);
                  setModalSearchTerm('');
                }}
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
