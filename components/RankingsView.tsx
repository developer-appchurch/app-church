'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  Loader2,
  Medal,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { UserProfile } from '../types';
import { getBrowserSupabaseClient } from '../lib/supabase/client';

interface RankingsViewProps {
  currentUser: UserProfile;
  onBack?: () => void;
}

type RankingTab = 'mensal' | 'anual';

interface RankingRow {
  posicao: number;
  unidade_id: string;
  celula: string;
  lideres: string[] | null;
  pontos: number;
  semanas_no_prazo: number;
  semanas_esperadas?: number;
  meses_perfeitos?: number;
  mes_perfeito?: boolean;
  mes_encerrado?: boolean;
  minha_celula: boolean;
  total_celulas: number;
  pode_ver_completo: boolean;
  ano_anterior_disponivel: boolean;
  ano?: number;
}

// Primeiro mês em que o Fiel no Pouco vale (a pontuação começa em outubro/2026)
const PRIMEIRO_MES = { ano: 2026, mes: 9 }; // mês 0-based: 9 = outubro

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function primeiroDiaDoMes(ano: number, mes0: number): string {
  return `${ano}-${String(mes0 + 1).padStart(2, '0')}-01`;
}

function posicaoLabel(p: number): string {
  return `${p}º`;
}

const PodiumBadge: React.FC<{ posicao: number }> = ({ posicao }) => {
  if (posicao === 1) {
    return (
      <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
        <Trophy size={17} />
      </div>
    );
  }
  if (posicao === 2 || posicao === 3) {
    return (
      <div
        className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 ${
          posicao === 2
            ? 'bg-slate-100 border-slate-300 text-slate-600'
            : 'bg-orange-100 border-orange-300 text-orange-700'
        }`}
      >
        <Medal size={17} />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200 text-slate-500 font-black text-xs flex items-center justify-center shrink-0">
      {posicaoLabel(posicao)}
    </div>
  );
};

export const RankingsView: React.FC<RankingsViewProps> = ({ currentUser }) => {
  const hoje = useMemo(() => new Date(), []);
  const anoAtual = hoje.getFullYear();
  const mesAtual0 = hoje.getMonth();

  const [tab, setTab] = useState<RankingTab>('mensal');
  const [mesesAtras, setMesesAtras] = useState(0);
  const [ano, setAno] = useState<number>(anoAtual);
  const [completo, setCompleto] = useState(false);

  // Mês/ano selecionado para o ranking mensal (o ranking só mostra o ano vigente)
  const mesSelecionado = useMemo(() => {
    const d = new Date(anoAtual, mesAtual0 - mesesAtras, 1);
    return { ano: d.getFullYear(), mes0: d.getMonth() };
  }, [anoAtual, mesAtual0, mesesAtras]);

  // Limite para voltar no tempo: início do ano vigente ou outubro/2026, o que for mais recente
  const maxMesesAtras = useMemo(() => {
    const inicioAno = Math.max(
      0,
      anoAtual === PRIMEIRO_MES.ano ? PRIMEIRO_MES.mes : 0
    );
    return Math.max(0, mesAtual0 - inicioAno);
  }, [anoAtual, mesAtual0]);

  // Cache de ~5 min por combinação (aba, período, lista completa). Sem refetch automático:
  // os dados só são buscados de novo ao arrastar a tela para baixo (a invalidação da
  // chave ['rankings'] é feita no handleRefresh da página) ou depois que o cache expira.
  const periodoKey =
    tab === 'mensal' ? primeiroDiaDoMes(mesSelecionado.ano, mesSelecionado.mes0) : String(ano);
  const { data, isLoading, isError, error: queryError } = useQuery<RankingRow[]>({
    queryKey: ['rankings', currentUser.churchId, currentUser.id, tab, periodoKey, completo],
    queryFn: async () => {
      const supabase = getBrowserSupabaseClient();
      const { data: rpcData, error: rpcError } =
        tab === 'mensal'
          ? await supabase.rpc('domingo_em_dia_ranking_mensal', {
              p_mes: mesesAtras === 0 ? null : periodoKey,
              p_completo: completo,
            })
          : await supabase.rpc('domingo_em_dia_ranking_anual', {
              p_ano: ano === anoAtual ? null : ano,
              p_completo: completo,
            });
      if (rpcError) throw new Error(rpcError.message);
      return (rpcData || []) as RankingRow[];
    },
    staleTime: Infinity,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const rows: RankingRow[] = data ?? [];
  const error = isError ? (queryError as Error)?.message || 'Não foi possível carregar o ranking.' : '';

  const podeVerCompleto = rows[0]?.pode_ver_completo === true;
  const anoAnteriorDisponivel = rows[0]?.ano_anterior_disponivel === true;
  const totalCelulas = rows[0]?.total_celulas ?? 0;
  const minha = rows.find((r) => r.minha_celula);

  // Se o ano anterior deixou de estar disponível, volta para o ano vigente
  useEffect(() => {
    if (tab === 'anual' && ano !== anoAtual && rows.length > 0 && !anoAnteriorDisponivel) {
      setAno(anoAtual);
    }
  }, [tab, ano, anoAtual, rows, anoAnteriorDisponivel]);

  const tituloPeriodo =
    tab === 'mensal'
      ? `${MESES[mesSelecionado.mes0]} de ${mesSelecionado.ano}`
      : `Ano de ${ano}`;

  const semPontos = rows.length > 0 && rows.every((r) => r.pontos === 0);

  return (
    <div className="min-h-screen bg-slate-50/70 p-2 sm:p-5 lg:p-6 pb-20">
      <div className="max-w-3xl mx-auto mb-3 sm:mb-5">
        <div className="bg-[#04213d] text-white rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-800 flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center text-amber-300 shrink-0">
            <Trophy size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">Conquistas</h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Quem lança o relatório em dia, sobe no ranking.
            </p>
          </div>
        </div>

        <div className="flex gap-1 mt-2 bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
          {([
            { id: 'mensal', label: 'Fiel no Pouco', icon: Flame },
            { id: 'anual', label: 'Guardiões da Constância', icon: Sparkles },
          ] as { id: RankingTab; label: string; icon: React.ElementType }[]).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setCompleto(false);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors ${
                  active ? 'bg-[#04213d] text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Icon size={15} />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-3">
        {/* Seletor de período */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-3 flex items-center justify-between gap-2">
          {tab === 'mensal' ? (
            <>
              <button
                type="button"
                aria-label="Mês anterior"
                disabled={mesesAtras >= maxMesesAtras}
                onClick={() => setMesesAtras((m) => m + 1)}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="text-center">
                <p className="text-sm font-black text-slate-800">{tituloPeriodo}</p>
                <p className="text-[11px] text-slate-400">
                  {mesesAtras === 0 ? 'Mês em andamento' : 'Mês encerrado'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Próximo mês"
                disabled={mesesAtras <= 0}
                onClick={() => setMesesAtras((m) => Math.max(0, m - 1))}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-black text-slate-800">{tituloPeriodo}</p>
              {anoAnteriorDisponivel && (
                <div className="inline-flex p-0.5 bg-slate-100 rounded-xl">
                  {[anoAtual - 1, anoAtual].map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAno(a)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                        ano === a ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sua classificação */}
        {!isLoading && !error && minha && (
          <div className="rounded-xl sm:rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-white shadow-xs p-4">
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-700 mb-1">
              Sua classificação
            </p>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-black text-[#04213d] leading-none">
                {posicaoLabel(minha.posicao)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-800 truncate">{minha.celula}</p>
                <p className="text-xs text-slate-500">
                  {minha.pontos} {minha.pontos === 1 ? 'ponto' : 'pontos'}
                  {totalCelulas > 0 ? ` · de ${totalCelulas} células` : ''}
                </p>
              </div>
              {tab === 'mensal' && minha.mes_perfeito && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black text-orange-700 bg-orange-100 border border-orange-200 rounded-full px-2 py-1">
                  <Flame size={12} /> Líder em Chamas
                </span>
              )}
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">
              {completo ? 'Lista completa' : 'Top 7'}
            </p>
            {!isLoading && totalCelulas > 0 && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <Users size={12} /> {totalCelulas} células
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="p-10 flex items-center justify-center text-slate-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-rose-600 font-semibold text-center">{error}</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Nenhuma célula para exibir neste período.
            </div>
          ) : (
            <>
              {semPontos && (
                <div className="px-4 py-3 text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                  Ainda ninguém pontuou neste período. Lance o relatório da semana até domingo para
                  entrar no ranking.
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {rows.map((r, idx) => {
                  // Separador visual antes da linha da própria célula quando ela está fora do Top
                  const anterior = rows[idx - 1];
                  const separador = r.minha_celula && anterior && r.posicao - anterior.posicao > 1 && !completo;
                  return (
                    <React.Fragment key={r.unidade_id}>
                      {separador && (
                        <li aria-hidden className="px-4 py-1 text-center text-slate-300 text-xs tracking-[0.4em]">
                          •••
                        </li>
                      )}
                      <li
                        className={`px-4 py-3 flex items-center gap-3 ${
                          r.minha_celula ? 'bg-amber-50/70' : ''
                        }`}
                      >
                        <PodiumBadge posicao={r.posicao} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-800 truncate">
                            {r.celula}
                            {r.minha_celula && (
                              <span className="ml-2 text-[10px] font-black text-amber-700 uppercase">
                                Você
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {(r.lideres || []).length > 0 ? (r.lideres || []).join(' & ') : 'Sem líder vinculado'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-black text-[#04213d] leading-none">{r.pontos}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {tab === 'mensal'
                              ? r.semanas_esperadas
                                ? `${r.semanas_no_prazo}/${r.semanas_esperadas} sem.`
                                : 'pts'
                              : `${r.meses_perfeitos ?? 0} 🔥`}
                          </p>
                        </div>
                      </li>
                    </React.Fragment>
                  );
                })}
              </ul>
            </>
          )}

          {!isLoading && !error && podeVerCompleto && (
            <div className="p-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCompleto((c) => !c)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Shield size={15} />
                {completo ? 'Mostrar só o Top 7' : 'Ver lista completa'}
              </button>
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 text-center px-4">
          O relatório precisa ser lançado até domingo, 23:59, para pontuar. Semanas sem reunião também
          contam, desde que o relatório seja lançado no prazo.
        </p>
      </div>
    </div>
  );
};
