'use client';

import React, { useState, useEffect } from 'react';
import { UserProfile, CellGroup } from '@/types';
import {
  Bell,
  BellRing,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Smartphone,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface AdminNotificationTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  currentCell?: CellGroup;
}

export const AdminNotificationTestModal: React.FC<AdminNotificationTestModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  currentCell,
}) => {
  const [targetType, setTargetType] = useState<'cell' | 'me' | 'all'>('cell');
  const [selectedCellName, setSelectedCellName] = useState<string>('Adoneiros');
  const [notificationType, setNotificationType] = useState<'relatorio_pendente' | 'aviso_geral' | 'teste_conexao'>('relatorio_pendente');
  const [customTitle, setCustomTitle] = useState<string>('🔔 Relatório pendente');
  const [customMessage, setCustomMessage] = useState<string>(
    'O relatório da célula Adoneiros referente à semana passada ainda não foi lançado. Clique para lançar agora!'
  );
  const [isSending, setIsSending] = useState<boolean>(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const applyTemplate = (type: 'relatorio_pendente' | 'aviso_geral' | 'teste_conexao', cellName: string) => {
    setNotificationType(type);
    if (type === 'relatorio_pendente') {
      setCustomTitle('🔔 Relatório pendente');
      setCustomMessage(
        `O relatório da célula ${cellName} referente à semana passada ainda não foi lançado. Clique para lançar agora!`
      );
    } else if (type === 'aviso_geral') {
      setCustomTitle('📢 Comunicado da Congregação');
      setCustomMessage('Uma nova publicação importante foi compartilhada no Feed da Igreja. Venha conferir!');
    } else if (type === 'teste_conexao') {
      setCustomTitle('⚡ Teste Push AppChurch');
      setCustomMessage(`Notificação de teste recebida com sucesso no seu dispositivo às ${new Date().toLocaleTimeString('pt-BR')}!`);
    }
  };

  const handleCellChange = (cellName: string) => {
    setSelectedCellName(cellName);
    if (notificationType === 'relatorio_pendente') {
      setCustomMessage(
        `O relatório da célula ${cellName} referente à semana passada ainda não foi lançado. Clique para lançar agora!`
      );
    }
  };

  if (!isOpen) return null;

  const handleSendTest = async () => {
    setIsSending(true);
    setResult(null);

    try {
      const payload: any = {
        title: customTitle.trim(),
        message: customMessage.trim(),
        type: notificationType,
      };

      if (targetType === 'me') {
        payload.targetUserId = currentUser.id;
      } else if (targetType === 'cell') {
        payload.cellName = selectedCellName;
        if (currentCell?.name.toLowerCase() === selectedCellName.toLowerCase()) {
          payload.cellId = currentCell.id;
        }
      }

      const res = await fetch('/api/notifications/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Erro ${res.status} ao disparar notificação`);
      }

      if (data.warning) {
        setResult({
          success: false,
          message: data.warning,
          details: data,
        });
      } else {
        setResult({
          success: true,
          message: `Disparo concluído! ${data.devicesNotified || 0} dispositivo(s) notificado(s) com sucesso.`,
          details: data,
        });
      }
    } catch (err: any) {
      console.error('Erro no envio do teste de push:', err);
      setResult({
        success: false,
        message: err.message || 'Falha na requisição de teste de notificação.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-test-modal-title"
      >
        {/* Header com Estilo Administrativo */}
        <div className="bg-gradient-to-r from-[#052447] via-[#073366] to-[#041a33] text-white p-5 sm:p-6 relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shadow-inner">
                <BellRing size={20} className="animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-extrabold uppercase tracking-wider rounded-md">
                    Exclusivo Administrador
                  </span>
                </div>
                <h2 id="admin-test-modal-title" className="text-lg sm:text-xl font-black text-white mt-0.5">
                  Testar Notificações Push
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition cursor-pointer"
              aria-label="Fechar modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corpo do Modal com Opções de Teste */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-slate-800 text-xs sm:text-sm">
          {/* 1. Seleção do Destinatário */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Destino do Disparo de Teste
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTargetType('cell')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                  targetType === 'cell'
                    ? 'bg-sky-50 border-sky-500 text-sky-950 font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-xs">
                  <Layers size={14} className={targetType === 'cell' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>Por Célula</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Líderes da Célula</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetType('me')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                  targetType === 'me'
                    ? 'bg-sky-50 border-sky-500 text-sky-950 font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-xs">
                  <Smartphone size={14} className={targetType === 'me' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>Meu Dispositivo</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Admin Conectado</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetType('all')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                  targetType === 'all'
                    ? 'bg-sky-50 border-sky-500 text-sky-950 font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-xs">
                  <Sparkles size={14} className={targetType === 'all' ? 'text-sky-600' : 'text-slate-400'} />
                  <span>Todos Ativos</span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">Dispositivos salvos</span>
              </button>
            </div>
          </div>

          {/* Seleção da Célula (se destino for célula) */}
          {targetType === 'cell' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Célula Alvo
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedCellName}
                  onChange={(e) => handleCellChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none transition"
                >
                  <option value="Adoneiros">Adoneiros (Líderes vinculados)</option>
                  <option value="CAMERAS FEITAS">CAMERAS FEITAS</option>
                  <option value="Nova Jerusalem">Nova Jerusalem</option>
                  <option value="Joquebede">Joquebede</option>
                  <option value="Felipenses">Felipenses</option>
                  <option value="Efesios 6">Efesios 6</option>
                  <option value="Geração João Batista">Geração João Batista</option>
                </select>
              </div>
            </div>
          )}

          {/* 2. Seleção do Tipo de Notificação */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              2. Modelo de Notificação
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyTemplate('relatorio_pendente', selectedCellName)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  notificationType === 'relatorio_pendente'
                    ? 'bg-[#052447] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                🔔 Relatório Pendente
              </button>
              <button
                type="button"
                onClick={() => applyTemplate('aviso_geral', selectedCellName)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  notificationType === 'aviso_geral'
                    ? 'bg-[#052447] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                📢 Comunicado do Feed
              </button>
              <button
                type="button"
                onClick={() => applyTemplate('teste_conexao', selectedCellName)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  notificationType === 'teste_conexao'
                    ? 'bg-[#052447] text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                ⚡ Teste de Conexão
              </button>
            </div>
          </div>

          {/* 3. Título & Mensagem */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Título da Notificação
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold text-slate-800 focus:bg-white focus:border-sky-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Corpo da Mensagem (Payload Push)
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-sky-500 outline-none transition"
              />
            </div>
          </div>

          {/* Resultado / Logs do Envio */}
          {result && (
            <div
              className={`p-4 rounded-2xl border text-xs animate-in fade-in duration-200 ${
                result.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {result.success ? (
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-bold">{result.message}</p>
                  {result.details && (
                    <p className="text-[11px] opacity-80 mt-1">
                      Destino: {result.details.target || result.details.cell || 'Dispositivos'} • Notificados: {result.details.devicesNotified ?? 0}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Botões de Ação */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            Fechar
          </button>

          <button
            type="button"
            onClick={handleSendTest}
            disabled={isSending}
            className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-[#052447] hover:from-sky-500 hover:to-[#073366] text-white text-xs sm:text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Disparando Notificação...</span>
              </>
            ) : (
              <>
                <Send size={15} />
                <span>Disparar Notificação de Teste</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
