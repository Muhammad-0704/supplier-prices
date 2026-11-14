import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/inter';
import './shell-utilities.css';
import './globals.css';
import './workspace.css';

export const metadata: Metadata = {
  title: { default: 'База', template: '%s · База' },
  description: 'Экосистема склада: Прайс-доска и Центр Питания',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fafafa',
};

/** Светлая тема по умолчанию; тёмная, если человек выбрал её переключателем. Ставится до отрисовки, без мигания. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('pb_theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = headers().get('x-nonce') ?? undefined;
  return (
    <html lang="ru" data-theme="light" suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
