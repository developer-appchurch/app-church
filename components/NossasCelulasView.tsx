'use client';

import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { CelulaCardItem, UserProfile } from '@/types';
import { getCelulasByIgreja } from '@/lib/celulasService';
import { CelulaCard } from './CelulaCard';
import { CelulaSearchInput } from './CelulaSearchInput';
import {
  Compass,
  AlertCircle,
  RotateCcw,
  Users,
  Search,
  Sparkles,
  ChevronDown,
  Loader2,
  Building,
  Info,
  Layers,
} from 'lucide-react';

interface NossasCelulasViewProps {
  currentUser?: UserProfile | null;
  churchName?: string;
  initialCelulas?: CelulaCardItem[];
  initialTotal?: number;
  onSelectCell?: (cellId: string) => void;
}

const PAGE_SIZE = 12;

export const NossasCelulasView: React.FC<NossasCelulasViewProps> = ({
  currentUser,
  churchName,
  initialCelulas,
  initialTotal,
  onSelectCell,
}) => {
  const churchId = currentUser?.churchId || 'church-sobral';
  const displayChurchName = churchName || currentUser?.churchName || 'Nossa Igreja';

  const [celulas, setCelulas] = useState<CelulaCardItem[]>(initialCelulas || []);
  const [totalCount, setTotalCount] = useState<number>(initialTotal || 0);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDia, setSelectedDia] = useState<string>('todos');

  const [isLoading, setIsLoading] = useState<boolean>(!initialCelulas || initialCelulas.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Função principal de carregamento com isolamento e paginação
  const loadCelulas = useCallback(
    async (isFirstPage: boolean, searchVal: string, diaVal: string, targetPage: number) => {
      if (!churchId) return;

      if (isFirstPage) {
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const result = await getCelulasByIgreja({
          churchId,
          search: searchVal,
          diaSemana: diaVal,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });

        if (isFirstPage) {
          setCelulas(result.celulas);
        } else {
          setCelulas((prev) => [...prev, ...result.celulas]);
        }

        setTotalCount(result.total);
        setPage(result.page);
        setHasMore(result.hasMore);
        setError(null);
      } catch (err: any) {
        console.error('Erro ao carregar células:', err);
        setError(err?.message || 'Não foi possível carregar as células da igreja.');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [churchId]
  );

  // Re-executa a busca sempre que os filtros mudam
  useEffect(() => {
    let active = true;
    async function fetchData() {
      if (!churchId) return;
      setIsLoading(true);
      setError(null);
      try {
        const result = await getCelulasByIgreja({
          churchId,
          search: searchTerm,
          diaSemana: selectedDia,
          page: 1,
          pageSize: PAGE_SIZE,
        });
        if (active) {
          setCelulas(result.celulas);
          setTotalCount(result.total);
          setPage(result.page);
          setHasMore(result.hasMore);
          setError(null);
        }
      } catch (err: any) {
        if (active) {
          console.error('Erro ao carregar células:', err);
          setError(err?.message || 'Não foi possível carregar as células da igreja.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      active = false;
    };
  }, [churchId, searchTerm, selectedDia]);

  const handleLoadMore = () => {
    if (hasMore && !isLoadingMore) {
      loadCelulas(false, searchTerm, selectedDia, page + 1);
    }
  };

  const handleRetry = () => {
    loadCelulas(true, searchTerm, selectedDia, 1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedDia('todos');
  };

  return (
    <div id="screen-nossas-celulas" className="bg-[#e9eff6] min-h-screen pb-20 font-sans w-full overflow-x-hidden">
      {/* Top Banner & Header */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 pb-2 w-full">
        {/* Banner de Boas-Vindas */}
        <div className="bg-gradient-to-br from-[#052447] via-[#073366] to-[#041a33] text-white p-5 sm:p-7 rounded-2xl sm:rounded-3xl shadow-md relative overflow-hidden mb-4">
          {/* Elementos decorativos */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-sky-200 text-xs font-semibold mb-2 border border-white/10">
                <Compass size={14} className="text-sky-300" />
                <span>Comunhão & Discipulado</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
                Nossas Células
              </h1>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl">
                Explore e conheça todas as células ativas da congregação{' '}
                <strong className="text-white font-semibold">{displayChurchName}</strong>.
              </p>
            </div>

            {/* Quick stats badge */}
            <div className="flex items-center gap-3 self-start md:self-auto shrink-0 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10">
              <div className="p-2 bg-sky-500/20 text-sky-300 rounded-lg">
                <Layers size={22} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                  Total Cadastrado
                </span>
                <span className="text-xl sm:text-2xl font-black text-white">
                  {totalCount} <span className="text-xs font-normal text-slate-300">células</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Input de Busca com Debounce & Filtro de Dia */}
        <div className="mb-5">
          <CelulaSearchInput
            onSearchChange={setSearchTerm}
            onDiaSemanaChange={setSelectedDia}
            selectedDiaSemana={selectedDia}
            totalCount={totalCount}
            isPending={isPending || isLoading}
          />
        </div>

        {/* ========================================================================= */}
        {/* ESTADOS DA LISTA */}
        {/* ========================================================================= */}

        {/* 1. ESTADO DE ERRO COM RETRY */}
        {error && !isLoading && (
          <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl text-center my-6 space-y-3">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="font-bold text-base text-rose-900">Erro ao carregar células</h3>
              <p className="text-xs sm:text-sm text-rose-700 mt-1 max-w-md mx-auto">{error}</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
            >
              <RotateCcw size={14} />
              <span>Tentar Novamente</span>
            </button>
          </div>
        )}

        {/* 2. ESTADO DE CARREGAMENTO INICIAL (SKELETON CARDS) */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col shadow-2xs"
              >
                <div className="w-full aspect-[16/10] bg-slate-200" />
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="h-5 bg-slate-200 rounded-md w-3/4" />
                    <div className="h-3.5 bg-slate-100 rounded-md w-1/2" />
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                    <div className="w-6 h-6 bg-slate-200 rounded-md" />
                    <div className="h-3 bg-slate-200 rounded-md w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. ESTADO LISTA VAZIA (Igreja sem nenhuma célula) */}
        {!isLoading && !error && celulas.length === 0 && !searchTerm && selectedDia === 'todos' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center my-6 space-y-4 shadow-2xs">
            <div className="w-16 h-16 bg-sky-50 text-sky-700 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
              <Building size={32} />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-bold text-[#04213d]">Nenhuma célula cadastrada</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                A congregação <strong className="text-slate-800">{displayChurchName}</strong> ainda não possui células
                registradas na estrutura hierárquica.
              </p>
            </div>
          </div>
        )}

        {/* 4. ESTADO NENHUM RESULTADO PARA O FILTRO */}
        {!isLoading && !error && celulas.length === 0 && (searchTerm || selectedDia !== 'todos') && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-12 text-center my-6 space-y-4 shadow-2xs">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
              <Search size={30} />
            </div>
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-bold text-[#04213d]">Nenhum resultado encontrado</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Não encontramos nenhuma célula correspondente a{' '}
                {searchTerm && <span className="font-semibold text-slate-800">&ldquo;{searchTerm}&rdquo;</span>}
                {selectedDia !== 'todos' && (
                  <span>
                    {' '}no dia <span className="font-semibold text-slate-800">{selectedDia}</span>
                  </span>
                )}
                .
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#052447] hover:bg-[#073366] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
            >
              <RotateCcw size={13} />
              <span>Limpar Filtros de Busca</span>
            </button>
          </div>
        )}

        {/* 5. GALERIA DE CARDS (RESULTADOS ENCONTRADOS) */}
        {!isLoading && !error && celulas.length > 0 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {celulas.map((c) => (
                <CelulaCard
                  key={c.id}
                  celula={c}
                  onSelect={(item) => {
                    if (onSelectCell) {
                      onSelectCell(item.id);
                    }
                  }}
                />
              ))}
            </div>

            {/* Paginação / Carregar Mais */}
            <div className="flex flex-col items-center justify-center pt-4 pb-8 space-y-2">
              <div className="text-xs font-semibold text-slate-500">
                Exibindo <span className="font-bold text-[#052447]">{celulas.length}</span> de{' '}
                <span className="font-bold text-[#052447]">{totalCount}</span> células
              </div>

              {hasMore && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-6 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 text-[#052447] text-xs font-bold rounded-xl shadow-2xs hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 size={16} className="animate-spin text-sky-600" />
                      <span>Carregando mais células...</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={16} className="text-sky-600" />
                      <span>Carregar Mais Células</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
