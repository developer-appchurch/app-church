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
} from 'lucide-react';
import { UserProfile, Neighborhood } from '@/types';
import { AppChurchService } from '@/lib/supabase';

interface ChurchSettingsViewProps {
  currentUser: UserProfile;
  onBack?: () => void;
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

export const ChurchSettingsView: React.FC<ChurchSettingsViewProps> = ({ currentUser, onBack }) => {
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
        {activeTab === 'track' && <ComingSoonTab icon={Award} title="Trilho de Liderança" />}
        {activeTab === 'units' && <ComingSoonTab icon={Layers} title="Setores e Células" />}
        {activeTab === 'logins' && <ComingSoonTab icon={KeyRound} title="Gestão de Logins" />}
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

  const handleToggleActive = async (n: Neighborhood) => {
    if (!churchId) return;
    const nextActive = !n.active;
    if (nextActive === false && n.usageCount > 0) {
      const confirmed = window.confirm(
        `${n.usageCount} cadastro(s) ainda usam "${n.name}". Desativar não altera os registros existentes, apenas remove o bairro da lista de opções para novos cadastros. Continuar?`
      );
      if (!confirmed) return;
    }
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
              <li key={n.id} className="flex items-center gap-2 px-3 sm:px-4 py-2.5">
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
