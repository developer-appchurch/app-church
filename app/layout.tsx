import type {Metadata, Viewport} from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AppQueryProvider } from '@/components/AppQueryProvider';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'AppChurch - Gestão de Igrejas em Célula',
  description: 'Aplicativo para gestão de igrejas em Célula, com feed de notícias, controle de membros, relatórios, frequência e acompanhamento de toda a trajetória de Membro a liderança.',
  manifest: "/site.webmanifest",
  openGraph: {
    title: 'AppChurch - Gestão de Igrejas em Célula',
    description: 'Aplicativo para gestão de igrejas em Célula, com feed de notícias, controle de membros, relatórios, frequência e acompanhamento de toda a trajetória de Membro a liderança.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AppChurch - Gestão de Igrejas em Célula',
    description: 'Aplicativo para gestão de igrejas em Célula, com feed de notícias, controle de membros, relatórios, frequência e acompanhamento de toda a trajetória de Membro a liderança.',
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
      <body className="overscroll-y-contain antialiased" suppressHydrationWarning>
        <AppQueryProvider>
          {children}
        </AppQueryProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
