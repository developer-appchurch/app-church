'use client';

import React, { useState, useMemo } from 'react';
import { CellMember, CellGroup, AttendanceStatus, UserRole } from '../types';
import { LeadershipBadgeIcon } from './LeadershipBadgeIcon';
import {
  Search,
  Plus,
  HelpCircle,
  X,
  MapPin,
  UserCheck,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';

interface MyCellViewProps {
  members: CellMember[];
  cell: CellGroup;
  churchName: string;
  onOpenLeadershipTrack: (member: CellMember) => void;
  onAddMember: (newMember: Omit<CellMember, 'id'>) => void;
  onUpdateAttendance: (
    memberId: string,
    newStatus: AttendanceStatus,
    newPercentage: number
  ) => void;
}

export const MyCellView: React.FC<MyCellViewProps> = ({
  members,
  cell,
  churchName,
  onOpenLeadershipTrack,
  onAddMember,
  onUpdateAttendance,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [selectedMemberForAttendance, setSelectedMemberForAttendance] = useState<CellMember | null>(
    null
  );

  // New member form state
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Membro');
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newBirthday, setNewBirthday] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('green');

  // Filter members by current cell and query
  const filteredMembers = useMemo(() => {
    return members
      .filter((m) => m.cellId === cell.id)
      .filter((m) => {
        const matchesQuery =
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.neighborhood.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.role.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = selectedRole === 'todos' || m.role === selectedRole;
        const matchesStatus = selectedStatus === 'todos' || m.attendanceStatus === selectedStatus;
        return matchesQuery && matchesRole && matchesStatus;
      });
  }, [members, cell.id, searchQuery, selectedRole, selectedStatus]);

  // Statistics strictly for this cell
  const stats = useMemo(() => {
    const cellMems = members.filter((m) => m.cellId === cell.id);
    const greenCount = cellMems.filter((m) => m.attendanceStatus === 'green').length;
    const yellowCount = cellMems.filter((m) => m.attendanceStatus === 'yellow').length;
    const redCount = cellMems.filter((m) => m.attendanceStatus === 'red').length;
    const blackCount = cellMems.filter((m) => m.attendanceStatus === 'black').length;

    return {
      total: cellMems.length,
      greenCount,
      yellowCount,
      redCount,
      blackCount,
    };
  }, [members, cell.id]);

  const handleCreateMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    onAddMember({
      name: newName.trim(),
      role: newRole,
      neighborhood: newNeighborhood.trim() || 'Centro',
      birthday: newBirthday.trim() || '01/01',
      attendanceStatus: newStatus,
      attendancePercentage:
        newStatus === 'green' ? 100 : newStatus === 'yellow' ? 75 : newStatus === 'red' ? 50 : 20,
      cellId: cell.id,
      churchId: cell.churchId,
      phone: newPhone.trim(),
    });

    setNewName('');
    setNewNeighborhood('');
    setNewBirthday('');
    setNewPhone('');
    setIsAddModalOpen(false);
  };

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'green':
        return 'bg-[#16a34a] ring-2 ring-emerald-300/40';
      case 'yellow':
        return 'bg-[#facc15] ring-2 ring-yellow-300/40';
      case 'red':
        return 'bg-[#d05a5a] ring-2 ring-red-300/40';
      case 'black':
        return 'bg-[#18181b] ring-2 ring-slate-400/40';
      default:
        return 'bg-slate-400';
    }
  };

  const getStatusLabel = (status: AttendanceStatus) => {
    switch (status) {
      case 'green':
        return 'Assíduo (90% - 100%)';
      case 'yellow':
        return 'Frequência Regular (~75%)';
      case 'red':
        return 'Atenção / Oscilando (40% - 60%)';
      case 'black':
        return 'Ausente / Necessita Visita (< 30%)';
    }
  };

  return (
    <div id="screen-my-cell" className="bg-[#e9eff6] min-h-screen pb-16 font-sans">
      {/* Top Banner / Breadcrumb & Controls - Exact structure of user screenshot */}
      <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-4 pb-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full">
                Lifegroup
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <MapPin size={12} className="text-slate-400" /> {cell.address}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#04213d] mt-1">
              Membros da Célula {cell.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Reunião toda <strong>{cell.meetingDay}</strong> às <strong>{cell.meetingTime}</strong> • Líder: {cell.leaderName}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btn-cell-frequency-legend"
              onClick={() => setShowLegend(!showLegend)}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              title="Entenda as cores da frequência"
            >
              <HelpCircle size={15} className="text-slate-500" />
              Legenda Frequência
            </button>
            <button
              type="button"
              id="btn-cell-add-member"
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 text-xs font-bold text-white bg-[#04213d] hover:bg-[#073366] rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={16} />
              Novo Membro
            </button>
          </div>
        </div>

        {/* Legend Expandable Drawer */}
        {showLegend && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs mb-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Critérios de Frequência da Célula:
              </h4>
              <button
                onClick={() => setShowLegend(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-emerald-50/60 border border-emerald-100">
                <span className="w-4 h-4 rounded-full bg-[#16a34a] shrink-0" />
                <div>
                  <div className="font-bold text-emerald-950">Verde (Assíduo)</div>
                  <div className="text-[11px] text-emerald-700">Presente em 90%-100%</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-amber-50/60 border border-amber-100">
                <span className="w-4 h-4 rounded-full bg-[#facc15] shrink-0" />
                <div>
                  <div className="font-bold text-amber-950">Amarelo (Regular)</div>
                  <div className="text-[11px] text-amber-700">Presente em ~75%</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-red-50/60 border border-red-100">
                <span className="w-4 h-4 rounded-full bg-[#d05a5a] shrink-0" />
                <div>
                  <div className="font-bold text-red-950">Vermelho (Alerta)</div>
                  <div className="text-[11px] text-red-700">Presença abaixo de 50%</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-100 border border-slate-200">
                <span className="w-4 h-4 rounded-full bg-[#18181b] shrink-0" />
                <div>
                  <div className="font-bold text-slate-950">Preto (Ausente)</div>
                  <div className="text-[11px] text-slate-600">Faltando há 3+ semanas</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Responsive Search & Filters Bar matching screenshot */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 mb-3">
          <div className="relative w-full sm:flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              id="input-search-members"
              type="text"
              placeholder="Buscar por nome, bairro ou função..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sky-800 focus:ring-1 focus:ring-sky-800"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              id="select-filter-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-800 cursor-pointer flex-1 sm:flex-initial"
            >
              <option value="todos">Todas as Funções</option>
              <option value="Membro">Membro</option>
              <option value="Líder em Treinamento">Líder em Treinamento</option>
              <option value="Líder de Setor">Líder de Setor</option>
              <option value="Líder de Célula">Líder de Célula</option>
            </select>
            <select
              id="select-filter-attendance"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-800 cursor-pointer flex-1 sm:flex-initial"
            >
              <option value="todos">Toda Frequência</option>
              <option value="green">Assíduo</option>
              <option value="yellow">Regular</option>
              <option value="red">Alerta</option>
              <option value="black">Ausente</option>
            </select>
          </div>
        </div>

        {/* Quick KPI Stats row matching screenshot */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 select-none">
          <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">Total:</span>
            <span className="text-sm font-bold text-[#04213d]">{stats.total} vidas</span>
          </div>
          <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Assíduos:
            </span>
            <span className="text-sm font-bold text-emerald-700">{stats.greenCount}</span>
          </div>
          <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Regular:
            </span>
            <span className="text-sm font-bold text-amber-700">{stats.yellowCount}</span>
          </div>
          <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <span className="text-[11px] font-semibold text-red-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" /> Alerta:
            </span>
            <span className="text-sm font-bold text-red-700">{stats.redCount}</span>
          </div>
          <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between col-span-2 sm:col-span-1">
            <span className="text-[11px] font-semibold text-slate-800 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-900" /> Ausentes:
            </span>
            <span className="text-sm font-bold text-slate-900">{stats.blackCount}</span>
          </div>
        </div>
      </div>

      {/* Main Members Table Container - EXACT LAYOUT OF USER ATTACHMENT */}
      <div className="max-w-6xl mx-auto px-2 sm:px-6">
        <div className="overflow-x-auto rounded-xl shadow-2xs">
          <div className="min-w-[540px] sm:min-w-full">
            {/* Dark Navy Table Header row matching image 1 & 2 */}
            <div className="bg-[#052447] text-white rounded-t-xl px-3 sm:px-6 py-2.5 flex items-center text-xs font-bold tracking-wider select-none shadow-xs">
              {/* Freq dot indicator column */}
              <div className="w-8 sm:w-10 shrink-0 text-center text-slate-300 text-[10px]">
                Freq.
              </div>

              {/* Member Name */}
              <div className="flex-1 sm:flex-[2.5] text-left pl-2 sm:pl-3">Nome do Membro</div>

              {/* Role */}
              <div className="w-28 sm:w-44 text-center sm:text-left">Função</div>

              {/* Neighborhood */}
              <div className="w-24 sm:w-36 text-center sm:text-left hidden md:block">Bairro</div>

              {/* Birthday */}
              <div className="w-16 sm:w-24 text-center">Aniversário</div>

              {/* Leadership Track Button */}
              <div className="w-12 sm:w-16 text-center">Trilho</div>
            </div>

            {/* Member List Rows */}
            <div className="space-y-1.5 pt-1.5 bg-[#e9eff6] rounded-b-xl">
              {filteredMembers.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center text-slate-500">
                  <AlertCircle size={32} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-sm font-medium">
                    Nenhum membro encontrado com os filtros selecionados para esta célula.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedRole('todos');
                      setSelectedStatus('todos');
                    }}
                    className="mt-3 text-xs text-sky-800 font-semibold underline cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
                filteredMembers.map((member) => {
                  return (
                    <div
                      key={member.id}
                      id={`member-row-${member.id}`}
                      className="bg-white hover:bg-slate-50 transition-colors rounded-xl px-3 sm:px-6 py-3 flex items-center shadow-2xs border border-slate-200/70"
                    >
                      {/* Attendance Frequency Circle Dot (Interactive) */}
                      <div className="w-8 sm:w-10 shrink-0 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setSelectedMemberForAttendance(member)}
                          title={`Frequência: ${getStatusLabel(
                            member.attendanceStatus
                          )} - Clique para alterar`}
                          className="cursor-pointer group relative p-1 focus:outline-none"
                        >
                          <span
                            className={`block w-4 h-4 sm:w-5 sm:h-5 rounded-full ${getStatusColor(
                              member.attendanceStatus
                            )} shadow-xs group-hover:scale-110 transition-transform`}
                          />
                        </button>
                      </div>

                      {/* Nome do Membro */}
                      <div className="flex-1 sm:flex-[2.5] text-left pl-2 sm:pl-3 min-w-0 pr-2">
                        <span
                          onClick={() => onOpenLeadershipTrack(member)}
                          className="text-sm sm:text-base font-semibold text-[#0a2540] hover:text-sky-700 cursor-pointer truncate block"
                        >
                          {member.name}
                        </span>
                        {/* Small tag visible on mobile if neighborhood is hidden */}
                        <div className="text-[11px] text-slate-400 md:hidden flex items-center gap-1 truncate">
                          {member.neighborhood && <span>{member.neighborhood}</span>}
                        </div>
                      </div>

                      {/* Função */}
                      <div className="w-28 sm:w-44 text-center sm:text-left shrink-0">
                        <span
                          className={`text-xs sm:text-sm font-medium leading-tight inline-block ${
                            member.role === 'Líder em Treinamento'
                              ? 'text-[#0284c7] font-bold'
                              : member.role === 'Líder de Setor'
                              ? 'text-[#052447] font-bold'
                              : member.role === 'Líder de Célula'
                              ? 'text-purple-800 font-bold'
                              : 'text-[#0a2540]'
                          }`}
                        >
                          {member.role}
                        </span>
                      </div>

                      {/* Bairro */}
                      <div className="w-24 sm:w-36 text-left shrink-0 hidden md:block text-xs sm:text-sm text-[#0a2540] truncate pr-2">
                        {member.neighborhood || '—'}
                      </div>

                      {/* Aniversário (dd/MM) */}
                      <div className="w-16 sm:w-24 text-center shrink-0 text-xs sm:text-sm font-medium text-[#0a2540]">
                        {member.birthday || '—'}
                      </div>

                      {/* Trilho Button (Notebook contact icon matching Screenshot) */}
                      <div className="w-12 sm:w-16 text-center shrink-0 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => onOpenLeadershipTrack(member)}
                          className="p-1 rounded-lg text-[#0e3056] hover:bg-sky-50 hover:text-sky-700 active:scale-95 transition-all group cursor-pointer"
                          title={`Ver Trilho de Liderança de ${member.name}`}
                          aria-label={`Trilho de liderança de ${member.name}`}
                        >
                          <LeadershipBadgeIcon
                            className="w-7 h-7 sm:w-8 sm:h-8 group-hover:scale-105 transition-transform"
                            size={28}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Down Arrow / Expand box matching user screenshot footer */}
        <div className="flex justify-center pt-3 pb-6">
          <div className="bg-white border border-slate-300 rounded-md px-4 py-1 shadow-2xs text-slate-500 hover:text-[#052447] cursor-pointer hover:bg-slate-50 transition flex items-center justify-center">
            <ChevronDown size={20} />
          </div>
        </div>
      </div>

      {/* Attendance Adjustment Dialog Modal */}
      {selectedMemberForAttendance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in select-none">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-800">
                Frequência de {selectedMemberForAttendance.name}
              </h3>
              <button
                onClick={() => setSelectedMemberForAttendance(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Selecione o status atual de assiduidade do membro na célula:
            </p>
            <div className="space-y-2 mt-3">
              {(
                [
                  { id: 'green', label: 'Verde - Assíduo (100%)', pct: 100, color: 'bg-[#16a34a]' },
                  { id: 'yellow', label: 'Amarelo - Regular (75%)', pct: 75, color: 'bg-[#facc15]' },
                  { id: 'red', label: 'Vermelho - Alerta (50%)', pct: 50, color: 'bg-[#d05a5a]' },
                  { id: 'black', label: 'Preto - Ausente (15%)', pct: 15, color: 'bg-[#18181b]' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    onUpdateAttendance(selectedMemberForAttendance.id, option.id, option.pct);
                    setSelectedMemberForAttendance(null);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${
                    selectedMemberForAttendance.attendanceStatus === option.id
                      ? 'bg-sky-50 border-sky-300 text-sky-950 font-bold'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full ${option.color} shrink-0`} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedMemberForAttendance(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add New Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in select-none">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
            <div className="bg-[#052447] text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <UserCheck size={20} className="text-sky-300" />
                <h3 className="font-bold text-base">Adicionar Membro à Célula</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateMember} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Completo: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Mateus Ribeiro"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Função no Grupo:
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447] cursor-pointer"
                  >
                    <option value="Membro">Membro</option>
                    <option value="Líder em Treinamento">Líder em Treinamento</option>
                    <option value="Anfitrião">Anfitrião</option>
                    <option value="Intercessor">Intercessor</option>
                    <option value="Secretário">Secretário</option>
                    <option value="Líder de Célula">Líder de Célula</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bairro:</label>
                  <input
                    type="text"
                    placeholder="Ex: Junco, Centro..."
                    value={newNeighborhood}
                    onChange={(e) => setNewNeighborhood(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Aniversário (dd/MM):
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 25/08"
                    maxLength={5}
                    value={newBirthday}
                    onChange={(e) => setNewBirthday(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp / Telefone:
                  </label>
                  <input
                    type="text"
                    placeholder="(88) 99..."
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status Inicial de Frequência:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewStatus('green')}
                    className={`p-2 rounded-xl border text-xs flex items-center gap-2 font-medium cursor-pointer ${
                      newStatus === 'green'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                        : 'border-slate-200'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-[#16a34a]" /> Verde (Assíduo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewStatus('yellow')}
                    className={`p-2 rounded-xl border text-xs flex items-center gap-2 font-medium cursor-pointer ${
                      newStatus === 'yellow'
                        ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold'
                        : 'border-slate-200'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-[#facc15]" /> Amarelo (Regular)
                  </button>
                </div>
              </div>
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#052447] hover:bg-[#073366] rounded-xl shadow-xs cursor-pointer"
                >
                  Cadastrar Membro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
