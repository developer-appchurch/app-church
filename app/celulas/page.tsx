import React from 'react';
import type { Metadata } from 'next';
import { NossasCelulasView } from '@/components/NossasCelulasView';

export const metadata: Metadata = {
  title: 'Nossas Células - AppChurch',
  description: 'Galeria e busca de todas as células ativas da congregação no AppChurch.',
};

export default function CelulasPage() {
  return (
    <main className="min-h-screen bg-[#e9eff6]">
      <NossasCelulasView />
    </main>
  );
}
