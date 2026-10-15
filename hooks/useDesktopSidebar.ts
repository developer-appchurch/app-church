'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Menu lateral fixo no desktop.
 *
 * "Desktop" = largura de pelo menos 1280 px E mouse/trackpad como entrada principal. Celular e
 * tablet (toque) continuam com a gaveta que abre e fecha. No desktop o menu fica fixo por padrão;
 * quem recolhe fica com a escolha lembrada neste navegador.
 */

const DESKTOP_QUERY = '(min-width: 1280px) and (pointer: fine)';
const STORAGE_KEY = 'appchurch_sidebar_collapsed';

export function useDesktopSidebar() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    try {
      setCollapsedState(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // armazenamento indisponível: segue com o menu fixo
    }
    return () => mq.removeEventListener('change', update);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignora
    }
  }, []);

  return { isDesktop, collapsed, setCollapsed, pinned: isDesktop && !collapsed };
}
