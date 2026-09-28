'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 3, // 3 minutos stale-while-revalidate
            gcTime: 1000 * 60 * 15, // 15 minutos em memória
            refetchOnWindowFocus: false, // Não refaz queries ao alternar abas
            refetchOnReconnect: false, // Evita rajadas de queries desnecessárias ao acordar tela ou trocar 4G/Wi-Fi
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
