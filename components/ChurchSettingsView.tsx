'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Settings,
  ArrowLeft,
  MapPin,
  Award,
  Layers,
  KeyRound,
  Plus,
  Pencil,
  Check,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  EyeOff,
  Eye,
  Users,
  ChevronUp,
  ChevronDown,
  Trash2,
  ShieldCheck,
  Circle,
  Lock,
  Unlock,
  Copy,
  RotateCcw,
  Search,
  ArrowRightLeft,
  CheckSquare,
  Square,
} from 'lucide-react';
import { UserProfile, Neighborhood, TrackStep, ChurchHierarchicalLevel, OrganizationalUnit } from '@/types';
import { AppChurchService } from '@/lib/supabase';

type TrackStepWithProgress = TrackStep & { progressCount: number };

interface ChurchSettingsViewProps {
  currentUser: UserProfile;
  onBack?: () => void;
  onNavigateToUnits?: () => void;
}

type SettingsTab = 'track' | 'units' | 'neighborhoods' | 'logins';

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: React.ElementType;
  permissionCode: string;
}

const TABS: TabDef[] = [
  { id: 'track', label: 'Trilho de Liderança', icon: Award, permissionCode: 'track:manage' },
  { id: 'units', label: 'Setores e Células', icon: Layers, permissionCode: 'unit:transfer_delete' },
  { id: 'neighborhoods', label: 'Bairros', icon: MapPin, permissionCode: 'neighborhood:manage' },
  { id: 'logins', label: 'Gestão de Logins', icon: KeyRound, permissionCode: 'member:access_manage' },
];

export const ChurchSettingsView: React.FC<ChurchSettingsViewProps> = ({
  currentUser,
  onBack,
  onNavigateToUnits,
}) => {
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    AppChurchService.getUserEffectivePermissions(currentUser)
      .then((map) => {
        if (mounted) setUserPermissions(map || {});
      })
      .catch((err) => console.warn('Erro ao carregar permissões efetivas:', err));
    return () => {
      mounted = false;
    };
  }, [currentUser]);

  const visibleTabs = useMemo(
    () =>
      TABS.filter(
        (tab) =>
          AppChurchService.hasPermission(currentUser, 'church:admin', userPermissions) ||
          AppChurchService.hasPermission(currentUser, tab.permissionCode, userPermissions)
      ),
    [currentUser, userPermissions]
  );

  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);

  useEffect(() => {
    if (!activeTab && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].id);
    }
  }, [activeTab, visibleTabs]);

  return (
    <div className="min-h-screen bg-slate-50/70 p-2 sm:p-5 lg:p-6 pb-20">
      {/* Header */}
      <div className="max-w-5xl mx-auto mb-3 sm:mb-5">
        <div className="flex items-center gap-2.5 bg-white p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 sm:p-2 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg sm:rounded-xl transition cursor-pointer"
              title="Voltar"
              aria-label="Voltar"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
                <Settings size={14} className="sm:w-[18px] sm:h-[18px]" />
              </div>
              <h1 className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight truncate">
                Configurações da Igreja
              </h1>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate max-w-xl">
              Trilho, Setores e Células, Bairros e Gestão de Logins em um só lugar.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-2 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs overflow-x-auto">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-5xl mx-auto">
        {visibleTabs.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center text-slate-500 text-sm">
            Você não tem permissão para acessar nenhuma configuração da igreja.
          </div>
        )}
        {activeTab === 'neighborhoods' && <NeighborhoodsTab currentUser={currentUser} />}
        {activeTab === 'track' && <TrackStepsTab currentUser={currentUser} />}
        {activeTab === 'units' && (
          <UnitsTransferTab currentUser={currentUser} onNavigateToUnits={onNavigateToUnits} />
        )}
        {activeTab === 'logins' && <LoginsTab currentUser={currentUser} />}
      </div>
    </div>
  );
};

const ComingSoonTab: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
  <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-8 sm:p-12 text-center">
    <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
      <Icon size={22} />
    </div>
    <h3 className="text-sm sm:text-base font-bold text-slate-800">{title}</h3>
    <p className="text-xs sm:text-sm text-slate-500 mt-1">
      Esta aba ainda está em desenvolvimento e chegará em breve.
    </p>
  </div>
);

/**
 * Transferência em lote de Células entre Setores — útil quando um setor se
 * multiplica e várias células precisam ser movidas para o novo setor de
 * uma só vez. Opera sempre entre uma unidade "folha" (Célula) e seu nível
 * pai imediato (Setor), quaisquer que sejam os nomes configurados pela
 * igreja para esses níveis.
 *
 * (marcador de sincronização: 2026-10-03 — se você está lendo este
 * comentário no AI Studio após sincronizar com o GitHub, esta tela já
 * deve mostrar os seletores de setor de origem/destino e a lista de
 * células com checkboxes, não mais o atalho antigo.)
 */
const UnitsTransferTab: React.FC<{ currentUser: UserProfile; onNavigateToUnits?: () => void }> = ({
  currentUser,
  onNavigateToUnits,
}) => {
  const churchId = currentUser.churchId;
  const [levels, setLevels] = useState<ChurchHierarchicalLevel[]>([]);
  const [units, setUnits] = useState<OrganizationalUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [sourceSectorId, setSourceSectorId] = useState('');
  const [targetSectorId, setTargetSectorId] = useState('');
  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(new Set());
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    if (!churchId) return;
    setIsLoading(true);
    try {
      const [currentLevels, currentUnits] = await Promise.all([
        AppChurchService.getChurchLevels(churchId),
        AppChurchService.getUnits(churchId, undefined, 'flat'),
      ]);
      setLevels(currentLevels);
      setUnits(currentUnits);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao carregar setores e células.');
    } finally {
      setIsLoading(false);
    }
  }, [churchId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Nível folha (Célula) e seu pai imediato (Setor), pelos nomes configurados pela igreja
  const cellLevel = levels.length > 0 ? levels[levels.length - 1] : null;
  const sectorLevel = levels.length > 1 ? levels[levels.length - 2] : null;

  const sectors = useMemo(
    () => (sectorLevel ? units.filter((u) => u.levelTypeId === sectorLevel.id) : []),
    [units, sectorLevel]
  );

  const cellsInSourceSector = useMemo(() => {
    if (!sourceSectorId || !cellLevel) return [];
    return units.filter((u) => u.levelTypeId === cellLevel.id && u.parentId === sourceSectorId);
  }, [units, cellLevel, sourceSectorId]);

  const targetSectorOptions = useMemo(
    () => sectors.filter((s) => s.id !== sourceSectorId),
    [sectors, sourceSectorId]
  );

  useEffect(() => {
    setSelectedCellIds(new Set());
    setTransferError('');
    if (targetSectorId === sourceSectorId) {
      setTargetSectorId('');
    }
  }, [sourceSectorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCell = (id: string) => {
    setSelectedCellIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCellIds.size === cellsInSourceSector.length) {
      setSelectedCellIds(new Set());
    } else {
      setSelectedCellIds(new Set(cellsInSourceSector.map((c) => c.id)));
    }
  };

  const handleTransfer = async () => {
    if (!churchId || !targetSectorId || selectedCellIds.size === 0) return;
    setIsTransferring(true);
    setTransferError('');
    try {
      const unitIds = Array.from(selectedCellIds);
      const result = await AppChurchService.moveUnitsToParent({
        unitIds,
        churchId,
        newParentId: targetSectorId,
      });

      setUnits((prev) =>
        prev.map((u) =>
          result.movedIds.includes(u.id)
            ? { ...u, parentId: result.parentId, parentName: result.parentName }
            : u
        )
      );

      const movedCount = result.movedIds.length;
      const skippedCount = result.skipped.length;
      showToast(
        'success',
        skippedCount > 0
          ? `${movedCount} célula(s) transferida(s) para "${result.parentName}". ${skippedCount} não puderam ser movidas.`
          : `${movedCount} célula(s) transferida(s) para "${result.parentName}" com sucesso.`
      );
      setSelectedCellIds(new Set());
    } catch (err: any) {
      setTransferError(err?.message || 'Falha ao transferir células.');
    } finally {
      setIsTransferring(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-10 flex items-center justify-center text-slate-400">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (!sectorLevel || !cellLevel || sectors.length === 0) {
    return (
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-8 sm:p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto mb-3">
          <Layers size={22} />
        </div>
        <h3 className="text-sm sm:text-base font-bold text-slate-800">Setores e Células</h3>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          Ainda não há setores suficientes cadastrados para transferir células entre eles.
        </p>
        {onNavigateToUnits && (
          <button
            type="button"
            onClick={onNavigateToUnits}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition cursor-pointer"
          >
            <Layers size={15} />
            Abrir Níveis Organizacionais
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
            <ArrowRightLeft size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Transferir {cellLevel.name} entre {sectorLevel.name}s
            </h3>
            <p className="text-[11px] text-slate-500">
              Útil quando um {sectorLevel.name.toLowerCase()} se multiplica e várias células precisam
              ir para o novo {sectorLevel.name.toLowerCase()} de uma vez. Membros e líderes vinculados
              continuam os mesmos.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {sectorLevel.name} de origem:
            </label>
            <select
              value={sourceSectorId}
              onChange={(e) => setSourceSectorId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
            >
              <option value="">Selecione...</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Transferir para o {sectorLevel.name.toLowerCase()}:
            </label>
            <select
              value={targetSectorId}
              onChange={(e) => setTargetSectorId(e.target.value)}
              disabled={!sourceSectorId}
              className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Selecione...</option>
              {targetSectorOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sourceSectorId && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">
                {cellLevel.name}s em {sectors.find((s) => s.id === sourceSectorId)?.name || 'setor selecionado'}:
              </span>
              {cellsInSourceSector.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                >
                  {selectedCellIds.size === cellsInSourceSector.length ? (
                    <CheckSquare size={13} />
                  ) : (
                    <Square size={13} />
                  )}
                  Selecionar todas
                </button>
              )}
            </div>

            {cellsInSourceSector.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center bg-slate-50 rounded-lg border border-slate-200">
                Nenhuma {cellLevel.name.toLowerCase()} cadastrada neste {sectorLevel.name.toLowerCase()}.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
                {cellsInSourceSector.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 select-none">
                      <input
                        type="checkbox"
                        checked={selectedCellIds.has(c.id)}
                        onChange={() => toggleCell(c.id)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                      />
                      <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">
                        {c.name}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {c.quantidade_membros ?? c.memberCount ?? 0} membro(s)
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {transferError && <p className="text-xs text-red-600 font-semibold">{transferError}</p>}

        <button
          type="button"
          disabled={!targetSectorId || selectedCellIds.size === 0 || isTransferring}
          onClick={handleTransfer}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
        >
          {isTransferring ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
          Transferir {selectedCellIds.size > 0 ? `${selectedCellIds.size} célula(s)` : 'célula(s) selecionada(s)'}
        </button>
      </div>

      {onNavigateToUnits && (
        <p className="text-center text-[11px] text-slate-400">
          Para criar setores ou mover uma célula individualmente, use{' '}
          <button
            type="button"
            onClick={onNavigateToUnits}
            className="font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
          >
            Níveis Organizacionais
          </button>
          .
        </p>
      )}
    </div>
  );
};

const NeighborhoodsTab: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const [showInactive, setShowInactive] = useState(false);
  const [confirmingDeactivateId, setConfirmingDeactivateId] = useState<string | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (!churchId) return;
      setIsLoading(true);
      try {
        const data = await AppChurchService.getNeighborhoods(churchId, force);
        setNeighborhoods(data);
      } catch (err: any) {
        showToast('error', err?.message || 'Falha ao carregar bairros.');
      } finally {
        setIsLoading(false);
      }
    },
    [churchId, showToast]
  );

  useEffect(() => {
    load();
  }, [load]);

  const visibleNeighborhoods = useMemo(
    () => neighborhoods.filter((n) => (showInactive ? true : n.active)),
    [neighborhoods, showInactive]
  );

  const handleCreate = async () => {
    const cleanName = newName.trim();
    if (!cleanName || !churchId) return;
    setIsCreating(true);
    try {
      await AppChurchService.createNeighborhood({ churchId, name: cleanName });
      setNewName('');
      showToast('success', `Bairro "${cleanName}" cadastrado.`);
      await load(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao criar bairro.');
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (n: Neighborhood) => {
    setEditingId(n.id);
    setEditingName(n.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveRename = async (n: Neighborhood) => {
    const cleanName = editingName.trim();
    if (!cleanName || !churchId) return;
    if (cleanName === n.name) {
      cancelEditing();
      return;
    }
    setSavingId(n.id);
    try {
      await AppChurchService.updateNeighborhood({ id: n.id, churchId, name: cleanName });
      showToast('success', 'Bairro renomeado com sucesso.');
      cancelEditing();
      await load(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao renomear bairro.');
    } finally {
      setSavingId(null);
    }
  };

  // Executa de fato a troca de ativo/inativo (chamada direta, sem confirmação
  // nativa do navegador — window.confirm/alert pode ficar bloqueado em
  // silêncio dentro de iframes como o preview do AI Studio, retornando false
  // sem exibir nada, o que fazia a ação parecer "não fazer nada".
  const applyToggleActive = async (n: Neighborhood, nextActive: boolean) => {
    if (!churchId) return;
    setConfirmingDeactivateId(null);
    setSavingId(n.id);
    try {
      await AppChurchService.updateNeighborhood({ id: n.id, churchId, active: nextActive });
      showToast('success', nextActive ? 'Bairro reativado.' : 'Bairro desativado.');
      await load(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao atualizar bairro.');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = (n: Neighborhood) => {
    const nextActive = !n.active;
    // Reativar nunca precisa de confirmação. Desativar só pede confirmação
    // (inline, dentro da própria lista) quando há cadastros usando o nome.
    if (nextActive === false && n.usageCount > 0) {
      setConfirmingDeactivateId(n.id);
      return;
    }
    applyToggleActive(n, nextActive);
  };

  return (
    <div className="space-y-3">
      {toast && (
        <div
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Novo bairro */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4">
        <label className="text-xs font-bold text-slate-700 mb-1.5 block">+ Novo Bairro</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            placeholder="Ex: Centro, Jardim das Flores..."
            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating || !newName.trim()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
          >
            {isCreating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Adicionar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-700">
            {visibleNeighborhoods.length} bairro{visibleNeighborhoods.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            {showInactive ? <EyeOff size={13} /> : <Eye size={13} />}
            {showInactive ? 'Ocultar desativados' : 'Mostrar desativados'}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : visibleNeighborhoods.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Nenhum bairro cadastrado ainda.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleNeighborhoods.map((n) => (
              <li key={n.id} className="px-3 sm:px-4 py-2.5">
                {confirmingDeactivateId === n.id ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <span className="flex-1 text-xs text-amber-900">
                      <strong>{n.usageCount}</strong> cadastro(s) ainda usam &quot;{n.name}&quot;. Desativar não
                      altera os registros existentes, só remove o bairro das opções para novos cadastros.
                    </span>
                    <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setConfirmingDeactivateId(null)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToggleActive(n, false)}
                        disabled={savingId === n.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer"
                      >
                        {savingId === n.id && <Loader2 size={13} className="animate-spin" />}
                        Desativar mesmo assim
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {editingId === n.id ? (
                  <>
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(n);
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      autoFocus
                      className="flex-1 px-2.5 py-1.5 text-sm border border-indigo-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveRename(n)}
                      disabled={savingId === n.id}
                      className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition cursor-pointer"
                      title="Salvar"
                    >
                      {savingId === n.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition cursor-pointer"
                      title="Cancelar"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 text-sm font-medium truncate ${n.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                      {n.name}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
                      <Users size={12} />
                      {n.usageCount}
                    </span>
                    {!n.active && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
                        Desativado
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => startEditing(n)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition cursor-pointer shrink-0"
                      title="Editar nome"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(n)}
                      disabled={savingId === n.id}
                      className={`text-[11px] font-bold px-2 py-1 rounded-lg shrink-0 transition cursor-pointer disabled:opacity-50 ${
                        n.active
                          ? 'text-rose-600 hover:bg-rose-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {savingId === n.id ? '...' : n.active ? 'Desativar' : 'Reativar'}
                    </button>
                  </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-400 px-1">
        Desativar um bairro não altera cadastros existentes — apenas o remove das opções para novos
        membros e células. Bairros já em uso aparecem com a quantidade de cadastros ao lado.
      </p>
    </div>
  );
};

interface StepModalState {
  mode: 'create' | 'edit';
  stepNumber?: number;
  title: string;
  description: string;
  required: boolean;
}

const TrackStepsTab: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const [steps, setSteps] = useState<TrackStepWithProgress[]>([]);
  const [isCustomized, setIsCustomized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [modal, setModal] = useState<StepModalState | null>(null);
  const [isSavingModal, setIsSavingModal] = useState(false);

  const [reorderingNumber, setReorderingNumber] = useState<number | null>(null);
  const [confirmDeleteStep, setConfirmDeleteStep] = useState<{ stepNumber: number; progressCount: number } | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(
    async (force = false) => {
      if (!churchId) return;
      setIsLoading(true);
      try {
        const data = await AppChurchService.getTrackStepsDetailed(churchId, force);
        setSteps(data.steps.sort((a, b) => a.stepNumber - b.stepNumber));
        setIsCustomized(data.isCustomized);
      } catch (err: any) {
        showToast('error', err?.message || 'Falha ao carregar o trilho.');
      } finally {
        setIsLoading(false);
      }
    },
    [churchId, showToast]
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleReorder = async (step: TrackStepWithProgress, direction: 'up' | 'down') => {
    if (!churchId) return;
    setReorderingNumber(step.stepNumber);
    try {
      await AppChurchService.reorderTrackStep({ churchId, stepNumber: step.stepNumber, direction });
      await load(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao reordenar etapa.');
    } finally {
      setReorderingNumber(null);
    }
  };

  const openCreateModal = () => {
    setModal({ mode: 'create', title: '', description: '', required: true });
  };

  const openEditModal = (step: TrackStepWithProgress) => {
    setModal({
      mode: 'edit',
      stepNumber: step.stepNumber,
      title: step.title,
      description: step.description || '',
      required: step.required,
    });
  };

  const handleSaveModal = async () => {
    if (!modal || !churchId) return;
    const cleanTitle = modal.title.trim();
    if (!cleanTitle) {
      showToast('error', 'Informe um título para a etapa.');
      return;
    }
    setIsSavingModal(true);
    try {
      if (modal.mode === 'create') {
        await AppChurchService.createTrackStep({
          churchId,
          title: cleanTitle,
          description: modal.description.trim(),
          required: modal.required,
        });
        showToast('success', 'Etapa criada com sucesso.');
      } else {
        await AppChurchService.updateTrackStep({
          churchId,
          stepNumber: modal.stepNumber as number,
          title: cleanTitle,
          description: modal.description.trim(),
          required: modal.required,
        });
        showToast('success', 'Etapa atualizada com sucesso.');
      }
      setModal(null);
      await load(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao salvar etapa.');
    } finally {
      setIsSavingModal(false);
    }
  };

  const handleDeleteClick = async (step: TrackStepWithProgress) => {
    if (!churchId) return;
    if (step.progressCount > 0) {
      setConfirmDeleteStep({ stepNumber: step.stepNumber, progressCount: step.progressCount });
      return;
    }
    setIsDeleting(true);
    try {
      await AppChurchService.deleteTrackStep({ churchId, stepNumber: step.stepNumber });
      showToast('success', 'Etapa excluída.');
      await load(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao excluir etapa.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!churchId || !confirmDeleteStep) return;
    setIsDeleting(true);
    try {
      await AppChurchService.deleteTrackStep({
        churchId,
        stepNumber: confirmDeleteStep.stepNumber,
        confirmDataLoss: true,
      });
      showToast('success', 'Etapa excluída.');
      setConfirmDeleteStep(null);
      await load(true);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao excluir etapa.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-3">
      {toast && (
        <div
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-slate-100">
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-700 block">
              {steps.length} etapa{steps.length === 1 ? '' : 's'}
            </span>
            {!isCustomized && !isLoading && (
              <span className="text-[10px] text-slate-400">
                Ainda usando o trilho padrão da plataforma — a primeira edição cria uma cópia só desta igreja.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition cursor-pointer shrink-0"
          >
            <Plus size={14} />
            Nova Etapa
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : steps.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Nenhuma etapa cadastrada ainda.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {steps.map((step, idx) => (
              <li key={step.stepNumber} className="px-3 sm:px-4 py-2.5">
                {confirmDeleteStep?.stepNumber === step.stepNumber ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <span className="flex-1 text-xs text-amber-900">
                      <strong>{confirmDeleteStep.progressCount}</strong> membro(s) já têm progresso
                      registrado nesta etapa. Excluir vai apagar esse histórico permanentemente.
                    </span>
                    <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteStep(null)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDelete}
                        disabled={isDeleting}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer"
                      >
                        {isDeleting && <Loader2 size={13} className="animate-spin" />}
                        Excluir mesmo assim
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReorder(step, 'up')}
                        disabled={idx === 0 || reorderingNumber !== null}
                        className="p-0.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                        title="Mover para cima"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder(step, 'down')}
                        disabled={idx === steps.length - 1 || reorderingNumber !== null}
                        className="p-0.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                        title="Mover para baixo"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center text-[11px] font-bold shrink-0">
                      {step.stepNumber}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-800 truncate">{step.title}</span>
                        {step.required && (
                          <span
                            className="text-indigo-500 shrink-0"
                            title="Etapa obrigatória"
                          >
                            <ShieldCheck size={12} />
                          </span>
                        )}
                      </div>
                      {step.description && (
                        <p className="text-[11px] text-slate-500 truncate">{step.description}</p>
                      )}
                    </div>

                    {step.progressCount > 0 && (
                      <span
                        className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0"
                        title="Membros com progresso nesta etapa"
                      >
                        <Users size={12} />
                        {step.progressCount}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => openEditModal(step)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition cursor-pointer shrink-0"
                      title="Editar etapa"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(step)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-50 transition cursor-pointer shrink-0"
                      title="Excluir etapa"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-slate-400 px-1">
        As setas reordenam a sequência do trilho. Excluir uma etapa com membros já avaliados nela apaga
        esse histórico — a tela avisa antes de confirmar.
      </p>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">
                {modal.mode === 'create' ? 'Nova Etapa' : 'Editar Etapa'}
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Título</label>
                <input
                  type="text"
                  value={modal.title}
                  onChange={(e) => setModal({ ...modal, title: e.target.value })}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="Ex: Batismo nas Águas"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 block">Descrição</label>
                <textarea
                  value={modal.description}
                  onChange={(e) => setModal({ ...modal, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                  placeholder="O que o membro precisa fazer nesta etapa?"
                />
              </div>
              <button
                type="button"
                onClick={() => setModal({ ...modal, required: !modal.required })}
                className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer"
              >
                {modal.required ? (
                  <CheckCircle2 size={18} className="text-indigo-600" />
                ) : (
                  <Circle size={18} className="text-slate-300" />
                )}
                Etapa obrigatória
              </button>
            </div>
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={isSavingModal || !modal.title.trim()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition cursor-pointer"
              >
                {isSavingModal && <Loader2 size={15} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface MemberAccessItem {
  id: string;
  name: string;
  login: string;
  role: string;
  cellName: string;
  avatarUrl?: string;
  accessActive: boolean;
  temporaryPassword: boolean;
}

const LoginsTab: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const churchId = currentUser.churchId;
  const [members, setMembers] = useState<MemberAccessItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ memberName: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const load = useCallback(async () => {
    if (!churchId) return;
    setIsLoading(true);
    try {
      const data = await AppChurchService.getMembersAccess(churchId, debouncedSearch);
      setMembers(data);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao carregar membros.');
    } finally {
      setIsLoading(false);
    }
  }, [churchId, debouncedSearch, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const applyToggleAccess = async (member: MemberAccessItem, nextActive: boolean) => {
    if (!churchId) return;
    setConfirmDeactivateId(null);
    setSavingId(member.id);
    try {
      await AppChurchService.setMemberAccessActive({ memberId: member.id, churchId, accessActive: nextActive });
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, accessActive: nextActive } : m))
      );
      showToast('success', nextActive ? `Acesso de ${member.name} reativado.` : `Acesso de ${member.name} desativado.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao atualizar acesso.');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleAccess = (member: MemberAccessItem) => {
    const nextActive = !member.accessActive;
    if (nextActive === false) {
      setConfirmDeactivateId(member.id);
      return;
    }
    applyToggleAccess(member, nextActive);
  };

  const handleResetPassword = async (member: MemberAccessItem) => {
    if (!churchId) return;
    setSavingId(member.id);
    try {
      const temporaryPassword = await AppChurchService.resetMemberPassword({
        memberId: member.id,
        churchId,
      });
      setResetResult({ memberName: member.name, password: temporaryPassword });
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, temporaryPassword: true } : m))
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Falha ao resetar senha.');
    } finally {
      setSavingId(null);
    }
  };

  const handleCopyPassword = () => {
    if (!resetResult) return;
    navigator.clipboard
      ?.writeText(resetResult.password)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard pode ser bloqueado em alguns contextos (iframe sem permissão) —
        // a senha já está visível na tela para cópia manual nesse caso.
      });
  };

  return (
    <div className="space-y-3">
      {toast && (
        <div
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs p-3 sm:p-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar membro por nome ou login..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">Nenhum membro encontrado.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.map((m) => (
              <li key={m.id} className="px-3 sm:px-4 py-2.5">
                {confirmDeactivateId === m.id ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    <span className="flex-1 text-xs text-amber-900">
                      <strong>{m.name}</strong> não conseguirá mais fazer login enquanto o acesso estiver
                      desativado. Isso não remove o cadastro.
                    </span>
                    <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setConfirmDeactivateId(null)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => applyToggleAccess(m, false)}
                        disabled={savingId === m.id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition cursor-pointer"
                      >
                        {savingId === m.id && <Loader2 size={13} className="animate-spin" />}
                        Desativar acesso
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold truncate ${m.accessActive ? 'text-slate-800' : 'text-slate-400'}`}>
                          {m.name}
                        </span>
                        {!m.accessActive && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 shrink-0">
                            Acesso desativado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">
                        @{m.login} · {m.role}
                        {m.cellName ? ` · ${m.cellName}` : ''}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleResetPassword(m)}
                      disabled={savingId === m.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition cursor-pointer shrink-0"
                      title="Gerar senha temporária"
                    >
                      {savingId === m.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      <span className="hidden sm:inline">Resetar Senha</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAccess(m)}
                      disabled={savingId === m.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer disabled:opacity-50 shrink-0 ${
                        m.accessActive
                          ? 'text-rose-600 hover:bg-rose-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {m.accessActive ? <Lock size={13} /> : <Unlock size={13} />}
                      <span className="hidden sm:inline">{m.accessActive ? 'Desativar' : 'Reativar'}</span>
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-800">Senha Temporária Gerada</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600">
                Repasse esta senha para <strong>{resetResult.memberName}</strong> manualmente (WhatsApp,
                pessoalmente etc.). Ela só é exibida uma vez — não é possível recuperá-la depois.
              </p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <span className="flex-1 text-lg font-mono font-bold text-slate-900 tracking-wider text-center">
                  {resetResult.password}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 transition cursor-pointer shrink-0"
                  title="Copiar"
                >
                  {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setResetResult(null);
                  setCopied(false);
                }}
                className="px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition cursor-pointer"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 px-1">
        Desativar o acesso impede o login, mas mantém todo o histórico do membro. Resetar a senha gera
        uma senha temporária aleatória — não existe envio automático por e-mail ou SMS, o repasse é manual.
      </p>
    </div>
  );
};
