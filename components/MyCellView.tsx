'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Image from 'next/image';
import { CellMember, CellGroup, AttendanceStatus, UserRole, UserProfile, Role, OrganizationalUnit } from '../types';
import { LeadershipBadgeIcon } from './LeadershipBadgeIcon';
import { AppChurchService } from '../lib/supabase';
import {
  optimizeImageToWebP,
  validateImageFile,
  validateImageForDatabase,
  IMAGE_PRESETS,
  formatFileSize,
} from '../lib/imageOptimizer';
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
  Users,
  Edit3,
  Camera,
  Upload,
  Clock,
  Calendar,
  Sparkles,
  Check,
  CheckCircle2,
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
  onUpdateCell?: (updatedCell: CellGroup) => Promise<void> | void;
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

/**
 * Sanitiza e valida o horário da reunião (HH:mm)
 */
const sanitizeTimeValue = (raw?: string): string => {
  if (!raw || raw === 'Horário a definir') return '19:30';
  const clean = raw.trim();
  const match = clean.match(/(\d{1,2})[:hH](\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const mins = parseInt(match[2], 10);
    if (hours >= 0 && hours <= 23 && mins >= 0 && mins <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
  }
  return '19:30';
};

/**
 * Calcula a idade a partir de uma string de data (dd/MM/yyyy ou YYYY-MM-DD)
 */
const calculateAge = (dateStr: string): number | null => {
  if (!dateStr) return null;
  let d: number, m: number, y: number;
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length < 3) return null;
    d = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    y = parseInt(parts[2], 10);
  } else {
    return null;
  }
  if (!y || !m || !d || isNaN(y) || isNaN(m) || isNaN(d)) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age--;
  }
  return age >= 0 && age <= 130 ? age : null;
};

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
  onUpdateCell,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('todos');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [selectedMemberForAttendance, setSelectedMemberForAttendance] = useState<CellMember | null>(
    null
  );

  // Edit Cell form state
  const [isEditCellModalOpen, setIsEditCellModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMeetingDay, setEditMeetingDay] = useState('');
  const [editMeetingTime, setEditMeetingTime] = useState('');
  const [editNeighborhood, setEditNeighborhood] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editFotoUrl, setEditFotoUrl] = useState('');
  const [isOptimizingCellPhoto, setIsOptimizingCellPhoto] = useState(false);
  const [cellPhotoStats, setCellPhotoStats] = useState<{ size: string; reduction: string } | null>(null);
  const [cellPhotoError, setCellPhotoError] = useState<string | null>(null);
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [editCellSuccess, setEditCellSuccess] = useState(false);
  const [editCellError, setEditCellError] = useState<string | null>(null);
  const cellFileInputRef = useRef<HTMLInputElement | null>(null);

  // New member form state
  const [newName, setNewName] = useState('');
  const [newLogin, setNewLogin] = useState('');
  const [isLoginManuallyEdited, setIsLoginManuallyEdited] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Membro');
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newBirthDate, setNewBirthDate] = useState('');
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
        if (
          currentUser?.name &&
          (c.leaderName?.toLowerCase().includes(currentUser.name.toLowerCase()) ||
            c.leaderNames?.some((n) => n.toLowerCase().includes(currentUser.name.toLowerCase())))
        ) {
          return true;
        }
        return false;
      });

      return sortAZ(matched.length > 0 ? matched : [cell]);
    }

    // 4. Líder de Célula: Apenas as células que lidera ou está vinculado
    if (isCellLeader) {
      const matched = cells.filter((c) => {
        if (currentUser?.currentCellId && c.id === currentUser.currentCellId) return true;
        if (
          currentUser?.name &&
          (c.leaderName?.toLowerCase().includes(currentUser.name.toLowerCase()) ||
            c.leaderNames?.some((n) => n.toLowerCase().includes(currentUser.name.toLowerCase())))
        ) {
          return true;
        }
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

  // Permissão estrita de edição em Linha Direta:
  // - Pastores / Administradores (Acesso total a todas as células)
  // - Líderes diretos da célula ativa
  // - Líderes superiores em linha direta (Líder do Setor pai desta célula, Líder da Área pai desta célula)
  // - Bloqueia líderes laterais e de outras áreas/setores
  const canEditCurrentCell = useMemo(() => {
    if (!currentUser) return false;
    if (isPastorOrAdmin) return true;

    // 1. Líder direto da célula
    const isDirectLeader =
      (cell.leaderMemberIds && cell.leaderMemberIds.includes(currentUser.id)) ||
      (currentUser.currentCellId === cell.id && (isCellLeader || userHierarchyLevel >= 2)) ||
      (currentUser.name && cell.leaderNames?.some((n) => n.toLowerCase() === currentUser.name.toLowerCase()));

    if (isDirectLeader) return true;

    // 2. Linha direta ascendente na árvore organizacional
    if (units && units.length > 0) {
      const currentUnit = units.find((u) => u.id === cell.id);
      if (currentUnit) {
        if (
          currentUnit.leaders?.some(
            (l) => l.id === currentUser.id || l.name?.toLowerCase() === currentUser.name?.toLowerCase()
          )
        ) {
          return true;
        }

        let currentParentId: string | null | undefined = currentUnit.parentId;
        while (currentParentId) {
          const parentUnit = units.find((u) => u.id === currentParentId);
          if (!parentUnit) break;

          // Se é líder direto da unidade pai/ancestral desta célula
          const isLeaderOfAncestor = parentUnit.leaders?.some(
            (l) => l.id === currentUser.id || l.name?.toLowerCase() === currentUser.name?.toLowerCase()
          );
          if (isLeaderOfAncestor) {
            return true;
          }

          // Se é líder de setor e o setor do usuário corresponde ao nome do pai direto
          if (isSectorLeader && currentUser.sector && parentUnit.name.toLowerCase() === currentUser.sector.toLowerCase()) {
            return true;
          }

          // Se é líder de área e a área do usuário corresponde ao nome do pai direto
          if (isAreaLeader && currentUser.sector && parentUnit.name.toLowerCase() === currentUser.sector.toLowerCase()) {
            return true;
          }

          currentParentId = parentUnit.parentId;
        }
      }
    }

    // 3. Fallback de Líder de Setor comparando setor do usuário com setor da célula ativa
    if (isSectorLeader && currentUser.sector && cell.sectorName) {
      const userSec = currentUser.sector.trim().toLowerCase();
      const cellSec = cell.sectorName.trim().toLowerCase();
      if (userSec === cellSec || userSec.includes(cellSec) || cellSec.includes(userSec)) {
        return true;
      }
    }

    return false;
  }, [
    currentUser,
    isPastorOrAdmin,
    isCellLeader,
    isSectorLeader,
    isAreaLeader,
    cell,
    units,
    userHierarchyLevel,
  ]);

  const handleOpenEditCellModal = () => {
    setEditName(cell.name || '');
    setEditMeetingDay(cell.meetingDay || 'Quarta-feira');
    setEditMeetingTime(sanitizeTimeValue(cell.meetingTime));
    setEditNeighborhood(cell.bairro || '');
    setEditAddress(cell.address || '');
    setEditFotoUrl(cell.fotoUrl || '');
    setCellPhotoStats(null);
    setCellPhotoError(null);
    setEditCellError(null);
    setEditCellSuccess(false);
    setIsEditCellModalOpen(true);
  };

  const handleCellPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setCellPhotoError(null);

    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setCellPhotoError(validation.error || 'Arquivo de imagem inválido.');
      return;
    }

    setIsOptimizingCellPhoto(true);
    try {
      const result = await optimizeImageToWebP(file, IMAGE_PRESETS.FEED_POST);
      if (!result.dataUrl.startsWith('data:image/webp')) {
        throw new Error('A foto não pôde ser convertida para WebP.');
      }
      setEditFotoUrl(result.dataUrl);
      setCellPhotoStats({
        size: formatFileSize(result.optimizedSize),
        reduction: result.reductionLabel,
      });
      setCellPhotoError(null);
    } catch (err: any) {
      console.error('Falha ao processar foto da célula:', err);
      setCellPhotoError('Não foi possível converter a foto para WebP. Por favor, envie uma foto válida.');
    } finally {
      setIsOptimizingCellPhoto(false);
    }
  };

  const handleSaveCellEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditCellError(null);

    if (!editName.trim()) {
      setEditCellError('Por favor, informe o nome da célula.');
      return;
    }

    if (!editMeetingTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(editMeetingTime.trim())) {
      setEditCellError('Por favor, selecione um horário válido de reunião (entre 00:00 e 23:59).');
      return;
    }

    if (editFotoUrl && editFotoUrl.startsWith('data:')) {
      const dbValidation = validateImageForDatabase(editFotoUrl, 'Foto da célula');
      if (!dbValidation.isValid) {
        setEditCellError(dbValidation.error || 'A foto deve estar em formato WebP leve.');
        return;
      }
    }

    setIsSavingCell(true);
    try {
      const updated = await AppChurchService.updateCell({
        cellId: cell.id,
        churchId: cell.churchId || currentUser?.churchId || '',
        name: editName.trim(),
        meetingDay: editMeetingDay.trim(),
        meetingTime: editMeetingTime.trim(),
        neighborhood: editNeighborhood.trim(),
        address: editAddress.trim(),
        fotoUrl: editFotoUrl.trim() || undefined,
        userMemberId: currentUser?.id,
      });

      if (onUpdateCell) {
        await onUpdateCell(updated);
      }

      setEditCellSuccess(true);
      setTimeout(() => {
        setEditCellSuccess(false);
        setIsEditCellModalOpen(false);
      }, 900);
    } catch (err: any) {
      console.error('Erro ao salvar alterações da célula:', err);
      setEditCellError(err?.message || 'Erro ao salvar alterações da célula.');
    } finally {
      setIsSavingCell(false);
    }
  };

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
   * Valida se uma string dd/MM/aaaa ou dd/MM ou YYYY-MM-DD corresponde a uma data real do calendário.
   * Impede datas inexistentes como 12/33, 31/04, 32/01, 29/02 em anos não bissextos e anos inválidos.
   */
  const validateBirthday = (value: string): { valid: boolean; error?: string } => {
    if (!value || value.trim() === '') {
      return { valid: true };
    }
    const clean = value.trim();

    if (clean.includes('-')) {
      const parts = clean.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      const currentYear = new Date().getFullYear();
      if (isNaN(y) || isNaN(m) || isNaN(d)) return { valid: false, error: 'Data de nascimento inválida.' };
      if (y < 1900 || y > currentYear) return { valid: false, error: `Ano de nascimento deve ser entre 1900 e ${currentYear}.` };
      if (m < 1 || m > 12) return { valid: false, error: 'Mês inexistente.' };
      const maxD = new Date(y, m, 0).getDate();
      if (d < 1 || d > maxD) return { valid: false, error: `Dia inexistente (${d}). Este mês possui até ${maxD} dias.` };
      return { valid: true };
    }

    const parts = clean.split('/');
    if (parts.length !== 2 && parts.length !== 3) {
      return { valid: false, error: 'Formato incompleto. Selecione a data de nascimento ou use o padrão dd/MM/aaaa.' };
    }
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const currentYear = new Date().getFullYear();
    const year = parts.length === 3 ? parseInt(parts[2], 10) : undefined;

    if (isNaN(day) || isNaN(month) || (year !== undefined && isNaN(year))) {
      return { valid: false, error: 'Data deve conter apenas números válidos.' };
    }

    if (year !== undefined) {
      if (year < 1900 || year > currentYear) {
        return {
          valid: false,
          error: `Ano de nascimento (${year}) deve ser entre 1900 e ${currentYear}.`,
        };
      }
    }

    if (month < 1 || month > 12) {
      return {
        valid: false,
        error: `Mês inexistente (${month}). O calendário possui meses de 01 a 12.`,
      };
    }

    const effectiveYear = year || (month === 2 ? 2024 : 2023);
    const maxDays = new Date(effectiveYear, month, 0).getDate();

    if (day < 1 || day > maxDays) {
      return {
        valid: false,
        error: `Dia inexistente (${day}). O mês ${String(month).padStart(2, '0')} possui até ${maxDays} dias.`,
      };
    }

    return { valid: true };
  };

  /**
   * Manipulador para seleção via Date Picker nativo (com ano de nascimento)
   */
  const handleBirthDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isoVal = e.target.value; // YYYY-MM-DD
    setNewBirthDate(isoVal);
    if (isoVal) {
      const [y, m, d] = isoVal.split('-');
      const formatted = `${d}/${m}/${y}`;
      setNewBirthday(formatted);
      const res = validateBirthday(isoVal);
      if (!res.valid) {
        setBirthdayError(res.error || 'Data de nascimento inválida.');
      } else {
        setBirthdayError('');
      }
    } else {
      setNewBirthday('');
      setBirthdayError('');
    }
  };

  /**
   * Formatação automática e validação de data no campo de aniversário (dd/MM/aaaa)
   */
  const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, '').slice(0, 8);

    let formatted = '';
    if (!digits) {
      formatted = '';
    } else if (digits.length <= 2) {
      formatted = digits;
    } else if (digits.length <= 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
    } else {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
    }

    setNewBirthday(formatted);

    if (digits.length === 8) {
      const d = digits.slice(0, 2);
      const m = digits.slice(2, 4);
      const y = digits.slice(4, 8);
      setNewBirthDate(`${y}-${m}-${d}`);
      const result = validateBirthday(formatted);
      if (!result.valid) {
        setBirthdayError(result.error || 'Data de nascimento inexistente.');
      } else {
        setBirthdayError('');
      }
    } else if (digits.length === 4) {
      const result = validateBirthday(formatted);
      if (!result.valid) {
        setBirthdayError(result.error || 'Data inexistente.');
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
    setNewBirthDate('');
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

    // Validação de senha: se informada, deve ter no mínimo 6 caracteres para autenticação
    const cleanPassword = newPassword.trim();
    if (cleanPassword && cleanPassword.length < 6) {
      setFormError('A senha de acesso deve ter no mínimo 6 caracteres para permitir o login no autenticador.');
      setIsSubmitting(false);
      return;
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
        password: cleanPassword || '123456',
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
      setNewBirthDate('');
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

  // Tamanho dinâmico e adaptativo da fonte do nome da célula
  const cellNameFontSizeClass = useMemo(() => {
    const len = cell.name?.length || 0;
    if (len > 35) return 'text-lg sm:text-xl lg:text-2xl leading-snug';
    if (len > 22) return 'text-xl sm:text-2xl lg:text-[26px] leading-tight';
    return 'text-[22px] sm:text-[26px] lg:text-[28px] leading-tight';
  }, [cell.name]);

  return (
    <div id="screen-my-cell" className="bg-[#e9eff6] min-h-screen pb-16 font-sans w-full overflow-x-hidden">
      {/* Top Banner & Header Controls */}
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 pt-3 sm:pt-4 pb-2 w-full">
        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-xs border border-slate-200/80 mb-3 w-full">
          {/* Informações da Célula */}
          <div className="min-w-0 flex-1 pr-10 lg:pr-0">
            <h2 className={`${cellNameFontSizeClass} font-extrabold text-[#04213d] break-words`}>
              {cell.name}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 truncate">
              {(() => {
                const rawDay = (cell.meetingDay || 'Sexta').replace(/-feira/i, '').trim();
                const day = rawDay ? rawDay.charAt(0).toUpperCase() + rawDay.slice(1) : 'Sexta';
                const time = (cell.meetingTime || '19h30').replace(/^(\d{1,2}):(\d{2})$/, '$1h$2').trim();

                // 1. Líderes vinculados à unidade organizacional (unidade_lideres)
                const currentUnit = units.find((u) => u.id === cell.id);
                const unitLeaderNames = (currentUnit?.leaders || []).map((l) => l.name).filter(Boolean);

                // 2. Líderes vinculados nos dados da célula (unidade_lideres)
                const cellLeaderNames = cell.leaderNames && cell.leaderNames.length > 0
                  ? cell.leaderNames
                  : (cell.leaderName && cell.leaderName !== 'Não informado' && cell.leaderName !== 'Líder')
                  ? cell.leaderName.split(/ e |, /).map((s) => s.trim()).filter(Boolean)
                  : [];

                // Combina e deduplica estritamente os líderes vinculados a esta célula
                const combinedLeaders: string[] = [];
                [...unitLeaderNames, ...cellLeaderNames].forEach((name) => {
                  if (name && !combinedLeaders.some((n) => n.toLowerCase() === name.toLowerCase())) {
                    combinedLeaders.push(name);
                  }
                });

                let formattedLeader = 'Não informado';
                if (combinedLeaders.length === 1) {
                  formattedLeader = combinedLeaders[0];
                } else if (combinedLeaders.length === 2) {
                  formattedLeader = `${combinedLeaders[0]} e ${combinedLeaders[1]}`;
                } else if (combinedLeaders.length > 2) {
                  formattedLeader = `${combinedLeaders.slice(0, -1).join(', ')} e ${combinedLeaders[combinedLeaders.length - 1]}`;
                } else if (cell.leaderName && cell.leaderName !== 'Líder') {
                  formattedLeader = cell.leaderName;
                }

                const isPlural =
                  combinedLeaders.length > 1 ||
                  formattedLeader.includes(' e ') ||
                  formattedLeader.includes(',');
                const leaderLabel = isPlural ? 'Líderes' : 'Líder';

                return `${day} às ${time} - ${leaderLabel}: ${formattedLeader}`;
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

          {/* Seletor de Células (A-Z), Botão Editar Célula & Botão Novo Membro */}
          {(accessibleCells.length > 1 || userHierarchyLevel > 1 || canEditCurrentCell) && (
            <div className="flex flex-row items-center gap-2 justify-start lg:justify-end shrink-0 pt-2 lg:pt-0 border-t border-slate-100 lg:border-t-0 w-full lg:w-auto">
              {/* Seletor de Célula em Ordem Alfabética (A-Z) apenas com o nome da célula */}
              {accessibleCells.length > 1 && (
                <div className="flex items-center gap-1.5 bg-sky-50/80 hover:bg-sky-50 border border-sky-300 rounded-xl pl-2 pr-2.5 sm:px-2.5 py-2 min-w-0 shadow-2xs transition flex-1 sm:flex-initial">
                  <span className="text-[10px] sm:text-xs font-bold text-sky-950 shrink-0 hidden sm:inline">Célula:</span>
                  <select
                    id="select-active-cell"
                    value={cell.id}
                    onChange={(e) => onSelectCell?.(e.target.value)}
                    className="text-[15px] sm:text-xs font-bold text-[#04213d] bg-transparent focus:outline-none cursor-pointer w-full sm:w-auto sm:max-w-[180px] lg:max-w-[200px] truncate"
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

              {/* Botão Editar Informações da Célula (Visível para líderes em linha direta e pastores) */}
              {canEditCurrentCell && (
                <button
                  type="button"
                  id="btn-edit-cell-info"
                  onClick={handleOpenEditCellModal}
                  className="px-3 py-2 text-xs font-bold text-sky-950 bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded-xl shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
                  title="Editar informações da célula (Nome, Dia, Horário, Endereço, Foto)"
                >
                  <Edit3 size={14} className="text-sky-700" />
                  <span className="hidden sm:inline">Editar Célula</span>
                  <span className="sm:hidden">Editar</span>
                </button>
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
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Critérios de Frequência & Quantidade por Status
                </h4>
                <span className="text-[11px] text-slate-500 font-medium">
                  ({stats.total} {stats.total === 1 ? 'membro' : 'membros'} no total)
                </span>
              </div>
              <button
                onClick={() => setShowLegend(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                aria-label="Fechar legenda"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#16a34a] shrink-0 shadow-2xs" />
                  <div className="min-w-0">
                    <div className="font-bold text-emerald-950 text-xs sm:text-sm truncate">Assíduo</div>
                    <div className="text-[10px] sm:text-[11px] text-emerald-700 truncate">90% a 100%</div>
                  </div>
                </div>
                <div className="bg-emerald-600 text-white font-extrabold text-xs px-2.5 py-0.5 rounded-full shrink-0 shadow-2xs">
                  {stats.greenCount}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#facc15] shrink-0 shadow-2xs" />
                  <div className="min-w-0">
                    <div className="font-bold text-amber-950 text-xs sm:text-sm truncate">Regular</div>
                    <div className="text-[10px] sm:text-[11px] text-amber-700 truncate">Em torno de 75%</div>
                  </div>
                </div>
                <div className="bg-amber-500 text-amber-950 font-extrabold text-xs px-2.5 py-0.5 rounded-full shrink-0 shadow-2xs">
                  {stats.yellowCount}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-red-50/80 border border-red-200/80">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#d05a5a] shrink-0 shadow-2xs" />
                  <div className="min-w-0">
                    <div className="font-bold text-red-950 text-xs sm:text-sm truncate">Alerta</div>
                    <div className="text-[10px] sm:text-[11px] text-red-700 truncate">Abaixo de 50%</div>
                  </div>
                </div>
                <div className="bg-red-600 text-white font-extrabold text-xs px-2.5 py-0.5 rounded-full shrink-0 shadow-2xs">
                  {stats.redCount}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 border border-slate-300/80">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3.5 h-3.5 rounded-full bg-[#18181b] shrink-0 shadow-2xs" />
                  <div className="min-w-0">
                    <div className="font-bold text-slate-950 text-xs sm:text-sm truncate">Ausente</div>
                    <div className="text-[10px] sm:text-[11px] text-slate-600 truncate">3+ faltas seguidas</div>
                  </div>
                </div>
                <div className="bg-slate-900 text-white font-extrabold text-xs px-2.5 py-0.5 rounded-full shrink-0 shadow-2xs">
                  {stats.blackCount}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Responsive Search & Filters Bar com Contador de Membros */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3 w-full">
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
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 flex-1 sm:flex sm:w-auto">
              <select
                id="select-filter-role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl pl-1.5 pr-2 sm:px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-800 cursor-pointer w-full sm:w-auto"
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
                className="bg-white border border-slate-200 rounded-xl pl-1.5 pr-2 sm:px-2.5 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-800 cursor-pointer w-full sm:w-auto"
              >
                <option value="todos">Toda Frequência</option>
                <option value="green">Assíduo</option>
                <option value="yellow">Regular</option>
                <option value="red">Alerta</option>
                <option value="black">Ausente</option>
              </select>
            </div>

            {/* Contador de Membros da Célula integrado ao bloco de filtros */}
            <div
              id="cell-members-count-badge"
              className="bg-white border border-slate-200 rounded-xl px-2.5 sm:px-3 py-2 text-xs font-bold text-[#04213d] flex items-center gap-1 sm:gap-1.5 shrink-0 shadow-2xs whitespace-nowrap"
              title="Quantidade total de membros nesta célula"
            >
              <Users size={14} className="text-slate-500 sm:hidden shrink-0" />
              <span className="text-slate-500 font-medium hidden sm:inline">Membros:</span>
              <span className="bg-[#052447] text-white text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full font-bold">
                {stats.total}
              </span>
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
                      Mínimo 6 caracteres. Deixe em branco para usar o padrão (123456).
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-sky-700" />
                      Data de Nascimento (com Ano):
                    </span>
                    {newBirthday && calculateAge(newBirthday) !== null && (
                      <span className="text-[10px] font-bold text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded">
                        {calculateAge(newBirthday)} anos
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    min="1900-01-01"
                    value={newBirthDate}
                    onChange={handleBirthDateChange}
                    className={`w-full text-xs sm:text-sm p-2.5 rounded-xl border ${
                      birthdayError
                        ? 'border-rose-400 bg-rose-50/50 text-rose-950 focus:border-rose-500'
                        : 'border-slate-300 focus:border-[#052447]'
                    } focus:outline-none bg-white cursor-pointer font-medium text-slate-800`}
                  />
                  {birthdayError ? (
                    <p className="mt-1 text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {birthdayError}
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-500">
                      {newBirthday ? `Data selecionada: ${newBirthday}` : 'Selecione dia, mês e ano de nascimento.'}
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

      {/* Modal: Editar Informações da Célula */}
      {isEditCellModalOpen && (
        <div
          id="modal-edit-cell"
          className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none text-slate-800"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#04213d] text-white p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-300 flex items-center justify-center shrink-0">
                  <Edit3 size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-white truncate">Editar Informações da Célula</h3>
                  <p className="text-xs text-sky-200 truncate">{cell.name}</p>
                </div>
              </div>
              <button
                type="button"
                id="btn-close-edit-cell-modal"
                onClick={() => setIsEditCellModalOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
                aria-label="Fechar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveCellEdit} className="flex flex-col">
              <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Feedback Erro / Sucesso */}
                {editCellError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2 animate-in fade-in">
                    <AlertCircle size={16} className="text-rose-600 shrink-0" />
                    <span>{editCellError}</span>
                  </div>
                )}

                {editCellSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>Informações da célula atualizadas com sucesso!</span>
                  </div>
                )}

                {/* Nome da Célula */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome da Célula: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ex: Célula Betel, Célula Koinonia"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800 font-medium"
                  />
                </div>

                {/* Grid: Dia da Semana & Horário */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Calendar size={13} className="text-sky-700" />
                      <span>Dia da Reunião:</span>
                    </label>
                    <select
                      value={editMeetingDay}
                      onChange={(e) => setEditMeetingDay(e.target.value)}
                      className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800 font-medium bg-white cursor-pointer"
                    >
                      <option value="Segunda-feira">Segunda-feira</option>
                      <option value="Terça-feira">Terça-feira</option>
                      <option value="Quarta-feira">Quarta-feira</option>
                      <option value="Quinta-feira">Quinta-feira</option>
                      <option value="Sexta-feira">Sexta-feira</option>
                      <option value="Sábado">Sábado</option>
                      <option value="Domingo">Domingo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Clock size={13} className="text-sky-700" />
                      <span>Horário da Reunião:</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={editMeetingTime}
                      onChange={(e) => setEditMeetingTime(e.target.value)}
                      className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800 font-medium bg-white cursor-pointer"
                    />
                    <div className="flex items-center gap-1 mt-1.5 overflow-x-auto no-scrollbar">
                      {['18:00', '19:00', '19:30', '20:00', '20:30'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setEditMeetingTime(preset)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md transition cursor-pointer shrink-0 ${
                            editMeetingTime === preset
                              ? 'bg-[#052447] text-white font-bold'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Grid: Bairro & Endereço */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <MapPin size={13} className="text-rose-500" />
                      <span>Bairro:</span>
                    </label>
                    <input
                      type="text"
                      value={editNeighborhood}
                      onChange={(e) => setEditNeighborhood(e.target.value)}
                      placeholder="Ex: Centro, Junco, Cohab"
                      className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Endereço Completo:
                    </label>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="Ex: Rua Sumaré, 245"
                      className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800"
                    />
                  </div>
                </div>

                {/* Seção da Foto da Célula */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Foto da Célula (opcional):
                  </label>

                  <div className="flex items-center gap-3">
                    <div
                      onClick={() => cellFileInputRef.current?.click()}
                      className="w-20 h-14 rounded-xl border-2 border-dashed border-sky-300 overflow-hidden bg-slate-100 shrink-0 relative group cursor-pointer flex items-center justify-center"
                      title="Clique para carregar foto da célula"
                    >
                      {editFotoUrl ? (
                        <Image
                          src={editFotoUrl}
                          alt="Foto da célula"
                          width={80}
                          height={56}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          unoptimized
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Camera size={20} className="text-slate-400 group-hover:text-sky-600 transition-colors" />
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Upload size={16} className="text-white" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-1">
                      <button
                        type="button"
                        onClick={() => cellFileInputRef.current?.click()}
                        disabled={isOptimizingCellPhoto}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-semibold rounded-xl transition cursor-pointer"
                      >
                        {isOptimizingCellPhoto ? (
                          <Loader2 size={13} className="animate-spin text-sky-600" />
                        ) : (
                          <Upload size={13} />
                        )}
                        <span>Carregar Foto do Dispositivo</span>
                      </button>
                      <input
                        ref={cellFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCellPhotoSelected}
                      />
                      <p className="text-[10px] text-slate-400">
                        Convertida automaticamente para WebP leve.
                      </p>
                    </div>
                  </div>

                  {cellPhotoStats && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                      <Sparkles size={12} className="text-emerald-600" />
                      <span>WebP Otimizado: {cellPhotoStats.size} ({cellPhotoStats.reduction})</span>
                    </div>
                  )}

                  {cellPhotoError && (
                    <div className="p-2 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs font-semibold">
                      {cellPhotoError}
                    </div>
                  )}

                  {/* Input de URL alternativo */}
                  <div>
                    <input
                      type="url"
                      value={editFotoUrl}
                      onChange={(e) => setEditFotoUrl(e.target.value)}
                      placeholder="Ou informe o link da imagem (URL https://...)"
                      className="w-full text-xs p-2 rounded-xl border border-slate-300 focus:outline-none focus:border-sky-800 text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditCellModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-confirm-save-cell-edit"
                  disabled={isSavingCell || !editName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#04213d] hover:bg-[#073366] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isSavingCell ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <span>Salvar Alterações</span>
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
