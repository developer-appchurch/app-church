'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  isRefreshing: boolean;
  children: React.ReactNode;
}

const PULL_THRESHOLD = 68; // Distância mínima em pixels para acionar
const MAX_PULL = 110; // Limite máximo de puxada com resistência elástica

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  isRefreshing,
  children,
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef(0);
  const isEligibleRef = useRef(false);
  const isRefreshingRef = useRef(isRefreshing);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
    if (!isRefreshing) {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [isRefreshing]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Só inicia se o usuário estiver no topo absoluto da página e não estiver atualizando
    if (isRefreshingRef.current) return;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollY <= 0) {
      startYRef.current = e.touches[0].clientY;
      isEligibleRef.current = true;
    } else {
      isEligibleRef.current = false;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isEligibleRef.current || isRefreshingRef.current) return;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollY > 0) {
      isEligibleRef.current = false;
      setPullDistance(0);
      setIsPulling(false);
      return;
    }

    const currentY = e.touches[0].clientY;
    const rawDiff = currentY - startYRef.current;

    if (rawDiff > 0) {
      // Aplica resistência elástica logarítmica
      const dampedDistance = Math.min(MAX_PULL, rawDiff * 0.45);
      setPullDistance(dampedDistance);
      setIsPulling(true);
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!isEligibleRef.current || isRefreshingRef.current) {
      setPullDistance(0);
      setIsPulling(false);
      return;
    }

    isEligibleRef.current = false;

    if (pullDistance >= PULL_THRESHOLD) {
      // Feedback tátil sutil se suportado pelo aparelho
      if (typeof window !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(12);
        } catch {
          // ignore
        }
      }
      setPullDistance(48); // Mantém o indicador visível durante o refresh
      setIsPulling(false);
      try {
        await onRefresh();
      } finally {
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  }, [pullDistance, onRefresh]);

  useEffect(() => {
    // Registra listeners passivos na janela para máxima fluidez a 60 FPS
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const showIndicator = isRefreshing || pullDistance > 8;
  const progressRatio = Math.min(1, pullDistance / PULL_THRESHOLD);
  const isReadyToRelease = pullDistance >= PULL_THRESHOLD;

  return (
    <div className="relative w-full">
      {/* Indicador Flutuante Estilo Instagram / iOS no Mobile */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 z-40 md:hidden pointer-events-none transition-transform ${
          isPulling ? 'duration-75' : 'duration-300 ease-out'
        }`}
        style={{
          top: `${Math.max(12, pullDistance - 36)}px`,
          opacity: showIndicator ? 1 : 0,
          transform: `translateX(-50%) scale(${Math.max(0.6, Math.min(1.05, 0.6 + progressRatio * 0.45))})`,
        }}
      >
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-full shadow-md border backdrop-blur-xs transition-colors ${
            isReadyToRelease || isRefreshing
              ? 'bg-[#052447] text-white border-sky-400/30'
              : 'bg-white text-slate-700 border-slate-200/90'
          }`}
        >
          {isRefreshing ? (
            <Loader2 size={20} className="animate-spin text-sky-400" />
          ) : (
            <div
              className="transition-transform duration-150"
              style={{
                transform: `rotate(${progressRatio * 180}deg)`,
              }}
            >
              <ArrowDown size={18} className={isReadyToRelease ? 'text-sky-300' : 'text-slate-500'} />
            </div>
          )}
        </div>
      </div>

      {children}
    </div>
  );
};
