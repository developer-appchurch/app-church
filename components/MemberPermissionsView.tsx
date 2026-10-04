'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Users,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Unlock,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { UserProfile, MemberEffectivePermission } from '@/types';
import { AppChurchService } from '@/lib/supabase';

interface MemberPermissionsViewProps {
  currentUser: UserProfile;
  onBack?: () => void;
}

interface MemberSummaryItem {
  id: string;
  name: string;
  login?: string;
  role: string;
  cellName?: string;
  avatarUrl?: string;
  phone?: string;
  email?: string;
}

const MemberAvatar: React.FC<{ name: string; avatarUrl?: string; size?: number }> = React.memo(
  ({ name, avatarUrl, size = 36 }) => {
    const [hasError, setHasError] = useState(false);
    const initials = (name || '?')
      .split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase();

    const colorIndex = (name.charCodeAt(0) || 0) % 5;
    const bgColors = [
      'bg-sky-100 text-sky-800 border-sky-200',
      'bg-indigo-100 text-indigo-800 border-indigo-200',
      'bg-emerald-100 text-emerald-800 border-emerald-200',
      'bg-amber-100 text-amber-800 border-amber-200',
      'bg-purple-100 text-purple-800 border-purple-200',
    ];

    if (!avatarUrl || hasError) {
      return (
        <div
          style={{ width: size, height: size }}
          className={`rounded-full border flex items-center justify-center font-bold text-[10px] sm:text-xs shrink-0 select-none shadow-2xs ${bgColors[colorIndex]}`}
        >
          {initials}
        </div>
      );
    }

    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 shrink-0 text-xs overflow-hidden relative shadow-2xs"
      >
        <Image
          src={avatarUrl}
          alt={name}
          width={size}
          height={size}
          unoptimized
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }
);
MemberAvatar.displayName = 'MemberAvatar';

export const MemberPermissionsView: React.FC<MemberPermissionsViewProps> = ({
  currentUser,
  onBack,
}) => {
  // Estado de busca de membros
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [membersList, setMembersList] = useState<MemberSummaryItem[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Membro selecionado e suas permissões
  const [selectedMember, setSelectedMember] = useState<MemberSummaryItem | null>(null);
  const [memberPermissions, setMemberPermissions] = useState<MemberEffectivePermission[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [updatingPermId, setUpdatingPermId] = useState<string | null>(null);

  // Filtros internos na lista de permissões
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [permissionQuery, setPermissionQuery] = useState('');

  // Notificações e feedback
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Aba móvel (seletor vs permissões)
  const [mobileTab, setMobileTab] = useState<'members' | 'permissions'>('members');

  // Debounce na busca de membros
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Carrega lista de membros para seleção
  const fetchMembers = useCallback(async () => {
    try {
      setIsLoadingMembers(true);
      const churchId = currentUser.churchId;
      let url = `/api/members/pool?churchId=${encodeURIComponent(churchId)}&filter=all&limit=50`;
      if (debouncedSearch.trim()) {
        url += `&search=${encodeURIComponent(debouncedSearch.trim())}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao buscar membros');
      const data = await res.json().catch(() => ({}));

      if (data?.members) {
        const mapped: MemberSummaryItem[] = data.members.map((m: any) => ({
          id: m.id,
          name: m.name,
          login: m.login,
          role: m.role || 'Membro',
          cellName: m.cellName || '',
          avatarUrl: m.avatarUrl,
          phone: m.phone,
        }));
        setMembersList(mapped);

        // Se ainda não tiver nenhum selecionado, seleciona o primeiro
        if (!selectedMember && mapped.length > 0) {
          setSelectedMember(mapped[0]);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar lista de membros:', err);
    } finally {
      setIsLoadingMembers(false);
    }
  }, [currentUser.churchId, debouncedSearch, selectedMember]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Carrega permissões efetivas do membro selecionado
  const loadMemberPermissions = useCallback(async (memberId: string) => {
    try {
      setIsLoadingPermissions(true);
      const data = await AppChurchService.getMemberPermissions(memberId, currentUser.churchId);
      if (data?.permissions) {
        setMemberPermissions(data.permissions);
      }
    } catch (err: any) {
      console.error('Erro ao carregar permissões do membro:', err);
      setFeedbackToast({
        type: 'error',
        message: err?.message || 'Falha ao carregar permissões do membro selecionado.',
      });
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [currentUser.churchId]);

  useEffect(() => {
    if (selectedMember?.id) {
      loadMemberPermissions(selectedMember.id);
    }
  }, [selectedMember?.id, loadMemberPermissions]);

  // Toggle de override (conceder / revogar / resetar ao padrão)
  const handleTogglePermission = async (
    permission: MemberEffectivePermission,
    targetOverride: boolean | null
  ) => {
    if (!selectedMember) return;
    setUpdatingPermId(permission.id);

    // Atualização otimista imediata na UI
    const previousPermissions = [...memberPermissions];
    setMemberPermissions((prev) =>
      prev.map((p) => {
        if (p.id === permission.id) {
          const effective = targetOverride !== null ? targetOverride : p.inherited;
          return {
            ...p,
            override: targetOverride,
            effective,
          };
        }
        return p;
      })
    );

    try {
      const res = await AppChurchService.updateMemberPermissionOverride({
        memberId: selectedMember.id,
        permissionId: permission.id,
        permissionCode: permission.code,
        concedida: targetOverride,
      });

      setFeedbackToast({
        type: 'success',
        message: res?.message || 'Permissão atualizada com sucesso.',
      });

      // Recarrega permissões em segundo plano para garantir consistência total
      await loadMemberPermissions(selectedMember.id);
    } catch (err: any) {
      // Reverte em caso de erro
      setMemberPermissions(previousPermissions);
      setFeedbackToast({
        type: 'error',
        message: err?.message || 'Erro ao salvar permissão.',
      });
    } finally {
      setUpdatingPermId(null);
      setTimeout(() => setFeedbackToast(null), 3500);
    }
  };

  // Resetar todos os overrides do membro de volta para o padrão da função
  const handleResetAllOverrides = async () => {
    if (!selectedMember) return;
    const overrides = memberPermissions.filter((p) => p.override !== null);
    if (overrides.length === 0) return;

    if (!window.confirm(`Deseja restaurar todas as permissões de ${selectedMember.name} para o padrão da função "${selectedMember.role}"?`)) {
      return;
    }

    try {
      setIsLoadingPermissions(true);
      for (const p of overrides) {
        await AppChurchService.updateMemberPermissionOverride({
          memberId: selectedMember.id,
          permissionId: p.id,
          concedida: null,
        });
      }
      setFeedbackToast({
        type: 'success',
        message: `Todas as permissões de ${selectedMember.name} foram restauradas para o padrão.`,
      });
      await loadMemberPermissions(selectedMember.id);
    } catch (err: any) {
      setFeedbackToast({
        type: 'error',
        message: err?.message || 'Erro ao restaurar permissões.',
      });
    } finally {
      setIsLoadingPermissions(false);
      setTimeout(() => setFeedbackToast(null), 3500);
    }
  };

  // Módulos únicos para filtro
  const modulesList = useMemo(() => {
    const set = new Set<string>();
    memberPermissions.forEach((p) => {
      if (p.module) set.add(p.module);
    });
    return Array.from(set).sort();
  }, [memberPermissions]);

  // Permissões filtradas por módulo e texto
  const filteredPermissions = useMemo(() => {
    return memberPermissions.filter((p) => {
      if (selectedModule !== 'all' && p.module !== selectedModule) {
        return false;
      }
      if (permissionQuery.trim()) {
        const q = permissionQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [memberPermissions, selectedModule, permissionQuery]);

  // Contadores de estatísticas do membro
  const stats = useMemo(() => {
    const total = memberPermissions.length;
    const active = memberPermissions.filter((p) => p.effective).length;
    const grantedOverrides = memberPermissions.filter((p) => p.override === true).length;
    const revokedOverrides = memberPermissions.filter((p) => p.override === false).length;
    return { total, active, grantedOverrides, revokedOverrides };
  }, [memberPermissions]);

  return (
    <div className="min-h-screen bg-slate-50/70 p-2 sm:p-5 lg:p-6 pb-20">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div className="fixed top-14 sm:top-16 right-3 sm:right-8 z-50 animate-in fade-in slide-in-from-top-2 duration-200 max-w-[90vw]">
          <div
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl shadow-lg border text-xs sm:text-sm font-semibold ${
              feedbackToast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900 shadow-emerald-950/10'
                : 'bg-rose-50 border-rose-200 text-rose-900 shadow-rose-950/10'
            }`}
          >
            {feedbackToast.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
            )}
            <span className="truncate">{feedbackToast.message}</span>
          </div>
        </div>
      )}

      {/* Header com Navegação */}
      <div className="max-w-7xl mx-auto mb-3 sm:mb-5">
        <div className="bg-[#04213d] text-white rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                Gestão de Permissões
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5 truncate">
                Conceda ou revogue permissões individuais com prioridade sobre a função.
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 self-start sm:self-center">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-200 border border-sky-400/30">
              <Sparkles size={12} className="text-sky-300" />
              Prioridade: Indivíduo &gt; Papel
            </span>
          </div>
        </div>

        {/* Tab switch compacto em telas pequenas */}
        <div className="flex lg:hidden mt-2 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
          <button
            type="button"
            onClick={() => setMobileTab('members')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
              mobileTab === 'members'
                ? 'bg-[#04213d] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Membros ({membersList.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('permissions')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
              mobileTab === 'permissions'
                ? 'bg-[#04213d] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Permissões {selectedMember ? `• ${selectedMember.name.split(' ')[0]}` : ''}
          </button>
        </div>
      </div>

      {/* Grid de Duas Colunas: Seletor à Esquerda e Painel de Permissões à Direita */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 items-start">
        {/* ======================================================== */}
        {/* COLUNA ESQUERDA: Seletor de Membros (4 cols) */}
        {/* ======================================================== */}
        <div
          className={`lg:col-span-4 bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[calc(100vh-190px)] min-h-[480px] lg:h-[720px] overflow-hidden ${
            mobileTab === 'permissions' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Header da Coluna */}
          <div className="p-2.5 sm:p-3.5 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Users size={14} className="text-slate-600" />
                <h2 className="font-bold text-slate-800 text-xs sm:text-sm">Selecionar Membro</h2>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">{membersList.length} encontrados</span>
            </div>

            {/* Input de Busca de Membro */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar membro..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition"
              />
              {isLoadingMembers && (
                <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sky-600 animate-spin" />
              )}
            </div>
          </div>

          {/* Lista de Membros com Rolagem */}
          <div className="flex-1 overflow-y-auto p-1.5 sm:p-2 divide-y divide-slate-100/80">
            {membersList.length === 0 && !isLoadingMembers && (
              <div className="p-6 text-center">
                <Users size={24} className="mx-auto text-slate-300 mb-1" />
                <p className="text-xs font-semibold text-slate-600">Nenhum membro encontrado</p>
                <p className="text-[10px] text-slate-400">Tente buscar por outro termo.</p>
              </div>
            )}

            {membersList.map((m) => {
              const isSelected = selectedMember?.id === m.id;
              const isPastor = m.role.toLowerCase().includes('pastor');
              const isLeader = m.role.toLowerCase().includes('líder') || m.role.toLowerCase().includes('lider');

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMember(m);
                    setMobileTab('permissions');
                  }}
                  className={`w-full text-left p-2 sm:p-2.5 rounded-lg sm:rounded-xl transition flex items-center gap-2.5 cursor-pointer group ${
                    isSelected
                      ? 'bg-sky-50 border border-sky-200 shadow-2xs'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <MemberAvatar name={m.name} avatarUrl={m.avatarUrl} size={34} />

                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate leading-tight ${isSelected ? 'text-sky-950' : 'text-slate-800'}`}>
                      {m.name}
                    </p>

                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${
                          isPastor
                            ? 'bg-purple-100 text-purple-800'
                            : isLeader
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {m.role}
                      </span>

                      {m.cellName && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[110px]">
                          • {m.cellName}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight
                    size={14}
                    className={`transition shrink-0 ${
                      isSelected ? 'text-sky-600 translate-x-0.5' : 'text-slate-300 group-hover:text-slate-400'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* ======================================================== */}
        {/* COLUNA DIREITA: Painel de Permissões (8 cols) */}
        {/* ======================================================== */}
        <div
          className={`lg:col-span-8 bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[calc(100vh-190px)] min-h-[480px] lg:h-[720px] overflow-hidden ${
            mobileTab === 'members' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {selectedMember ? (
            <>
              {/* Header do Membro Selecionado - Ultra Compacto no Mobile */}
              <div className="p-2.5 sm:p-4 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MemberAvatar name={selectedMember.name} avatarUrl={selectedMember.avatarUrl} size={38} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h2 className="text-xs sm:text-base font-black text-slate-900 truncate">
                          {selectedMember.name}
                        </h2>
                        {selectedMember.login && (
                          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">@{selectedMember.login}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-600 truncate mt-0.5">
                        <span className="font-semibold text-slate-700 bg-slate-200/60 px-1.5 py-0.2 rounded">
                          {selectedMember.role}
                        </span>
                        {selectedMember.cellName && <span className="truncate text-slate-500">• {selectedMember.cellName}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Botão de Restaurar ao Padrão */}
                  {(stats.grantedOverrides > 0 || stats.revokedOverrides > 0) && (
                    <button
                      type="button"
                      onClick={handleResetAllOverrides}
                      disabled={isLoadingPermissions}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition cursor-pointer shrink-0 disabled:opacity-50"
                      title="Apaga todos os overrides individuais e volta às regras da função"
                    >
                      <RotateCcw size={11} />
                      <span className="hidden sm:inline">Restaurar padrão</span>
                      <span className="sm:hidden">Reset</span>
                    </button>
                  )}
                </div>

                {/* Resumo de Estatísticas do Membro - Micro Cards Compactos */}
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mt-2.5 pt-2 border-t border-slate-200/60">
                  <div className="bg-white p-1.5 sm:p-2 rounded-lg border border-slate-200/70 shadow-2xs text-center">
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider block leading-tight">
                      Ativos
                    </span>
                    <span className="text-xs sm:text-sm font-black text-slate-800 leading-tight">
                      {stats.active} <span className="text-[9px] font-normal text-slate-400">/{stats.total}</span>
                    </span>
                  </div>

                  <div className="bg-white p-1.5 sm:p-2 rounded-lg border border-slate-200/70 shadow-2xs text-center">
                    <span className="text-[8px] sm:text-[9px] font-bold text-emerald-600 uppercase tracking-wider block leading-tight truncate">
                      Concedidos
                    </span>
                    <span className="text-xs sm:text-sm font-black text-emerald-700 leading-tight">
                      +{stats.grantedOverrides}
                    </span>
                  </div>

                  <div className="bg-white p-1.5 sm:p-2 rounded-lg border border-slate-200/70 shadow-2xs text-center">
                    <span className="text-[8px] sm:text-[9px] font-bold text-rose-600 uppercase tracking-wider block leading-tight truncate">
                      Revogados
                    </span>
                    <span className="text-xs sm:text-sm font-black text-rose-700 leading-tight">
                      -{stats.revokedOverrides}
                    </span>
                  </div>

                  <div className="bg-white p-1.5 sm:p-2 rounded-lg border border-slate-200/70 shadow-2xs text-center">
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider block leading-tight">
                      Função
                    </span>
                    <span className="text-[10px] sm:text-xs font-bold text-slate-700 leading-tight block truncate mt-0.5">
                      {selectedMember.role.split(' ')[0]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Barra de Filtros e Busca de Permissão Compacta */}
              <div className="p-2 sm:px-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                {/* Filtro por Módulo */}
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => setSelectedModule('all')}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      selectedModule === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Todos ({memberPermissions.length})
                  </button>
                  {modulesList.map((mod) => (
                    <button
                      key={mod}
                      type="button"
                      onClick={() => setSelectedModule(mod)}
                      className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                        selectedModule === mod
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {mod}
                    </button>
                  ))}
                </div>

                {/* Busca rápida de permissão */}
                <div className="relative w-full sm:w-44">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={permissionQuery}
                    onChange={(e) => setPermissionQuery(e.target.value)}
                    placeholder="Filtrar..."
                    className="w-full pl-6 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-[11px] sm:text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition"
                  />
                </div>
              </div>

              {/* Lista de Permissões com Toggles Compactos */}
              <div className="flex-1 overflow-y-auto p-2 sm:p-3.5 space-y-1.5 sm:space-y-2 bg-slate-50/40">
                {isLoadingPermissions && (
                  <div className="p-8 text-center">
                    <Loader2 size={22} className="mx-auto text-sky-600 animate-spin mb-1.5" />
                    <p className="text-[11px] sm:text-xs font-bold text-slate-600">Carregando permissões...</p>
                  </div>
                )}

                {!isLoadingPermissions && filteredPermissions.length === 0 && (
                  <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
                    <ShieldAlert size={26} className="mx-auto text-slate-300 mb-1" />
                    <p className="text-xs font-bold text-slate-700">Nenhuma permissão encontrada</p>
                    <p className="text-[10px] text-slate-400">Ajuste o filtro ou a busca.</p>
                  </div>
                )}

                {!isLoadingPermissions &&
                  filteredPermissions.map((perm) => {
                    const isInherited = perm.inherited;
                    const hasOverride = perm.override !== null;
                    const isGrantedOverride = perm.override === true;
                    const isRevokedOverride = perm.override === false;
                    const isEffective = perm.effective;
                    const isUpdating = updatingPermId === perm.id;

                    return (
                      <div
                        key={perm.id}
                        className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl border transition-all ${
                          hasOverride
                            ? isGrantedOverride
                              ? 'bg-emerald-50/60 border-emerald-300 shadow-2xs'
                              : 'bg-rose-50/60 border-rose-300 shadow-2xs'
                            : isEffective
                            ? 'bg-white border-slate-200/90'
                            : 'bg-slate-50/80 border-slate-200/60 opacity-75'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0 pr-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight leading-tight">
                                {perm.name}
                              </h3>

                              {/* Badges de Estado Compactas */}
                              {isGrantedOverride && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200">
                                  <Unlock size={8} /> +Concedida
                                </span>
                              )}

                              {isRevokedOverride && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-rose-800 bg-rose-100 px-1.5 py-0.2 rounded border border-rose-200">
                                  <Lock size={8} /> -Revogada
                                </span>
                              )}

                              {!hasOverride && (
                                <span className="text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {isInherited ? 'Herdado' : 'Sem acesso'}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[9px] text-slate-400 bg-slate-100 px-1 rounded">
                                {perm.code}
                              </span>
                              {perm.description && (
                                <p className="text-[10px] sm:text-xs text-slate-500 truncate max-w-xs sm:max-w-md">
                                  {perm.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Controles de Ação (Toggles e Reset) */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Botão de remover override e voltar ao padrão */}
                            {hasOverride && (
                              <button
                                type="button"
                                onClick={() => handleTogglePermission(perm, null)}
                                disabled={isUpdating}
                                className="text-[10px] font-bold text-slate-400 hover:text-slate-800 hover:underline px-1 py-0.5 transition cursor-pointer disabled:opacity-50"
                                title="Restaurar padrão da função"
                              >
                                Reset
                              </button>
                            )}

                            {/* Botão de Toggle Conceder / Revogar */}
                            <button
                              type="button"
                              onClick={() => {
                                const nextState = !isEffective;
                                handleTogglePermission(perm, nextState);
                              }}
                              disabled={isUpdating}
                              className={`relative inline-flex h-5 w-9 sm:h-6 sm:w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                                isEffective ? 'bg-emerald-600' : 'bg-slate-300'
                              }`}
                              role="switch"
                              aria-checked={isEffective}
                              title={isEffective ? 'Clique para revogar' : 'Clique para conceder'}
                            >
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-4 w-4 sm:h-5 sm:w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                  isEffective ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50/50">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 mb-2">
                <Sliders size={20} />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Selecione um membro</h3>
              <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                Escolha um membro à esquerda para gerenciar suas permissões.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
