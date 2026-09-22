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

export const ChurchHierarchyOverviewView: React.FC<ChurchHierarchyOverviewViewProps> = ({
  user,
  onNavigateAddUnit,
  onNavigatePool,
}) => {
  const [levels, setLevels] = useState<ChurchHierarchicalLevel[]>([]);
  const [units, setUnits] = useState<OrganizationalUnit[]>([]);
  const [members, setMembers] = useState<CellMember[]>([]);
  const [unlinkedCount, setUnlinkedCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

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
        setMembers(fetchedPool.members);
        setUnlinkedCount(fetchedPool.counts.unlinked);
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

  // Montagem da árvore a partir das unidades raiz (sem pai ou pertencentes ao nível 1)
  const treeRoots = useMemo(() => {
    if (!rootLevel) return [];

    const rootUnits = units.filter(
      (u) => u.levelTypeId === rootLevel.id || !u.parentId
    );

    const buildSubtree = (parentUnit: OrganizationalUnit): TreeNode => {
      const childrenUnits = units.filter((u) => u.parentId === parentUnit.id);
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
    const isLeaf = node.children.length === 0 && node.unit.levelTypeId === leafLevel?.id;
    const isCollapsed = collapsedNodeIds.has(node.unit.id);
    const hasChildren = node.children.length > 0;

    // Encontrar índice do nível atual e do próximo nível para o botão "+ Filho"
    const currentLevelIdx = levels.findIndex((l) => l.id === node.unit.levelTypeId);
    const nextLevel = currentLevelIdx >= 0 && currentLevelIdx < levels.length - 1 ? levels[currentLevelIdx + 1] : null;

    return (
      <div key={node.unit.id} className="relative">
        {/* Linha de conexão vertical para níveis filhos */}
        {depth > 0 && (
          <div
            className="absolute -left-5 top-5 w-5 h-px bg-slate-300"
            aria-hidden="true"
          />
        )}

        <div
          className={`p-3.5 sm:p-4 rounded-2xl border transition shadow-xs ${
            isLeaf
              ? 'bg-emerald-50/40 border-emerald-200/90'
              : depth === 0
              ? 'bg-slate-900 text-white border-slate-800'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleCollapse(node.unit.id)}
                  className={`p-1 rounded-lg transition cursor-pointer ${
                    depth === 0
                      ? 'text-slate-300 hover:text-white hover:bg-white/10'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title={isCollapsed ? 'Expandir' : 'Recolher'}
                >
                  {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                </button>
              ) : (
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isLeaf ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      depth === 0
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                        : isLeaf
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {node.unit.levelTypeName}
                  </span>

                  <h3
                    className={`text-xs sm:text-sm font-bold ${
                      depth === 0 ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {node.unit.name}
                  </h3>

                  {isLeaf && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600 text-white">
                      {node.unit.memberCount || 0} membros
                    </span>
                  )}
                </div>

                {/* Líderes vinculados */}
                {node.unit.leaders.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <span
                      className={`text-[10px] ${
                        depth === 0 ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Liderança:
                    </span>
                    {node.unit.leaders.map((ldr) => (
                      <span
                        key={ldr.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                          depth === 0
                            ? 'bg-slate-800 text-slate-200 border border-slate-700'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        <UserCheck size={11} className={depth === 0 ? 'text-sky-300' : 'text-sky-700'} />
                        <span>{ldr.name}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p
                    className={`text-[10px] mt-1 ${
                      depth === 0 ? 'text-amber-300' : 'text-amber-700'
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                    depth === 0
                      ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
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
          <div className="pl-6 sm:pl-8 ml-3 sm:ml-4 border-l-2 border-slate-200 space-y-3 mt-3 relative">
            {node.children.map((childNode) => renderTreeNode(childNode, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-slate-500">
        <Loader2 size={36} className="animate-spin text-[#052447] mb-3" />
        <p className="text-sm font-semibold">Carregando organograma da igreja...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="bg-[#04213d] text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
            <Network size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                Organograma & Estrutura
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-xs text-slate-300 font-medium">{user.churchName}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Visão Geral da Igreja
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Estrutura hierárquica completa montada do topo até as células
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigatePool && (
            <button
              type="button"
              onClick={onNavigatePool}
              className="px-3.5 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-amber-400/30"
            >
              <Users size={14} />
              <span>Pool Geral ({unlinkedCount} sem célula)</span>
            </button>
          )}
          {onNavigateAddUnit && (
            <button
              type="button"
              onClick={() => onNavigateAddUnit(0)}
              className="px-4 py-2.5 bg-[#073366] hover:bg-[#0a468c] text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs border border-sky-400/30"
            >
              <Plus size={15} />
              <span>Cadastrar Unidades</span>
            </button>
          )}
        </div>
      </div>

      {/* KPIs da Igreja */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {levels.map((lvl) => {
          const count = unitCountsByLevel.get(lvl.id) || 0;
          return (
            <div
              key={lvl.id}
              className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {lvl.name}s
                </p>
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                  {lvl.order / 10}
                </span>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-1">{count}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {count === 1 ? `1 ${lvl.name.toLowerCase()} ativo` : `${count} ${lvl.name.toLowerCase()}s ativos`}
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
          <p className="text-2xl font-black text-slate-900 mt-1">{members.length}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            <strong className="text-emerald-700">{members.length - unlinkedCount}</strong> em células •{' '}
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
          <p className="text-[11px] text-slate-400 mt-0.5">Em todas as unidades</p>
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
  );
};
