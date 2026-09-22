'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import {
  Users,
  UserPlus,
  Link as LinkIcon,
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  MapPin,
  Loader2,
  X,
  Check,
  ArrowRight,
  UserCheck,
  ShieldCheck,
  Unlink,
  Filter,
  Sparkles,
} from 'lucide-react';
import {
  UserProfile,
  CellMember,
  OrganizationalUnit,
  CellGroup,
  UserRole,
} from '../types';
import { AppChurchService } from '../lib/supabase';

interface MemberPoolViewProps {
  user: UserProfile;
  onNavigateUnits?: () => void;
  onNavigateOverview?: () => void;
}

export const MemberPoolView: React.FC<MemberPoolViewProps> = ({
  user,
  onNavigateUnits,
  onNavigateOverview,
}) => {
  const [members, setMembers] = useState<(CellMember & { isUnlinked: boolean; cellName?: string })[]>([]);
  const [cells, setCells] = useState<CellGroup[]>([]);
  const [units, setUnits] = useState<OrganizationalUnit[]>([]);
  const [counts, setCounts] = useState<{ total: number; unlinked: number; linked: number }>({
    total: 0,
    unlinked: 0,
    linked: 0,
  });

  const [activeTab, setActiveTab] = useState<'unlinked' | 'all' | 'linked'>('unlinked');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionSuccessBanner, setActionSuccessBanner] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Modal: Vincular Membro à Célula
  const [selectedMemberToAssign, setSelectedMemberToAssign] = useState<
    (CellMember & { isUnlinked: boolean; cellName?: string }) | null
  >(null);
  const [targetCellId, setTargetCellId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState<boolean>(false);

  // Modal: Novo Membro (Pool ou Célula)
  const [isNewMemberModalOpen, setIsNewMemberModalOpen] = useState<boolean>(false);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberPhone, setNewMemberPhone] = useState<string>('');
  const [newMemberEmail, setNewMemberEmail] = useState<string>('');
  const [newMemberNeighborhood, setNewMemberNeighborhood] = useState<string>('Centro');
  const [newMemberRole, setNewMemberRole] = useState<UserRole>('Membro');
  const [newMemberDestination, setNewMemberDestination] = useState<'pool' | 'cell'>('pool');
  const [newMemberCellId, setNewMemberCellId] = useState<string>('');
  const [isCreatingMember, setIsCreatingMember] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [poolRes, cellsRes, unitsRes] = await Promise.all([
          AppChurchService.getMemberPool(user.churchId, 'all'),
          AppChurchService.getCells(user.churchId),
          AppChurchService.getUnits(user.churchId),
        ]);

        if (!isMounted) return;
        setMembers(poolRes.members);
        setCounts(poolRes.counts);
        setCells(cellsRes);
        setUnits(unitsRes);

        if (cellsRes.length > 0) {
          setTargetCellId(cellsRes[0].id);
          setNewMemberCellId(cellsRes[0].id);
        } else if (unitsRes.length > 0) {
          // Encontra unidades do nível mais específico (leaf)
          const leafUnits = unitsRes.filter((u) => !unitsRes.some((other) => other.parentId === u.id));
          if (leafUnits.length > 0) {
            setTargetCellId(leafUnits[0].id);
            setNewMemberCellId(leafUnits[0].id);
          }
        }
      } catch (err: any) {
        console.error('Erro ao carregar pool de membros:', err);
        if (isMounted) {
          setErrorMessage(err?.message || 'Falha ao carregar pool de membros.');
        }
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

  // Células disponíveis para vinculação (apenas nível folha)
  const availableCells = useMemo(() => {
    // Mescla cells com units de nível folha
    const map = new Map<string, { id: string; name: string; sector?: string }>();
    cells.forEach((c) => map.set(c.id, { id: c.id, name: c.name, sector: c.sectorName }));
    units.forEach((u) => {
      // Se não houver outra unidade com parentId apontando para u.id, u é folha (célula)
      const hasChildren = units.some((child) => child.parentId === u.id);
      if (!hasChildren && !map.has(u.id)) {
        map.set(u.id, { id: u.id, name: u.name, sector: u.parentName });
      }
    });
    return Array.from(map.values());
  }, [cells, units]);

  // Filtro de membros
  const filteredMembers = useMemo(() => {
    let list = members;
    if (activeTab === 'unlinked') {
      list = list.filter((m) => m.isUnlinked);
    } else if (activeTab === 'linked') {
      list = list.filter((m) => !m.isUnlinked);
    }

    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        (m.phone && m.phone.toLowerCase().includes(term)) ||
        (m.email && m.email.toLowerCase().includes(term)) ||
        (m.neighborhood && m.neighborhood.toLowerCase().includes(term)) ||
        (m.cellName && m.cellName.toLowerCase().includes(term))
    );
  }, [members, activeTab, searchTerm]);

  // Vincular Membro à Célula
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberToAssign) return;
    if (!targetCellId) {
      setErrorMessage('Selecione uma célula válida para vincular o membro.');
      return;
    }

    setIsAssigning(true);
    setErrorMessage('');

    try {
      const res = await AppChurchService.assignMemberToCell(
        selectedMemberToAssign.id,
        targetCellId,
        user.churchId
      );

      const targetCellObj = availableCells.find((c) => c.id === targetCellId);
      const cellName = targetCellObj?.name || res.cellName || 'Célula';

      // Atualiza estado local
      setMembers((prev) =>
        prev.map((m) =>
          m.id === selectedMemberToAssign.id
            ? { ...m, isUnlinked: false, cellId: targetCellId, cellName }
            : m
        )
      );

      setCounts((prev) => ({
        ...prev,
        unlinked: Math.max(0, prev.unlinked - 1),
        linked: prev.linked + 1,
      }));

      setActionSuccessBanner(
        `Membro "${selectedMemberToAssign.name}" vinculado com sucesso à "${cellName}"!`
      );
      setSelectedMemberToAssign(null);
    } catch (err: any) {
      console.error('Erro ao vincular membro:', err);
      setErrorMessage(err?.message || 'Falha ao vincular membro.');
    } finally {
      setIsAssigning(false);
    }
  };

  // Desvincular Membro (Retornar ao Pool Geral)
  const handleUnassignMember = async (member: CellMember & { isUnlinked: boolean; cellName?: string }) => {
    if (!confirm(`Deseja desvincular "${member.name}" da célula e movê-lo de volta ao Pool Geral da igreja?`)) {
      return;
    }

    try {
      await AppChurchService.assignMemberToCell(member.id, null, user.churchId);

      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id
            ? { ...m, isUnlinked: true, cellId: '', cellName: 'Pool Geral (Sem Célula)' }
            : m
        )
      );

      setCounts((prev) => ({
        ...prev,
        unlinked: prev.unlinked + 1,
        linked: Math.max(0, prev.linked - 1),
      }));

      setActionSuccessBanner(`"${member.name}" foi movido para o Pool Geral da igreja.`);
    } catch (err: any) {
      console.error('Erro ao desvincular membro:', err);
      setErrorMessage(err?.message || 'Falha ao desvincular membro.');
    }
  };

  // Cadastrar Novo Membro
  const handleCreateMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) {
      setErrorMessage('Informe o nome do membro.');
      return;
    }

    setIsCreatingMember(true);
    setErrorMessage('');

    try {
      const destinationCellId =
        newMemberDestination === 'cell' && newMemberCellId ? newMemberCellId : null;

      const created = await AppChurchService.createMemberInPool({
        churchId: user.churchId,
        name: newMemberName.trim(),
        phone: newMemberPhone.trim() || undefined,
        email: newMemberEmail.trim() || undefined,
        neighborhood: newMemberNeighborhood.trim() || 'Centro',
        role: newMemberRole,
        cellId: destinationCellId,
      });

      const cellObj = destinationCellId
        ? availableCells.find((c) => c.id === destinationCellId)
        : null;

      const newMemberItem = {
        ...created,
        isUnlinked: !destinationCellId,
        cellName: cellObj ? cellObj.name : 'Pool Geral (Sem Célula)',
      };

      setMembers((prev) => [newMemberItem, ...prev]);
      setCounts((prev) => ({
        total: prev.total + 1,
        unlinked: destinationCellId ? prev.unlinked : prev.unlinked + 1,
        linked: destinationCellId ? prev.linked + 1 : prev.linked,
      }));

      setActionSuccessBanner(
        destinationCellId
          ? `Membro "${created.name}" cadastrado e vinculado à "${cellObj?.name}"!`
          : `Membro "${created.name}" adicionado com sucesso ao Pool Geral da igreja!`
      );

      // Limpa formulário
      setNewMemberName('');
      setNewMemberPhone('');
      setNewMemberEmail('');
      setIsNewMemberModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao cadastrar membro:', err);
      setErrorMessage(err?.message || 'Falha ao cadastrar membro.');
    } finally {
      setIsCreatingMember(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-slate-500">
        <Loader2 size={36} className="animate-spin text-[#052447] mb-3" />
        <p className="text-sm font-semibold">Carregando Pool Geral de Membros...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header com Contexto */}
      <div className="bg-[#04213d] text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shrink-0">
            <Users size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-300">
                Banco de Pessoas
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-xs text-slate-300 font-medium">{user.churchName}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Pool Geral de Membros
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Gerencie membros da congregação e vincule pessoas do pool diretamente às células
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsNewMemberModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <UserPlus size={16} />
            <span>+ Novo Membro</span>
          </button>
          {onNavigateUnits && (
            <button
              type="button"
              onClick={onNavigateUnits}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer border border-white/10"
            >
              <Building2 size={15} />
              <span>Níveis Organizacionais</span>
            </button>
          )}
        </div>
      </div>

      {/* Cards de Métricas do Pool */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500">Total de Membros</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{counts.total}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-amber-200 bg-amber-50/30 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-amber-800">No Pool Geral (Sem Célula)</p>
            <p className="text-2xl font-black text-amber-900 mt-0.5">{counts.unlinked}</p>
            <span className="text-[10px] text-amber-700">Disponíveis para vínculo</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
            <LinkIcon size={18} />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-emerald-200 bg-emerald-50/30 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-emerald-800">Vinculados em Células</p>
            <p className="text-2xl font-black text-emerald-900 mt-0.5">{counts.linked}</p>
            <span className="text-[10px] text-emerald-700">Ativos em grupos pequenos</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
            <UserCheck size={20} />
          </div>
        </div>
      </div>

      {/* Mensagens de Sucesso ou Erro */}
      {actionSuccessBanner && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-900 text-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span className="font-semibold">{actionSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessBanner('')}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-3 cursor-pointer"
          >
            Dispensar
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Controle de Filtros e Busca */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Abas */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('unlinked')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'unlinked'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Pool Geral</span>
            <span className="px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
              {counts.unlinked}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Todos os Membros</span>
            <span className="px-1.5 py-0.2 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold">
              {counts.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('linked')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'linked'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Vinculados</span>
            <span className="px-1.5 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              {counts.linked}
            </span>
          </button>
        </div>

        {/* Busca */}
        <div className="relative w-full sm:w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, telefone, bairro ou célula..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
          />
        </div>
      </div>

      {/* Lista de Membros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredMembers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs px-4">
            <Users size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">
              {activeTab === 'unlinked'
                ? 'Nenhum membro no Pool Geral no momento.'
                : 'Nenhum membro encontrado com os filtros atuais.'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
              {activeTab === 'unlinked'
                ? 'Todos os membros da congregação já estão vinculados a células ativas.'
                : 'Clique em "+ Novo Membro" para cadastrar uma nova pessoa.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="p-4 sm:p-4.5 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 shrink-0 text-sm overflow-hidden">
                    {member.avatarUrl ? (
                      <Image
                        src={member.avatarUrl}
                        alt={member.name}
                        width={40}
                        height={40}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      member.name.charAt(0)
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        {member.name}
                      </h3>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {member.role || 'Membro'}
                      </span>
                      {member.isUnlinked ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          Pool Geral (Sem Célula)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {member.cellName}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1">
                      {member.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={11} className="text-slate-400" />
                          {member.phone}
                        </span>
                      )}
                      {member.email && (
                        <span className="flex items-center gap-1">
                          <Mail size={11} className="text-slate-400" />
                          {member.email}
                        </span>
                      )}
                      {member.neighborhood && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="text-slate-400" />
                          {member.neighborhood}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {member.isUnlinked ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMemberToAssign(member);
                        if (availableCells.length > 0 && !targetCellId) {
                          setTargetCellId(availableCells[0].id);
                        }
                      }}
                      className="px-3.5 py-1.5 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <LinkIcon size={13} />
                      <span>Vincular à Célula</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUnassignMember(member)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer border border-slate-200 hover:border-red-200"
                      title="Mover de volta para o Pool Geral"
                    >
                      <Unlink size={13} />
                      <span>Desvincular</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Vincular Membro à Célula */}
      {selectedMemberToAssign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#04213d] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-300 flex items-center justify-center">
                  <LinkIcon size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Vincular Membro à Célula</h3>
                  <p className="text-[11px] text-slate-300">
                    Regra: Membros só podem pertencer a células (nível folha)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMemberToAssign(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[11px] text-slate-500 font-semibold uppercase">Membro Selecionado</p>
                <p className="text-sm font-bold text-slate-900 mt-0.5">{selectedMemberToAssign.name}</p>
                <p className="text-xs text-slate-500">
                  {selectedMemberToAssign.phone || selectedMemberToAssign.email || 'Sem contato'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Selecione a Célula de Destino *
                </label>
                {availableCells.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                    Nenhuma célula cadastrada na igreja ainda. Cadastre uma célula primeiro na aba de
                    Níveis Organizacionais.
                  </div>
                ) : (
                  <select
                    required
                    value={targetCellId}
                    onChange={(e) => setTargetCellId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer"
                  >
                    {availableCells.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.sector ? `(${c.sector})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  O membro passará a constar na lista de frequência e relatórios desta célula.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedMemberToAssign(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAssigning || availableCells.length === 0}
                  className="px-5 py-2 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isAssigning ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Vinculando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Confirmar Vínculo</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Novo Membro (Pool ou Célula) */}
      {isNewMemberModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#04213d] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Cadastrar Novo Membro</h3>
                  <p className="text-[11px] text-slate-300">
                    Adicione ao Pool Geral ou vincule diretamente a uma célula
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewMemberModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateMemberSubmit} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Nome do membro"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={newMemberPhone}
                    onChange={(e) => setNewMemberPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Bairro</label>
                  <input
                    type="text"
                    value={newMemberNeighborhood}
                    onChange={(e) => setNewMemberNeighborhood(e.target.value)}
                    placeholder="Ex: Centro"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Função / Perfil</label>
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer"
                  >
                    <option value="Membro">Membro</option>
                    <option value="Líder de Célula">Líder de Célula</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Líder de Setor">Líder de Setor</option>
                    <option value="Líder de Área">Líder de Área</option>
                    <option value="Pastor">Pastor</option>
                  </select>
                </div>
              </div>

              {/* Escolha do Destino: Pool Geral vs Célula */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-2">Destino do Membro</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div
                    onClick={() => setNewMemberDestination('pool')}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                      newMemberDestination === 'pool'
                        ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <p className="font-bold flex items-center gap-1.5">
                      <Users size={14} className="text-amber-700" />
                      <span>Pool Geral da Igreja</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                      Fica disponível no banco geral para vínculo posterior por líderes.
                    </p>
                  </div>

                  <div
                    onClick={() => setNewMemberDestination('cell')}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition ${
                      newMemberDestination === 'cell'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <p className="font-bold flex items-center gap-1.5">
                      <UserCheck size={14} className="text-emerald-700" />
                      <span>Vincular a Célula Agora</span>
                    </p>
                    <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                      Associa imediatamente a uma célula ativa da congregação.
                    </p>
                  </div>
                </div>

                {newMemberDestination === 'cell' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Célula de Destino *
                    </label>
                    {availableCells.length === 0 ? (
                      <p className="text-xs text-red-600">
                        Nenhuma célula cadastrada. Cadastre uma célula primeiro.
                      </p>
                    ) : (
                      <select
                        required
                        value={newMemberCellId}
                        onChange={(e) => setNewMemberCellId(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-sky-800 cursor-pointer"
                      >
                        {availableCells.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.sector ? `(${c.sector})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewMemberModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingMember}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isCreatingMember ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      <span>Cadastrar Membro</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
