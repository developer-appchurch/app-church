'use client';

import React, { useState, useEffect } from 'react';
import { AppChurchService, DatabaseConnectionStatus } from '../lib/supabase';

interface ConnectionBadgeProps {
  className?: string;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ className = '' }) => {
  const [status, setStatus] = useState<DatabaseConnectionStatus>({
    connected: false,
    isCloud: true,
    message: '',
    endpoint: 'supabase.co',
    lastChecked: '',
  });

  useEffect(() => {
    let isMounted = true;

    const initialFetch = async (force = false) => {
      try {
        const res = await AppChurchService.checkConnection(force);
        if (isMounted) setStatus(res);
      } catch {
        if (isMounted) {
          setStatus({
            connected: false,
            isCloud: false,
            message: '',
            endpoint: 'supabase.co',
            lastChecked: '',
          });
        }
      }
    };

    // Consulta inicial única (utiliza cache em memória se já consultado)
    initialFetch();

    const handleOnline = () => {
      initialFetch(true);
    };

    const handleOffline = () => {
      if (isMounted) {
        setStatus((prev) => ({
          ...prev,
          connected: false,
        }));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const tooltipText = status.connected ? 'Conectado' : 'Sem conexão';

  return (
    <div
      id="db-connection-indicator"
      className={`fixed bottom-3.5 right-3.5 z-50 select-none group flex items-center justify-center p-1.5 cursor-default ${className}`}
      title={tooltipText}
      aria-label={tooltipText}
    >
      {/* Tooltip on hover */}
      <div
        className="pointer-events-none absolute right-full mr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center px-2 py-1 bg-slate-900/90 text-white text-[11px] font-medium rounded-md shadow-md whitespace-nowrap border border-slate-700/60"
        role="tooltip"
      >
        {tooltipText}
      </div>

      {/* Signal Dot */}
      <span className="relative flex h-2.5 w-2.5">
        {status.connected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={`relative inline-flex rounded-full h-2.5 w-2.5 transition-colors duration-300 ${
            status.connected
              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
              : 'bg-red-500 shadow-sm shadow-red-500/50'
          }`}
        />
      </span>
    </div>
  );
};
