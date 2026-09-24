'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { CellMember, CellGroup, AttendanceStatus, UserRole, UserProfile, Role, OrganizationalUnit } from '../types';
import { LeadershipBadgeIcon } from './LeadershipBadgeIcon';
import { AppChurchService } from '../lib/supabase';
import {
  Search,
  Plus,
  HelpCircle,
  X,
  MapPin,
  UserCheck,
  AlertCircle,
  ChevronDown,
  Lock,
  User,
  Loader2,
  RefreshCw,
  Network,
  Layers,
} from 'lucide-react';

interface MyCellViewProps {
  members: CellMember[];
  cell: CellGroup;
  churchName: string;
  currentUser?: UserProfile;
  cells?: CellGroup[];
  onSelectCell?: (cellId: string) => void;
  onOpenLeadershipTrack: (member: CellMember) => void;
  onAddMember: (newMember: Omit<CellMember, 'id'>) => Promise<void> | void;
  onUpdateAttendance: (
    memberId: string,
    newStatus: AttendanceStatus,
    newPercentage: number
  ) => void;
}

/**
 * Gera uma variação de login para alternar sugestões
 */
function getLoginCandidateVariation(name: string, currentLogin: string, base: string): string {
  if (currentLogin === base) {
    const clean = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length > 2) {
      return `${parts[0]}.${parts[parts.length - 1]}`;
    }
    const seed = Math.floor(Date.now() % 90 + 10);
    return `${base}${seed}`;
  }
  const seed = Math.floor(Date.now() % 90 + 10);
  return `${base}${seed}`;
}

export const MyCellView: React.FC<MyCellViewProps> = ({
  members,
  cell,
  churchName,
  currentUser,
  cells = [],
  onSelectCell,
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
  const [newLogin, setNewLogin] = useState('');
  const [isLoginManuallyEdited, setIsLoginManuallyEdited] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Membro');
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newBirthday, setNewBirthday] = useState('');
  const [birthdayError, setBirthdayError] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newStatus] = useState<AttendanceStatus>('green');

  // Login uniqueness validation state
  const [loginDuplicateError, setLoginDuplicateError] = useState('');
  const [isCheckingLogin, setIsCheckingLogin] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Roles obtidas diretamente da tabela roles do Supabase
  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);

  // Carrega as roles do banco de dados na inicialização
  useEffect(() => {
    let isMounted = true;
    async function loadRoles() {
      try {
        const roles = await AppChurchService.getRoles();
        if (isMounted && roles && roles.length > 0) {
          // Ordena rigorosamente do menor para o maior nível de hierarquia
          const sorted = [...roles].sort(
            (a, b) => a.hierarchyLevel - b.hierarchyLevel || a.name.localeCompare(b.name)
          );
          setAvailableRoles(sorted);
        }
      } catch (err) {
        console.warn('Erro ao carregar roles no MyCellView:', err);
      }
    }
    loadRoles();
    return () => {
      isMounted = false;
    };
  }, []);

  // Nível de hierarquia do usuário logado
  const userHierarchyLevel = useMemo(() => {
    if (!currentUser) return 1;
    // Administrador possui autoridade máxima para cadastrar qualquer função
    if (currentUser.isSystemAdmin || currentUser.role === 'Administrador') {
      return 999;
    }

    if (availableRoles.length > 0) {
      const matched = availableRoles.find(
        (r) =>
          (currentUser.roleId && r.id === currentUser.roleId) ||
          r.name?.toLowerCase() === currentUser.role?.toLowerCase() ||
          r.slug?.toLowerCase() === currentUser.role?.toLowerCase() ||
          (currentUser.role &&
            (r.name?.toLowerCase().includes(currentUser.role.toLowerCase()) ||
              currentUser.role.toLowerCase().includes(r.name?.toLowerCase())))
      );
      if (matched) {
        return matched.hierarchyLevel;
      }
    }

    // Fallback caso a lista do banco ainda esteja carregando
    const roleLower = (currentUser.role || '').toLowerCase();
    if (roleLower.includes('pastor')) return 7;
    if (roleLower.includes('distrito')) return 6;
    if (roleLower.includes('rede')) return 5;
    if (roleLower.includes('área') || roleLower.includes('area')) return 4;
    if (roleLower.includes('setor')) return 3;
    if (roleLower.includes('célula') || roleLower.includes('celula')) return 2;
    return 1;
  }, [currentUser, availableRoles]);

  // Lista de funções disponíveis para cadastro:
  // "o usuário só pode cadastrar alguém do seu nível de hierarquia para baixo (igual ou inferior)"
  // "mostre em ordem de nivel_hierarquia de menor para o maior"
  const assignableRoles = useMemo(() => {
    if (availableRoles.length === 0) return [];
    return availableRoles
      .filter((r) => r.hierarchyLevel <= userHierarchyLevel)
      .sort((a, b) => a.hierarchyLevel - b.hierarchyLevel || a.name.localeCompare(b.name));
  }, [availableRoles, userHierarchyLevel]);

  // Papel efetivo garantindo que sempre pertença à lista permitida
  const effectiveRole = useMemo(() => {
    if (assignableRoles.length === 0) return newRole;
    return assignableRoles.some((r) => r.name === newRole)
      ? newRole
      : (assignableRoles[0].name as UserRole);
  }, [assignableRoles, newRole]);

  // Carrega unidades organizacionais para mapeamento da estrutura hierárquica
  const [units, setUnits] = useState<OrganizationalUnit[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadUnits() {
      if (!currentUser?.churchId) return;
      try {
        const fetchedUnits = await AppChurchService.getUnits(currentUser.churchId);
        if (isMounted && fetchedUnits && fetchedUnits.length > 0) {
          setUnits(fetchedUnits);
        }
      } catch (err) {
        console.warn('Erro ao carregar unidades no MyCellView:', err);
      }
    }
    loadUnits();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.churchId]);

  // -------------------------------------------------------------
  // CONTROLE DO SELETOR HIERÁRQUICO CONTEXTUAL & COBERTURA
  // Regras de negócio de cobertura de liderança:
  // - Pastor / Administrador / Supervisor: Acesso a todas as células da congregação.
  // - Líder de Área: Acesso a todas as células da sua área de cobertura.
  // - Líder de Setor: Acesso a cada uma das células do seu setor.
  // - Líder de Célula: Acesso apenas às células que lidera ou está vinculado.
  // - Membro: Acesso restrito à célula que pertence.
  // -------------------------------------------------------------

  const userRoleNormalized = useMemo(() => {
    return (currentUser?.role || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }, [currentUser?.role]);

  const isPastorOrAdmin = useMemo(() => {
    if (!currentUser) return false;
    return (
      currentUser.isSystemAdmin === true ||
      currentUser.role === 'Administrador' ||
      currentUser.login === 'admin' ||
      userRoleNormalized.includes('pastor') ||
      userRoleNormalized.includes('supervisor')
    );
  }, [currentUser, userRoleNormalized]);

  const isAreaLeader = useMemo(() => {
    if (isPastorOrAdmin || !currentUser) return false;
    return (
      userRoleNormalized.includes('area') ||
      userRoleNormalized.includes('distrito') ||
      userRoleNormalized.includes('rede')
    );
  }, [isPastorOrAdmin, currentUser, userRoleNormalized]);

  const isSectorLeader = useMemo(() => {
    if (isPastorOrAdmin || isAreaLeader || !currentUser) return false;
    return userRoleNormalized.includes('setor');
  }, [isPastorOrAdmin, isAreaLeader, currentUser, userRoleNormalized]);

  const isCellLeader = useMemo(() => {
    if (isPastorOrAdmin || isAreaLeader || isSectorLeader || !currentUser) return false;
    return (
      userRoleNormalized.includes('celula') ||
      userRoleNormalized.includes('treinamento') ||
      userRoleNormalized.includes('discipulador')
    );
  }, [isPastorOrAdmin, isAreaLeader, isSectorLeader, currentUser, userRoleNormalized]);

  // Filtro de Setor para quem tem múltiplos setores sob cobertura (Pastores e Líderes de Área)
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<string>('todos');

  // Células acessíveis baseadas estritamente na cobertura de liderança do usuário (Ordenadas A-Z)
  const accessibleCells = useMemo(() => {
    const sortAZ = (list: CellGroup[]) =>
      [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    if (!cells || cells.length === 0) return [cell];

    // 1. Pastor / Administrador / Supervisor: Todas as células
    if (isPastorOrAdmin) {
      return sortAZ(cells);
    }

    // 2. Líder de Área: Todas as células da sua área
    if (isAreaLeader) {
      if (units && units.length > 0) {
        const userAreas = units.filter((u) => {
          const isAreaType =
            u.levelTypeName?.toLowerCase().includes('area') ||
            u.levelTypeName?.toLowerCase().includes('distrito') ||
            u.levelTypeName?.toLowerCase().includes('rede');
          const isLeader = u.leaders?.some(
            (l) => l.id === currentUser?.id || l.name?.toLowerCase() === currentUser?.name?.toLowerCase()
          );
          const matchesSector =
            currentUser?.sector &&
            (u.name.toLowerCase().includes(currentUser.sector.toLowerCase()) ||
              currentUser.sector.toLowerCase().includes(u.name.toLowerCase()));
          return isAreaType && (isLeader || matchesSector);
        });

        if (userAreas.length > 0) {
          const areaIds = new Set(userAreas.map((a) => a.id));
          const childSectors = units.filter((u) => u.parentId && areaIds.has(u.parentId));
          const sectorIds = new Set(childSectors.map((s) => s.id));
          const sectorNames = new Set(childSectors.map((s) => s.name.toLowerCase()));

          const areaCells = cells.filter((c) => {
            if (c.parentUnitId && sectorIds.has(c.parentUnitId)) return true;
            if (c.areaUnitId && areaIds.has(c.areaUnitId)) return true;
            if (c.sectorName && sectorNames.has(c.sectorName.toLowerCase())) return true;
            if (c.areaName && userAreas.some((a) => a.name.toLowerCase() === c.areaName?.toLowerCase())) return true;
            return false;
          });

          if (areaCells.length > 0) return sortAZ(areaCells);
        }
      }

      // Fallback para Área
      const userAreaName = (currentUser?.sector || '').toLowerCase();
      const matched = cells.filter((c) => {
        if (c.areaName && userAreaName.includes(c.areaName.toLowerCase())) return true;
        if (c.sectorName && userAreaName.includes(c.sectorName.toLowerCase())) return true;
        return false;
      });
      return sortAZ(matched.length > 0 ? matched : cells);
    }

    // 3. Líder de Setor: Cada uma das células do seu setor
    if (isSectorLeader) {
      if (units && units.length > 0) {
        const userSectors = units.filter((u) => {
          const isSecType = u.levelTypeName?.toLowerCase().includes('setor');
          const isLeader = u.leaders?.some(
            (l) => l.id === currentUser?.id || l.name?.toLowerCase() === currentUser?.name?.toLowerCase()
          );
          const matchesSecName =
            currentUser?.sector &&
            (u.name.toLowerCase() === currentUser.sector.toLowerCase() ||
              u.name.toLowerCase().includes(currentUser.sector.toLowerCase()) ||
              currentUser.sector.toLowerCase().includes(u.name.toLowerCase()));
          const matchesActiveCellSec =
            cell.sectorName &&
            (u.name.toLowerCase() === cell.sectorName.toLowerCase() ||
              u.name.toLowerCase().includes(cell.sectorName.toLowerCase()));
          return isSecType && (isLeader || matchesSecName || matchesActiveCellSec);
        });

        if (userSectors.length > 0) {
          const sectorIds = new Set(userSectors.map((s) => s.id));
          const sectorNames = new Set(userSectors.map((s) => s.name.toLowerCase()));

          const sectorCells = cells.filter((c) => {
            if (c.parentUnitId && sectorIds.has(c.parentUnitId)) return true;
            if (c.sectorName && sectorNames.has(c.sectorName.toLowerCase())) return true;
            return false;
          });

          if (sectorCells.length > 0) return sortAZ(sectorCells);
        }
      }

      // Fallback robusto por comparação de nomes de setor
      const userSecClean = (currentUser?.sector || '').trim().toLowerCase();
      const activeCellSecClean = (cell.sectorName || '').trim().toLowerCase();

      const matched = cells.filter((c) => {
        const cSecClean = (c.sectorName || '').trim().toLowerCase();
        // Célula ativa do líder
        if (c.id === cell.id) return true;
        // Mesmo setor da célula ativa do líder
        if (activeCellSecClean && cSecClean === activeCellSecClean) return true;
        // Setor informado no perfil do usuário
        if (userSecClean && cSecClean === userSecClean) return true;
        if (userSecClean && (cSecClean.includes(userSecClean) || userSecClean.includes(cSecClean))) return true;
        // Se o líder é o próprio usuário
        if (currentUser?.name && c.leaderName?.toLowerCase() === currentUser.name.toLowerCase()) return true;
        return false;
      });

      return sortAZ(matched.length > 0 ? matched : [cell]);
    }

    // 4. Líder de Célula: Apenas as células que lidera ou está vinculado
    if (isCellLeader) {
      const matched = cells.filter((c) => {
        if (currentUser?.currentCellId && c.id === currentUser.currentCellId) return true;
        if (currentUser?.name && c.leaderName?.toLowerCase() === currentUser.name.toLowerCase()) return true;
        if (currentUser?.id && c.leaderMemberIds?.includes(currentUser.id)) return true;
        if (units && units.length > 0) {
          const u = units.find((unit) => unit.id === c.id);
          if (u?.leaders?.some((l) => l.id === currentUser?.id || l.name?.toLowerCase() === currentUser?.name?.toLowerCase())) {
            return true;
          }
        }
        return false;
      });

      return sortAZ(matched.length > 0 ? matched : [cell]);
    }

    // 5. Membro (e outras funções de apoio): Apenas a célula vinculada
    const memberCells = cells.filter((c) => {
      if (currentUser?.currentCellId && c.id === currentUser.currentCellId) return true;
      if (members.some((m) => m.id === currentUser?.id && m.cellId === c.id)) return true;
      return false;
    });

    return sortAZ(memberCells.length > 0 ? memberCells : [cell]);
  }, [
    cells,
    cell,
    currentUser,
    isPastorOrAdmin,
    isAreaLeader,
    isSectorLeader,
    isCellLeader,
    units,
    members,
  ]);

  // Sincroniza a célula ativa caso esteja fora da cobertura permitida para o usuário
  useEffect(() => {
    if (accessibleCells.length > 0 && !accessibleCells.some((c) => c.id === cell.id)) {
      onSelectCell?.(accessibleCells[0].id);
    }
  }, [accessibleCells, cell.id, onSelectCell]);

  // Setores identificados dentro da cobertura acessível
  const sectorsInCoverage = useMemo(() => {
    const set = new Set<string>();
    accessibleCells.forEach((c) => {
      const sec = c.sectorName?.trim();
      if (sec) set.add(sec);
    });
    return Array.from(set).sort();
  }, [accessibleCells]);

  // Células exibidas no seletor (estritamente ordenadas de A-Z)
  const displayedCells = useMemo(() => {
    return accessibleCells;
  }, [accessibleCells]);

  // Rótulo da cobertura para exibição contextual no topo
  const coverageScopeBadge = useMemo(() => {
    if (isPastorOrAdmin) return 'Toda a Igreja';
    if (isAreaLeader) {
      return cell.areaName || currentUser?.sector || 'Sua Área';
    }
    if (isSectorLeader) {
      return cell.sectorName || currentUser?.sector || 'Seu Setor';
    }
    return cell.name;
  }, [isPastorOrAdmin, isAreaLeader, isSectorLeader, cell.areaName, cell.sectorName, cell.name, currentUser?.sector]);

  /**
   * Gera sugestão de login a partir do nome:
   * 1. Pega até a segunda palavra do nome (ex: "Mateus Ribeiro" -> "mateus.ribeiro").
   * 2. Se a segunda palavra tiver 3 ou menos letras (<= 3, como "da", "de", "dos", "do"),
   *    coloca a terceira palavra (ex: "João da Silva" -> "joao.da.silva").
   */
  const generateLoginSuggestion = (name: string) => {
    const clean = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    if (words.length === 1) return words[0];

    // Se a 2ª palavra tiver 3 ou menos letras e houver 3ª palavra, inclui a 3ª palavra
    if (words[1].length <= 3 && words[2]) {
      return `${words[0]}.${words[1]}.${words[2]}`;
    }

    return `${words[0]}.${words[1]}`;
  };

  /**
   * Valida se uma string dd/MM corresponde a uma data real do calendário.
   * Impede datas inexistentes como 12/33, 31/04, 32/01, etc.
   */
  const validateBirthday = (value: string): { valid: boolean; error?: string } => {
    if (!value || value.trim() === '') {
      return { valid: true };
    }
    const clean = value.trim();
    const parts = clean.split('/');
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
      return { valid: false, error: 'Formato incompleto. Use o padrão dd/MM (ex: 25/08).' };
    }
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);

    if (isNaN(day) || isNaN(month)) {
      return { valid: false, error: 'Data deve conter apenas números válidos (dd/MM).' };
    }

    if (month < 1 || month > 12) {
      return {
        valid: false,
        error: `Mês inexistente (${month}). O calendário possui meses de 01 a 12.`,
      };
    }

    const maxDaysPerMonth: Record<number, number> = {
      1: 31,
      2: 29, // Aceita 29 para permitir aniversários em ano bissexto
      3: 31,
      4: 30,
      5: 31,
      6: 30,
      7: 31,
      8: 31,
      9: 30,
      10: 31,
      11: 30,
      12: 31,
    };

    const maxDays = maxDaysPerMonth[month];
    if (day < 1 || day > maxDays) {
      return {
        valid: false,
        error: `Dia inexistente (${day}). O mês ${String(month).padStart(2, '0')} possui até ${maxDays} dias.`,
      };
    }

    return { valid: true };
  };

  /**
   * Formatação automática e validação de data no campo de aniversário (dd/MM)
   */
  const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, '').slice(0, 4);

    let formatted = '';
    if (!digits) {
      formatted = '';
    } else if (digits.length <= 2) {
      if (raw.endsWith('/') && digits.length === 2) {
        formatted = `${digits}/`;
      } else {
        formatted = digits;
      }
    } else {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
    }

    setNewBirthday(formatted);

    // Validação em tempo real se completou 5 caracteres (dd/MM)
    if (formatted.length === 5) {
      const result = validateBirthday(formatted);
      if (!result.valid) {
        setBirthdayError(result.error || 'Data de aniversário inexistente.');
      } else {
        setBirthdayError('');
      }
    } else {
      setBirthdayError('');
    }
  };

  /**
   * Regerar login automaticamente a partir do nome
   */
  const handleRegenerateLogin = async () => {
    if (!newName.trim()) {
      setFormError('Por favor, informe o nome completo primeiro para gerar ou regerar o login.');
      return;
    }
    setFormError('');

    const base = generateLoginSuggestion(newName);
    const candidate = getLoginCandidateVariation(newName, newLogin, base);

    setNewLogin(candidate);
    setIsLoginManuallyEdited(false);
    await handleValidateLogin(candidate);
  };

  const handleValidateLogin = async (loginToTest: string) => {
    const candidate = loginToTest.trim().toLowerCase();
    if (!candidate) {
      setLoginDuplicateError('');
      return;
    }
    setIsCheckingLogin(true);
    try {
      const check = await AppChurchService.isLoginAvailable(candidate);
      if (!check.available) {
        setLoginDuplicateError(check.error || 'Este login já está em uso. Por favor, escolha outro login.');
      } else {
        setLoginDuplicateError('');
      }
    } catch {
      // ignore
    } finally {
      setIsCheckingLogin(false);
    }
  };

  const handleOpenAddModal = () => {
    setNewName('');
    setNewLogin('');
    setIsLoginManuallyEdited(false);
    setNewPassword('');
    setNewNeighborhood('');
    setNewBirthday('');
    setBirthdayError('');
    setNewPhone('');
    setFormError('');
    setLoginDuplicateError('');
    if (assignableRoles.length > 0) {
      setNewRole(assignableRoles[0].name as UserRole);
    } else {
      setNewRole('Membro');
    }
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setNewName('');
    setNewLogin('');
    setIsLoginManuallyEdited(false);
    setNewPassword('');
    setNewNeighborhood('');
    setNewBirthday('');
    setBirthdayError('');
    setNewPhone('');
    setFormError('');
    setLoginDuplicateError('');
  };

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

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newName.trim()) {
      setFormError('Por favor, informe o nome completo do membro.');
      return;
    }

    // Validação estrita de aniversário: impede datas que não existam (ex: 12/33)
    if (newBirthday.trim()) {
      const birthCheck = validateBirthday(newBirthday);
      if (!birthCheck.valid) {
        setBirthdayError(birthCheck.error || 'Data de aniversário inexistente.');
        setFormError(birthCheck.error || 'Data de aniversário inexistente. Por favor informe uma data válida (dd/MM).');
        return;
      }
    }

    const effectiveLogin = (
      newLogin.trim() || generateLoginSuggestion(newName)
    ).toLowerCase();

    // 1. Checagem estrita de unicidade de login
    setIsCheckingLogin(true);
    setIsSubmitting(true);
    try {
      const check = await AppChurchService.isLoginAvailable(effectiveLogin);
      if (!check.available) {
        const errMsg =
          check.error ||
          'Este login já está em uso. Por favor, escolha outro login.';
        setLoginDuplicateError(errMsg);
        setFormError(errMsg);
        setIsCheckingLogin(false);
        setIsSubmitting(false);
        return;
      }
    } catch (err: any) {
      console.warn('Erro ao verificar disponibilidade de login:', err);
    } finally {
      setIsCheckingLogin(false);
    }

    // Validação estrita de nível de hierarquia
    const targetRoleObj = availableRoles.find((r) => r.name === effectiveRole);
    if (targetRoleObj && targetRoleObj.hierarchyLevel > userHierarchyLevel) {
      setFormError('Você só pode cadastrar membros com nível de hierarquia igual ou inferior à sua função.');
      setIsSubmitting(false);
      return;
    }

    try {
      await onAddMember({
        name: newName.trim(),
        login: effectiveLogin,
        password: newPassword.trim() || '123456',
        role: effectiveRole,
        roleId: targetRoleObj?.id,
        neighborhood: newNeighborhood.trim(), // Deixa em branco caso o usuário não informe
        birthday: newBirthday.trim(), // Deixa em branco caso não informado
        attendanceStatus: newStatus,
        attendancePercentage:
          newStatus === 'green' ? 100 : newStatus === 'yellow' ? 75 : newStatus === 'red' ? 50 : 20,
        cellId: cell.id,
        churchId: cell.churchId,
        phone: newPhone.trim(),
      });

      setNewName('');
      setNewLogin('');
      setIsLoginManuallyEdited(false);
      setNewPassword('');
      setNewNeighborhood('');
      setNewBirthday('');
      setNewPhone('');
      setFormError('');
      setLoginDuplicateError('');
      setIsAddModalOpen(false);
    } catch (err: any) {
      const msg = err?.message || 'Erro ao cadastrar membro.';
      setFormError(msg);
      if (msg.toLowerCase().includes('login')) {
        setLoginDuplicateError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
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

  const getShortRole = (role: string) => {
    if (role === 'Líder em Treinamento') return 'Líder Trein.';
    if (role === 'Líder de Célula') return 'Líder Célula';
    if (role === 'Líder de Setor') return 'Líder Setor';
    return role;
  };

  const getStatusLabel = (status: AttendanceStatus) => {
    switch (status) {
      case 'green':
        return 'Assíduo (90-100%)';
      case 'yellow':
        return 'Regular (~75%)';
      case 'red':
        return 'Alerta (< 50%)';
      case 'black':
        return 'Ausente (3+ faltas)';
    }
  };

  return (
    <div id="screen-my-cell" className="bg-[#e9eff6] min-h-screen pb-16 font-sans w-full overflow-x-hidden">
      {/* Top Banner & Header Controls */}
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 pt-3 sm:pt-4 pb-2 w-full">
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-xs border border-slate-200/80 mb-3 w-full">
          {/* Informações da Célula */}
          <div className="min-w-0 flex-1 pr-10 lg:pr-0">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#04213d] break-words">
              {cell.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 truncate">
              {(() => {
                const rawDay = (cell.meetingDay || 'Sexta').replace(/-feira/i, '').trim();
                const day = rawDay ? rawDay.charAt(0).toUpperCase() + rawDay.slice(1) : 'Sexta';
                const time = (cell.meetingTime || '19h30').replace(/^(\d{1,2}):(\d{2})$/, '$1h$2').trim();
                const leader = cell.leaderName || 'Não informado';
                return `${day} às ${time} - Líder: ${leader}`;
              })()}
            </p>
          </div>

          {/* Botão Legenda (posicionado no canto superior direito no mobile; em linha no desktop) */}
          <button
            type="button"
            id="btn-cell-frequency-legend"
            onClick={() => setShowLegend(!showLegend)}
            className="absolute top-3.5 right-3.5 lg:static p-2 lg:px-3 lg:py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
            title="Entenda as cores da frequência"
            aria-label="Legenda de frequência"
          >
            <HelpCircle size={16} className="text-slate-500" />
            <span className="hidden lg:inline">Legenda</span>
          </button>

          {/* Seletor de Células (A-Z) & Botão Novo Membro Lado a Lado */}
          {(accessibleCells.length > 1 || userHierarchyLevel > 1) && (
            <div className="flex flex-row items-center gap-2 justify-start lg:justify-end shrink-0 pt-2 lg:pt-0 border-t border-slate-100 lg:border-t-0 w-full lg:w-auto">
              {/* Seletor de Célula em Ordem Alfabética (A-Z) apenas com o nome da célula */}
              {accessibleCells.length > 1 && (
                <div className="flex items-center gap-1.5 bg-sky-50/80 hover:bg-sky-50 border border-sky-300 rounded-xl px-2.5 py-2 min-w-0 shadow-2xs transition flex-1 sm:flex-initial">
                  <span className="text-[10px] sm:text-xs font-extrabold text-sky-950 shrink-0">Célula:</span>
                  <select
                    id="select-active-cell"
                    value={cell.id}
                    onChange={(e) => onSelectCell?.(e.target.value)}
                    className="text-xs font-extrabold text-[#04213d] bg-transparent focus:outline-none cursor-pointer w-full sm:w-auto sm:max-w-[180px] lg:max-w-[200px] truncate"
                    title="Selecionar célula (Ordem A-Z)"
                  >
                    {displayedCells.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Botão Novo Membro (Visível apenas para nível hierárquico acima de 1) */}
              {userHierarchyLevel > 1 && (
                <button
                  type="button"
                  id="btn-cell-add-member"
                  onClick={handleOpenAddModal}
                  className="px-3.5 py-2 text-xs font-bold text-white bg-[#04213d] hover:bg-[#073366] rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus size={15} />
                  <span>Novo Membro</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Legend Expandable Drawer */}
        {showLegend && (
          <div className="bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xs mb-3 animate-in fade-in duration-150 w-full">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Critérios de Frequência da Célula:
              </h4>
              <button
                onClick={() => setShowLegend(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/70 border border-emerald-100">
                <span className="w-3.5 h-3.5 rounded-full bg-[#16a34a] shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-emerald-950 text-[11px] sm:text-xs truncate">Verde (Assíduo)</div>
                  <div className="text-[10px] text-emerald-700 truncate">90% a 100%</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/70 border border-amber-100">
                <span className="w-3.5 h-3.5 rounded-full bg-[#facc15] shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-amber-950 text-[11px] sm:text-xs truncate">Amarelo (Regular)</div>
                  <div className="text-[10px] text-amber-700 truncate">Em torno de 75%</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50/70 border border-red-100">
                <span className="w-3.5 h-3.5 rounded-full bg-[#d05a5a] shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-red-950 text-[11px] sm:text-xs truncate">Vermelho (Alerta)</div>
                  <div className="text-[10px] text-red-700 truncate">Abaixo de 50%</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 border border-slate-200">
                <span className="w-3.5 h-3.5 rounded-full bg-[#18181b] shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-slate-950 text-[11px] sm:text-xs truncate">Preto (Ausente)</div>
                  <div className="text-[10px] text-slate-600 truncate">3+ faltas seguidas</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Responsive Search & Filters Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-2 mb-3 w-full">
          <div className="relative w-full sm:flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={15}
            />
            <input
              id="input-search-members"
              type="text"
              placeholder="Buscar por nome, bairro ou função..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-8.5 pr-3 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-sky-800"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
            <select
              id="select-filter-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-800 cursor-pointer w-full sm:w-auto"
            >
              <option value="todos">Todas as Funções</option>
              <option value="Membro">Membro</option>
              <option value="Líder em Treinamento">Líder Trein.</option>
              <option value="Líder de Setor">Líder Setor</option>
              <option value="Líder de Célula">Líder Célula</option>
            </select>
            <select
              id="select-filter-attendance"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-800 cursor-pointer w-full sm:w-auto"
            >
              <option value="todos">Toda Frequência</option>
              <option value="green">Assíduo</option>
              <option value="yellow">Regular</option>
              <option value="red">Alerta</option>
              <option value="black">Ausente</option>
            </select>
          </div>
        </div>

        {/* Quick KPI Stats Bar - Compact & 100% responsive without overflowing */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-2 sm:p-2.5 mb-3 select-none w-full">
          <div className="grid grid-cols-5 divide-x divide-slate-100 text-center">
            <div className="px-0.5 sm:px-2">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 block truncate">Total</span>
              <span className="text-xs sm:text-sm font-bold text-[#04213d]">{stats.total}</span>
            </div>
            <div className="px-0.5 sm:px-2">
              <span className="text-[10px] sm:text-xs font-semibold text-emerald-700 flex items-center justify-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">Assíduo</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-emerald-700">{stats.greenCount}</span>
            </div>
            <div className="px-0.5 sm:px-2">
              <span className="text-[10px] sm:text-xs font-semibold text-amber-700 flex items-center justify-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="truncate">Regular</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-amber-700">{stats.yellowCount}</span>
            </div>
            <div className="px-0.5 sm:px-2">
              <span className="text-[10px] sm:text-xs font-semibold text-red-700 flex items-center justify-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="truncate">Alerta</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-red-700">{stats.redCount}</span>
            </div>
            <div className="px-0.5 sm:px-2">
              <span className="text-[10px] sm:text-xs font-semibold text-slate-800 flex items-center justify-center gap-1 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-900 shrink-0" />
                <span className="truncate">Ausente</span>
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-900">{stats.blackCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Members Table Container - 100% responsive, no margin overflow */}
      <div className="max-w-6xl mx-auto px-2 sm:px-6 w-full">
        <div className="w-full rounded-xl shadow-2xs overflow-hidden">
          {/* Dark Navy Table Header */}
          <div className="bg-[#052447] text-white rounded-t-xl px-2 sm:px-5 py-2.5 flex items-center text-xs font-bold tracking-wider select-none shadow-xs w-full">
            {/* Freq dot indicator column */}
            <div className="w-7 sm:w-10 shrink-0 text-center text-slate-300 text-[10px] sm:text-xs">
              Freq.
            </div>

            {/* Member Name */}
            <div className="flex-1 min-w-0 pl-1.5 sm:pl-3 text-left">
              Nome do Membro
            </div>

            {/* Role */}
            <div className="w-20 sm:w-36 md:w-44 text-center sm:text-left shrink-0">
              Função
            </div>

            {/* Neighborhood (desktop only) */}
            <div className="w-28 sm:w-36 text-left hidden md:block shrink-0">
              Bairro
            </div>

            {/* Birthday */}
            <div className="w-12 sm:w-20 text-center shrink-0">
              <span className="hidden sm:inline">Aniversário</span>
              <span className="sm:hidden">Aniv.</span>
            </div>

            {/* Leadership Track Button */}
            <div className="w-8 sm:w-14 text-center shrink-0">
              Trilho
            </div>
          </div>

          {/* Member List Rows */}
          <div className="space-y-1.5 pt-1.5 bg-[#e9eff6] rounded-b-xl w-full">
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
                    className="bg-white hover:bg-slate-50 transition-colors rounded-xl px-2 sm:px-5 py-2.5 sm:py-3 flex items-center shadow-2xs border border-slate-200/70 w-full"
                  >
                    {/* Attendance Frequency Circle Dot (Interactive) */}
                    <div className="w-7 sm:w-10 shrink-0 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => setSelectedMemberForAttendance(member)}
                        title={`Frequência: ${getStatusLabel(
                          member.attendanceStatus
                        )} - Clique para alterar`}
                        className="cursor-pointer group relative p-1 focus:outline-none"
                      >
                        <span
                          className={`block w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full ${getStatusColor(
                            member.attendanceStatus
                          )} shadow-xs group-hover:scale-110 transition-transform`}
                        />
                      </button>
                    </div>

                    {/* Nome do Membro */}
                    <div className="flex-1 min-w-0 pl-1.5 sm:pl-3 pr-1 text-left">
                      <span
                        onClick={() => onOpenLeadershipTrack(member)}
                        className="text-xs sm:text-base font-semibold text-[#0a2540] hover:text-sky-700 cursor-pointer truncate block"
                        title={member.name}
                      >
                        {member.name}
                      </span>
                      {member.neighborhood && (
                        <span className="text-[10px] text-slate-400 md:hidden truncate block">
                          {member.neighborhood}
                        </span>
                      )}
                    </div>

                    {/* Função */}
                    <div className="w-20 sm:w-36 md:w-44 text-center sm:text-left shrink-0">
                      <span
                        className="text-[11px] sm:text-sm font-medium leading-tight block truncate text-[#0a2540]"
                        title={member.role}
                      >
                        <span className="hidden sm:inline">{member.role}</span>
                        <span className="sm:hidden">{getShortRole(member.role)}</span>
                      </span>
                    </div>

                    {/* Bairro (desktop only) */}
                    <div className="w-28 sm:w-36 text-left shrink-0 hidden md:block text-xs sm:text-sm text-[#0a2540] truncate pr-2">
                      {member.neighborhood || '—'}
                    </div>

                    {/* Aniversário (dd/MM) */}
                    <div className="w-12 sm:w-20 text-center shrink-0 text-[11px] sm:text-sm font-medium text-[#0a2540]">
                      {member.birthday || '—'}
                    </div>

                    {/* Trilho Button (Notebook contact icon matching Screenshot) */}
                    <div className="w-8 sm:w-14 text-center shrink-0 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => onOpenLeadershipTrack(member)}
                        className="p-1 rounded-lg text-[#0e3056] hover:bg-sky-50 hover:text-sky-700 active:scale-95 transition-all group cursor-pointer"
                        title={`Ver Trilho de Liderança de ${member.name}`}
                        aria-label={`Trilho de liderança de ${member.name}`}
                      >
                        <LeadershipBadgeIcon
                          className="w-6 h-6 sm:w-8 sm:h-8 group-hover:scale-105 transition-transform"
                          size={24}
                        />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
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
                  { id: 'green', label: 'Verde • Assíduo (90% - 100%)', pct: 100, color: 'bg-[#16a34a]' },
                  { id: 'yellow', label: 'Amarelo • Regular (~75%)', pct: 75, color: 'bg-[#facc15]' },
                  { id: 'red', label: 'Vermelho • Alerta (< 50%)', pct: 50, color: 'bg-[#d05a5a]' },
                  { id: 'black', label: 'Preto • Ausente (3+ faltas)', pct: 15, color: 'bg-[#18181b]' },
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
                onClick={handleCloseAddModal}
                className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateMember} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Completo: *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Mateus Ribeiro"
                  value={newName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewName(val);
                    // Preenche o campo de login automaticamente se o usuário ainda não o editou
                    if (!isLoginManuallyEdited) {
                      const sugg = generateLoginSuggestion(val);
                      setNewLogin(sugg);
                      if (sugg) {
                        handleValidateLogin(sugg);
                      } else {
                        setLoginDuplicateError('');
                      }
                    }
                  }}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447]"
                />
              </div>

              {/* Login & Senha do Membro para Acesso à Aplicação */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#052447]" />
                    Credenciais de Acesso ao App
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Regra: Login único obrigatório
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700">
                        Login de Acesso: *
                      </label>
                      <div className="flex items-center gap-1.5">
                        {isCheckingLogin && (
                          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                        )}
                        <button
                          type="button"
                          onClick={handleRegenerateLogin}
                          className="text-[11px] font-bold text-sky-800 hover:text-sky-950 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 px-2 py-0.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
                          title="Regerar sugestão de login a partir do nome"
                        >
                          <RefreshCw size={11} className={isCheckingLogin ? 'animate-spin' : ''} />
                          <span>Regerar Login</span>
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Ex: mateus.ribeiro"
                      value={newLogin}
                      onChange={(e) => {
                        setIsLoginManuallyEdited(true);
                        const val = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9.]/g, '');
                        setNewLogin(val);
                        handleValidateLogin(val);
                      }}
                      onBlur={() => handleValidateLogin(newLogin)}
                      className={`w-full text-xs sm:text-sm p-2.5 rounded-xl border font-medium ${
                        loginDuplicateError
                          ? 'border-rose-400 bg-rose-50/60 text-rose-950'
                          : 'border-slate-300 bg-white text-slate-900'
                      } focus:outline-none focus:border-[#052447]`}
                    />
                    {loginDuplicateError ? (
                      <p className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {loginDuplicateError}
                      </p>
                    ) : newLogin.trim() ? (
                      <p className="mt-1 text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 shrink-0" />
                        Login disponível para cadastro
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] text-slate-500">
                        Gerado automaticamente a partir do nome ou editável pelo usuário.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-slate-500" />
                      Senha de Acesso:
                    </label>
                    <input
                      type="text"
                      placeholder="Padrão: 123456"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-[#052447]"
                    />
                    <p className="mt-1 text-[10px] text-slate-500">
                      Senha para este membro entrar na aplicação.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Função no Grupo:
                  </label>
                  <select
                    value={effectiveRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#052447] cursor-pointer"
                  >
                    {assignableRoles.length > 0 ? (
                      assignableRoles.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name}
                        </option>
                      ))
                    ) : (
                      <option value="Membro">Membro</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bairro:</label>
                  <input
                    type="text"
                    placeholder="Opcional (ex: Junco)"
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
                    onChange={handleBirthdayChange}
                    onBlur={() => {
                      if (newBirthday.trim()) {
                        const res = validateBirthday(newBirthday);
                        if (!res.valid) {
                          setBirthdayError(res.error || 'Data de aniversário inexistente.');
                        } else {
                          setBirthdayError('');
                        }
                      } else {
                        setBirthdayError('');
                      }
                    }}
                    className={`w-full text-xs sm:text-sm p-2.5 rounded-xl border ${
                      birthdayError
                        ? 'border-rose-400 bg-rose-50/50 text-rose-950 focus:border-rose-500'
                        : 'border-slate-300 focus:border-[#052447]'
                    } focus:outline-none`}
                  />
                  {birthdayError ? (
                    <p className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {birthdayError}
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-500">
                      Informe uma data válida (ex: 25/08).
                    </p>
                  )}
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
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !!loginDuplicateError}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#052447] hover:bg-[#073366] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Cadastrando...</span>
                    </>
                  ) : (
                    <span>Cadastrar Membro</span>
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
