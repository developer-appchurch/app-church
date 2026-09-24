import type {Metadata, Viewport} from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AppQueryProvider } from '@/components/AppQueryProvider';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'AppChurch - Gestão de Igrejas e Células',
  description: 'Plataforma multi-igreja para gestão de células e lifegroups, feed de notícias, avisos gerais, controle de membros, frequência e trilho de liderança integrado ao Supabase.',
  openGraph: {
    title: 'AppChurch - Gestão de Igrejas e Células',
    description: 'Plataforma multi-igreja para gestão de células e lifegroups, feed de notícias, avisos gerais, controle de membros, frequência e trilho de liderança integrado ao Supabase.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AppChurch - Gestão de Igrejas e Células',
    description: 'Plataforma multi-igreja para gestão de células e lifegroups, feed de notícias, avisos gerais, controle de membros, frequência e trilho de liderança integrado ao Supabase.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning>
        <AppQueryProvider>
          {children}
        </AppQueryProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
