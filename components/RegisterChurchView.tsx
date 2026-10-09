'use client';

import React, { useState, useId } from 'react';
import {
  Church as ChurchIcon,
  Building2,
  Upload,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ArrowLeft,
  Layers,
  UserCheck,
  ChevronRight,
  MapPin,
  Calendar,
  Clock,
  Loader2,
  X,
} from 'lucide-react';
import { HierarchicalLevelInput, RegisterChurchInput, UserProfile } from '../types';
import { AppChurchService } from '../lib/supabase';
import {
  optimizeImageToWebP,
  validateImageFile,
  validateImageForDatabase,
  IMAGE_PRESETS,
  formatFileSize,
} from '../lib/imageOptimizer';
import { uploadChurchLogo, deleteChurchLogo } from '../lib/churchLogoStorage';

/**
 * Gera um UUID v4 no navegador. Usado para pré-gerar o churchId desta igreja em
 * cadastro ANTES de ela existir no banco, só para correlacionar o upload do
 * logotipo (Storage) com o registro que será criado em seguida.
 */
function generateClientUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface RegisterChurchViewProps {
  onBack?: () => void;
  onSuccessLogin?: (user: UserProfile) => void;
  isLoggedIn?: boolean;
  onNavigateUnits?: (church?: { churchId: string; churchName: string }) => void;
  onNavigateOverview?: (church?: { churchId: string; churchName: string }) => void;
}

const HIERARCHY_PRESETS: {
  label: string;
  description: string;
  levels: { name: string; order: number }[];
}[] = [
  {
    label: 'Padrão Completo (4 Níveis)',
    description: 'Distrito ➔ Área ➔ Setor ➔ Célula',
    levels: [
      { name: 'Distrito', order: 10 },
      { name: 'Área', order: 20 },
      { name: 'Setor', order: 30 },
      { name: 'Célula', order: 40 },
    ],
  },
  {
    label: 'Tradicional (2 Níveis)',
    description: 'Setor ➔ Célula',
    levels: [
      { name: 'Setor', order: 10 },
      { name: 'Célula', order: 20 },
    ],
  },
  {
    label: 'Visão Celular / Redes (3 Níveis)',
    description: 'Rede ➔ Equipe ➔ Célula',
    levels: [
      { name: 'Rede', order: 10 },
      { name: 'Equipe', order: 20 },
      { name: 'Célula', order: 30 },
    ],
  },
  {
    label: 'Distrito & Setor (3 Níveis)',
    description: 'Distrito ➔ Setor ➔ Célula',
    levels: [
      { name: 'Distrito', order: 10 },
      { name: 'Setor', order: 20 },
      { name: 'Célula', order: 30 },
    ],
  },
];

// Helper to auto-generate login following the system rules
function generateSmartLogin(fullName: string): string {
  if (!fullName) return '';
  // Remove multiple spaces and title prefixes like Pr., Pr, Pastor, Pra, Pastora
  const cleaned = fullName
    .replace(/^(pr\.|pra\.|pr\s|pra\s|pastor\s|pastora\s|bispo\s|apostolo\s|ap\.\s)/i, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';

  const cleanWord = (w: string) =>
    w
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  const first = cleanWord(words[0]);
  if (words.length === 1) return first;

  const secondRaw = words[1];
  const second = cleanWord(secondRaw);

  // Se a segunda palavra tiver 3 ou menos letras e houver terceira palavra, usa a terceira
  if (second.length <= 3 && words.length >= 3) {
    const third = cleanWord(words[2]);
    return `${first}.${second}.${third}`;
  }

  return `${first}.${second}`;
}

// Máscara CNPJ
function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

// Máscara Telefone
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

export const RegisterChurchView: React.FC<RegisterChurchViewProps> = ({
  onBack,
  onSuccessLogin,
  isLoggedIn = false,
  onNavigateUnits,
  onNavigateOverview,
}) => {
  const churchNameId = useId();
  const cnpjId = useId();
  const cityId = useId();
  const stateId = useId();
  const pastorNameId = useId();
  const pastorPhoneId = useId();
  const pastorEmailId = useId();
  const pastorLoginId = useId();
  const pastorPasswordId = useId();

  // Dados da Igreja
  const [churchName, setChurchName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [logoUrl, setLogoUrl] = useState(''); // URL pública real no Storage, enviada ao backend
  const [logoPreview, setLogoPreview] = useState<string | null>(null); // data URL local, só para exibição
  const [isOptimizingLogo, setIsOptimizingLogo] = useState(false);
  const [logoStats, setLogoStats] = useState<{ size: string; reduction: string } | null>(null);
  // churchId pré-gerado no navegador, só para correlacionar o logo (Storage) com a
  // igreja que será criada em /api/churches/register ao confirmar o cadastro.
  const [pendingChurchId, setPendingChurchId] = useState(() => generateClientUUID());

  // Níveis Hierárquicos
  const [levels, setLevels] = useState<HierarchicalLevelInput[]>([
    { name: 'Distrito', order: 10 },
    { name: 'Área', order: 20 },
    { name: 'Setor', order: 30 },
    { name: 'Célula', order: 40 },
  ]);

  // Dados do Pastor
  const [pastorName, setPastorName] = useState('');
  const [pastorPhone, setPastorPhone] = useState('');
  const [pastorEmail, setPastorEmail] = useState('');
  const [pastorLogin, setPastorLogin] = useState('');
  const [pastorPassword, setPastorPassword] = useState('123456');
  const [isLoginManuallyEdited, setIsLoginManuallyEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Estados de Operação & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successResult, setSuccessResult] = useState<{
    churchId: string;
    churchName: string;
    pastorMemberId: string;
    pastorName: string;
    pastorLogin: string;
    pastorPassword: string;
    userProfile: UserProfile;
  } | null>(null);
  const [copiedLogin, setCopiedLogin] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Atualização automática de login a partir do nome do Pastor (se não editado manualmente)
  const handlePastorNameChange = (val: string) => {
    setPastorName(val);
    if (!isLoginManuallyEdited) {
      setPastorLogin(generateSmartLogin(val));
    }
  };

  const handleGenerateStrongPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = 'Pr#';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPastorPassword(pass);
  };

  // Upload do Logotipo (Drag & Drop / Input file): otimiza para WebP e envia
  // direto para o Supabase Storage (bucket "church-logos") — só a URL pública
  // resultante é salva como logoUrl; o data URL fica apenas no preview local.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setErrorMessage('');

    const validation = validateImageFile(file);
    if (!validation.isValid) {
      setErrorMessage(validation.error || 'Arquivo de imagem inválido.');
      return;
    }

    const previousLogoUrl = logoUrl;

    setIsOptimizingLogo(true);
    try {
      // optimizeImageToWebP já recorre a JPEG otimizado quando o navegador não
      // sabe codificar WebP via Canvas (comum em iOS Safari mais antigo e alguns
      // WebViews) — qualquer um dos dois formatos é válido aqui.
      const optimized = await optimizeImageToWebP(file, IMAGE_PRESETS.LOGO);
      setLogoPreview(optimized.dataUrl);
      setLogoStats({
        size: formatFileSize(optimized.optimizedSize),
        reduction: optimized.reductionLabel,
      });

      const { publicUrl } = await uploadChurchLogo(optimized.blob, pendingChurchId);
      setLogoUrl(publicUrl);
      setErrorMessage('');

      if (previousLogoUrl) {
        deleteChurchLogo(previousLogoUrl, pendingChurchId);
      }
    } catch (err: any) {
      console.error('Falha ao processar/enviar logotipo:', err);
      setErrorMessage(err?.message || 'Não foi possível enviar o logotipo. Envie uma imagem válida (PNG, JPG ou WEBP).');
      setLogoPreview('');
      setLogoUrl('');
      setLogoStats(null);
    } finally {
      setIsOptimizingLogo(false);
    }
  };

  const handleApplyPreset = (presetLevels: { name: string; order: number }[]) => {
    setLevels(presetLevels.map((l) => ({ ...l })));
  };

  const handleAddLevel = () => {
    const maxOrder = levels.reduce((max, lvl) => Math.max(max, lvl.order), 0);
    const newOrder = maxOrder + 10;
    setLevels([...levels, { name: `Nível ${levels.length + 1}`, order: newOrder }]);
  };

  const handleRemoveLevel = (index: number) => {
    if (levels.length <= 1) {
      setErrorMessage('A igreja deve possuir ao menos 1 nível hierárquico (ex: Célula).');
      return;
    }
    const updated = levels.filter((_, i) => i !== index);
    // Renumera com espaçamento de 10
    const renumbered = updated.map((lvl, idx) => ({
      ...lvl,
      order: (idx + 1) * 10,
    }));
    setLevels(renumbered);
  };

  const handleMoveLevel = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === levels.length - 1)
    ) {
      return;
    }
    const newLevels = [...levels];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newLevels[index];
    newLevels[index] = newLevels[targetIndex];
    newLevels[targetIndex] = temp;

    // Recalcula ordens para manter 10, 20, 30...
    const renumbered = newLevels.map((lvl, idx) => ({
      ...lvl,
      order: (idx + 1) * 10,
    }));
    setLevels(renumbered);
  };

  const handleLevelNameChange = (index: number, newName: string) => {
    const updated = [...levels];
    updated[index].name = newName;
    setLevels(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Validações
    if (!churchName.trim()) {
      setErrorMessage('Informe o nome da congregação / igreja.');
      return;
    }
    if (!city.trim()) {
      setErrorMessage('Informe a cidade da congregação.');
      return;
    }
    if (!stateUf.trim()) {
      setErrorMessage('Informe o estado (UF) da congregação.');
      return;
    }
    if (levels.length === 0) {
      setErrorMessage('Adicione ao menos um nível hierárquico (ex: Célula).');
      return;
    }
    if (!pastorName.trim()) {
      setErrorMessage('Informe o nome do Pastor Titular.');
      return;
    }
    if (!pastorLogin.trim()) {
      setErrorMessage('Informe ou gere um login de acesso para o Pastor.');
      return;
    }
    if (!pastorPassword.trim()) {
      setErrorMessage('Informe uma senha de acesso para o Pastor.');
      return;
    }
    if (pastorPassword.trim().length < 6) {
      setErrorMessage('A senha do Pastor deve ter no mínimo 6 dígitos.');
      return;
    }
    if (isOptimizingLogo) {
      setErrorMessage('Aguarde o envio do logotipo terminar antes de confirmar.');
      return;
    }

    if (logoUrl.trim()) {
      const logoValidation = validateImageForDatabase(logoUrl.trim(), 'Logotipo da Igreja');
      if (!logoValidation.isValid) {
        setErrorMessage(logoValidation.error || 'O logotipo deve estar no formato WebP.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const input: RegisterChurchInput = {
        churchId: pendingChurchId,
        name: churchName.trim(),
        cnpj: cnpj.trim() || undefined,
        city: city.trim(),
        state: stateUf.trim().toUpperCase(),
        logoUrl: logoUrl.trim() || undefined,
        levels: levels.map((l) => ({ name: l.name.trim(), order: l.order })),
        pastorName: pastorName.trim(),
        pastorPhone: pastorPhone.trim() || undefined,
        pastorEmail: pastorEmail.trim() || undefined,
        pastorLogin: pastorLogin.trim().toLowerCase(),
        pastorPassword: pastorPassword.trim(),
      };

      const result = await AppChurchService.registerChurch(input);

      setSuccessResult({
        churchId: result.church.id,
        churchName: result.church.name,
        pastorMemberId: result.pastor.id,
        pastorName: result.pastor.name,
        pastorLogin: result.pastor.login,
        pastorPassword: pastorPassword.trim(),
        userProfile: result.pastor,
      });

      setIsLoading(false);
    } catch (err: any) {
      console.error('Erro ao cadastrar igreja:', err);
      setErrorMessage(
        err?.message || 'Falha ao cadastrar congregação. Verifique os dados e tente novamente.'
      );
      setIsLoading(false);
    }
  };

  const handleCopyText = (text: string, type: 'login' | 'password') => {
    navigator.clipboard.writeText(text);
    if (type === 'login') {
      setCopiedLogin(true);
      setTimeout(() => setCopiedLogin(false), 2000);
    } else {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
  };

  const handleResetForAnotherChurch = () => {
    setChurchName('');
    setCnpj('');
    setCity('');
    setStateUf('');
    setLogoUrl('');
    setLogoPreview(null);
    setLogoStats(null);
    setPendingChurchId(generateClientUUID());
    setPastorName('');
    setPastorPhone('');
    setPastorEmail('');
    setPastorLogin('');
    setPastorPassword('123456');
    setIsLoginManuallyEdited(false);
    setSuccessResult(null);
    setErrorMessage('');
  };

  return (
    <div
      id="screen-register-church"
      className="min-h-screen bg-[#e9eff6] py-6 px-3 sm:px-6 md:px-8 font-sans selection:bg-[#052447] selection:text-white"
    >
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header Card */}
        <div className="bg-[#04213d] text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
                title="Voltar"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0 text-sky-300">
              <Building2 size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Cadastrar Congregação
              </h1>
              <p className="text-xs sm:text-sm text-sky-200">
                Configure os dados da igreja, níveis hierárquicos e crie o acesso do Pastor Titular
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              <ShieldCheck size={14} />
              Multi-Igreja Ativo
            </span>
          </div>
        </div>

        {/* Modal / Card de Sucesso */}
        {successResult ? (
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl border border-emerald-200 animate-in fade-in zoom-in-95 duration-200 text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={36} />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-black text-[#052447]">
                Igreja Cadastrada com Sucesso!
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                A congregação <strong className="text-slate-900">{successResult.churchName}</strong>{' '}
                foi registrada e o acesso pastoral foi configurado no maior nível hierárquico.
              </p>
            </div>

            {/* Próximo Passo Obrigatório: Estrutura Organizacional */}
            <div className="max-w-md mx-auto bg-sky-50/90 border border-sky-300 rounded-2xl p-5 text-left space-y-3 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-sky-100 text-sky-900 rounded-xl shrink-0 mt-0.5">
                  <Layers size={20} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-sky-950">
                    Etapa Obrigatória: Cadastrar Níveis Hierárquicos
                  </div>
                  <p className="text-xs text-sky-900 leading-relaxed">
                    Níveis organizacionais configurados para <strong className="text-sky-950">{successResult.churchName}</strong>:
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {levels.map((lvl, idx) => (
                      <React.Fragment key={lvl.order}>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${idx === levels.length - 1 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-white text-slate-800 border border-sky-200 shadow-2xs'}`}>
                          {idx + 1}. {lvl.name}
                        </span>
                        {idx < levels.length - 1 && <span className="text-slate-400 text-xs">➔</span>}
                      </React.Fragment>
                    ))}
                  </div>
                  <p className="text-[11px] text-sky-800 pt-1">
                    Conforme a hierarquia da igreja, as células só poderão ser criadas após cadastrar as unidades dos níveis acima (iniciando obrigatoriamente por <strong>{levels[0]?.name || 'Nível 1'}</strong>).
                  </p>
                </div>
              </div>

              {onNavigateUnits && (
                <button
                  type="button"
                  onClick={() => onNavigateUnits({ churchId: successResult.churchId, churchName: successResult.churchName })}
                  className="w-full py-2.5 px-4 bg-[#052447] hover:bg-[#073366] text-white rounded-xl text-xs font-bold shadow transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Layers size={16} />
                  <span>Cadastrar 1º Nível: {levels[0]?.name || 'Nível 1'}</span>
                </button>
              )}
            </div>

            {/* Credenciais do Pastor Box */}
            <div className="max-w-md mx-auto bg-slate-50 border border-slate-200 rounded-2xl p-5 text-left space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck size={18} className="text-[#052447]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Acesso do Pastor Titular
                  </span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  Nível 6 (Máximo)
                </span>
              </div>

              <div>
                <div className="text-xs text-slate-500 font-medium">Nome do Pastor</div>
                <div className="text-sm font-bold text-[#052447]">{successResult.pastorName}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">Login de Acesso</div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-mono font-bold text-[#052447] truncate">
                      {successResult.pastorLogin}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(successResult.pastorLogin, 'login')}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
                      title="Copiar login"
                    >
                      {copiedLogin ? (
                        <Check size={15} className="text-emerald-600" />
                      ) : (
                        <Copy size={15} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] text-slate-500 font-semibold mb-1">Senha de Acesso</div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-mono font-bold text-[#052447] truncate">
                      {successResult.pastorPassword}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(successResult.pastorPassword, 'password')}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
                      title="Copiar senha"
                    >
                      {copiedPassword ? (
                        <Check size={15} className="text-emerald-600" />
                      ) : (
                        <Copy size={15} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Ações pós-cadastro */}
            <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-2">
              {onNavigateUnits && (
                <button
                  type="button"
                  onClick={() => onNavigateUnits({ churchId: successResult.churchId, churchName: successResult.churchName })}
                  className="w-full sm:w-auto px-6 py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Layers size={16} />
                  <span>Cadastrar Níveis da Igreja (Telas 2+)</span>
                </button>
              )}

              {onNavigateOverview && (
                <button
                  type="button"
                  onClick={() => onNavigateOverview({ churchId: successResult.churchId, churchName: successResult.churchName })}
                  className="w-full sm:w-auto px-5 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Ver Organograma</span>
                </button>
              )}

              {onSuccessLogin && (
                <button
                  type="button"
                  onClick={() => onSuccessLogin(successResult.userProfile)}
                  className="w-full sm:w-auto px-6 py-3 bg-[#052447] hover:bg-[#073366] text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Acessar App como Pastor Desta Igreja</span>
                  <ChevronRight size={16} />
                </button>
              )}

              <button
                type="button"
                onClick={handleResetForAnotherChurch}
                className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus size={16} />
                <span>Cadastrar Outra Igreja</span>
              </button>

              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full sm:w-auto px-5 py-3 text-slate-500 hover:text-slate-800 text-sm font-semibold transition cursor-pointer"
                >
                  Voltar ao Menu
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Formulário de Cadastro */
          <form onSubmit={handleSubmit} className="space-y-6">
            {errorMessage && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl flex items-start gap-3 text-sm font-medium animate-in fade-in">
                <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">{errorMessage}</div>
              </div>
            )}

            {/* Bloco 1: Dados da Congregação / Empresa */}
            <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-200/80 space-y-5">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#052447] flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[#052447]">
                    Dados da Congregação / Empresa
                  </h2>
                  <p className="text-xs text-slate-500">
                    Informações cadastrais e identidade visual da igreja
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {/* Nome da Igreja */}
                <div className="md:col-span-2">
                  <label
                    htmlFor={churchNameId}
                    className="block text-xs font-bold text-[#052447] mb-1.5"
                  >
                    Nome da Igreja <span className="text-red-500">*</span>
                  </label>
                  <input
                    id={churchNameId}
                    type="text"
                    required
                    value={churchName}
                    onChange={(e) => setChurchName(e.target.value)}
                    placeholder="Ex: Paz Church Fortaleza Central"
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                  />
                </div>

                {/* CNPJ */}
                <div>
                  <label
                    htmlFor={cnpjId}
                    className="block text-xs font-bold text-[#052447] mb-1.5"
                  >
                    CNPJ <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    id={cnpjId}
                    type="text"
                    value={cnpj}
                    onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                  />
                </div>

                {/* Cidade e Estado */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label
                      htmlFor={cityId}
                      className="block text-xs font-bold text-[#052447] mb-1.5"
                    >
                      Cidade <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={cityId}
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ex: Sobral"
                      className="w-full bg-[#f8fafc] border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={stateId}
                      className="block text-xs font-bold text-[#052447] mb-1.5"
                    >
                      UF <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={stateId}
                      type="text"
                      required
                      value={stateUf}
                      onChange={(e) => setStateUf(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="CE"
                      maxLength={2}
                      className="w-full bg-[#f8fafc] border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-center font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                    />
                  </div>
                </div>

                {/* Upload do Logotipo */}
                <div className="md:col-span-2">
                  <span className="block text-xs font-bold text-[#052447] mb-1.5">
                    Logotipo da Congregação / Empresa
                  </span>
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-slate-50 transition">
                    <div className="w-16 h-16 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs relative">
                      {logoPreview ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={logoPreview}
                          alt="Prévia do Logotipo"
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <ChurchIcon size={28} className="text-slate-400" />
                      )}
                    </div>

                    <div className="flex-1 text-center sm:text-left space-y-1">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          {logoPreview ? 'Logotipo carregado' : 'Carregue a marca da igreja'}
                        </span>
                        {isOptimizingLogo && (
                          <span className="text-[11px] text-sky-700 font-semibold flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200 animate-pulse">
                            <Loader2 size={12} className="animate-spin text-sky-600" />
                            Otimizando para WebP...
                          </span>
                        )}
                        {logoStats && logoPreview && !isOptimizingLogo && (
                          <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                            <Sparkles size={11} className="text-emerald-600" />
                            WebP Leve: {logoStats.size} ({logoStats.reduction})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Convertido automaticamente para WebP leve mantendo fundo transparente
                      </p>
                      <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                        <label
                          htmlFor="church-logo-file-input"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#052447] text-white rounded-lg text-xs font-semibold hover:bg-[#073366] transition cursor-pointer"
                        >
                          <Upload size={13} />
                          <span>Selecionar Imagem</span>
                        </label>
                        <input
                          id="church-logo-file-input"
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        {logoPreview && (
                          <button
                            type="button"
                            onClick={() => {
                              if (logoUrl) {
                                deleteChurchLogo(logoUrl, pendingChurchId);
                              }
                              setLogoPreview(null);
                              setLogoUrl('');
                              setLogoStats(null);
                            }}
                            className="px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloco 2: Níveis Hierárquicos Personalizáveis */}
            <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-200/80 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#052447] flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#052447]">
                      Níveis Hierárquicos da Igreja
                    </h2>
                    <p className="text-xs text-slate-500">
                      Defina a estrutura hierárquica personalizada desta congregação
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800 bg-sky-50 px-2.5 py-1 rounded-lg">
                  <Layers size={14} className="text-sky-600" />
                  <span>Espaçamento automático (10, 20, 30...)</span>
                </div>
              </div>

              {/* Presets Rápidos */}
              <div>
                <span className="block text-xs font-bold text-slate-600 mb-2">
                  Modelos Rápidos (1 Clique):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  {HIERARCHY_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(preset.levels)}
                      className="text-left p-3 rounded-xl border border-slate-200 hover:border-sky-500 hover:bg-sky-50/50 transition cursor-pointer group"
                    >
                      <div className="text-xs font-bold text-[#052447] group-hover:text-sky-700 transition">
                        {preset.label}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista Editável de Níveis */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-2">
                  <span>Estrutura (Do Maior para o Menor Nível)</span>
                  <span>Ordem no Banco</span>
                </div>

                {levels.map((level, index) => {
                  const isFirst = index === 0;
                  const isLast = index === levels.length - 1;
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-2 sm:gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition"
                    >
                      {/* Indicador de Ordem / Posição */}
                      <div className="w-7 h-7 rounded-lg bg-[#052447] text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {index + 1}
                      </div>

                      {/* Input do Nome do Nível */}
                      <div className="flex-1">
                        <input
                          type="text"
                          required
                          value={level.name}
                          onChange={(e) => handleLevelNameChange(index, e.target.value)}
                          placeholder="Nome do nível (ex: Distrito, Setor, Célula)"
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                        />
                      </div>

                      {/* Badge da Ordem Numérica */}
                      <div className="px-2.5 py-1 rounded-md bg-white border border-slate-300 text-xs font-mono font-bold text-slate-700 shrink-0">
                        ordem {level.order}
                      </div>

                      {/* Botões de Mover Ordem */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveLevel(index, 'up')}
                          disabled={isFirst}
                          className="p-1.5 text-slate-500 hover:text-[#052447] hover:bg-slate-200 rounded-md transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                          title="Subir nível na hierarquia"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveLevel(index, 'down')}
                          disabled={isLast}
                          className="p-1.5 text-slate-500 hover:text-[#052447] hover:bg-slate-200 rounded-md transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                          title="Descer nível na hierarquia"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLevel(index)}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition cursor-pointer"
                          title="Remover este nível"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleAddLevel}
                  className="w-full py-2.5 border border-dashed border-sky-400 bg-sky-50/60 hover:bg-sky-50 text-sky-800 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <Plus size={16} />
                  <span>Adicionar Novo Nível Hierárquico</span>
                </button>
              </div>
            </div>

            {/* Bloco 3: Pastor Titular & Acesso de Maior Nível */}
            <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-sm border border-slate-200/80 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#052447] flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#052447]">
                      Pastor Titular & Acesso Inicial
                    </h2>
                    <p className="text-xs text-slate-500">
                      O Pastor Titular terá acesso ao maior nível da hierarquia desta igreja
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#052447] text-white">
                  <ShieldCheck size={13} className="text-sky-300" />
                  Nível 6 (Pastor Geral)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {/* Nome do Pastor */}
                <div className="md:col-span-2">
                  <label
                    htmlFor={pastorNameId}
                    className="block text-xs font-bold text-[#052447] mb-1.5"
                  >
                    Nome Completo do Pastor <span className="text-red-500">*</span>
                  </label>
                  <input
                    id={pastorNameId}
                    type="text"
                    required
                    value={pastorName}
                    onChange={(e) => handlePastorNameChange(e.target.value)}
                    placeholder="Ex: Pr. Silas Pereira"
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                  />
                </div>

                {/* Telefone / WhatsApp */}
                <div>
                  <label
                    htmlFor={pastorPhoneId}
                    className="block text-xs font-bold text-[#052447] mb-1.5"
                  >
                    Telefone / WhatsApp <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    id={pastorPhoneId}
                    type="text"
                    value={pastorPhone}
                    onChange={(e) => setPastorPhone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label
                    htmlFor={pastorEmailId}
                    className="block text-xs font-bold text-[#052447] mb-1.5"
                  >
                    E-mail <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    id={pastorEmailId}
                    type="email"
                    value={pastorEmail}
                    onChange={(e) => setPastorEmail(e.target.value)}
                    placeholder="pastor@igreja.com.br"
                    className="w-full bg-[#f8fafc] border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                  />
                </div>

                {/* Login de Acesso (Gerado automaticamente e editável) */}
                <div className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor={pastorLoginId}
                      className="block text-xs font-bold text-[#052447]"
                    >
                      Login de Acesso <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const generated = generateSmartLogin(pastorName);
                        setPastorLogin(generated);
                        setIsLoginManuallyEdited(false);
                      }}
                      className="text-[11px] text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="Regerar login a partir do nome"
                    >
                      <Sparkles size={12} />
                      Regerar Automático
                    </button>
                  </div>
                  <input
                    id={pastorLoginId}
                    type="text"
                    required
                    value={pastorLogin}
                    onChange={(e) => {
                      setPastorLogin(e.target.value.toLowerCase().replace(/\s+/g, ''));
                      setIsLoginManuallyEdited(true);
                    }}
                    placeholder="ex: silas.pereira"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono font-bold text-[#052447] placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Gerado automaticamente a partir do nome com até 2 ou 3 palavras. Você pode editar livremente.
                  </p>
                </div>

                {/* Senha de Acesso (Gerada e editável) */}
                <div className="bg-sky-50/60 border border-sky-200/80 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor={pastorPasswordId}
                      className="block text-xs font-bold text-[#052447]"
                    >
                      Senha de Acesso <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateStrongPassword}
                      className="text-[11px] text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1 transition cursor-pointer"
                      title="Gerar senha forte"
                    >
                      <Sparkles size={12} />
                      Gerar Senha Forte
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id={pastorPasswordId}
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={pastorPassword}
                      onChange={(e) => setPastorPassword(e.target.value)}
                      placeholder="Senha do pastor"
                      className="w-full bg-white border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm font-mono font-bold text-[#052447] placeholder:text-slate-400 focus:outline-none focus:border-[#052447] focus:ring-1 focus:ring-[#052447] transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition cursor-pointer p-1"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Padrão inicial &quot;123456&quot;. Mínimo de 6 dígitos. Pode ser personalizada ou alterada posteriormente.
                  </p>
                </div>
              </div>
            </div>

            {/* Botão de Envio */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full sm:w-auto px-5 py-3 text-slate-600 hover:text-slate-900 font-bold text-sm transition cursor-pointer"
                >
                  Cancelar
                </button>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#052447] hover:bg-[#073366] text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
              >
                {isLoading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Cadastrando Congregação...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    <span>Cadastrar Igreja & Criar Acesso do Pastor</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
