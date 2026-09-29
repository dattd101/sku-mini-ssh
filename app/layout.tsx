import type { Metadata } from 'next';
import '@xterm/xterm/css/xterm.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mini SSH Web',
  description: 'Browser SSH terminal and SFTP client powered by Next.js 15'
};

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="vi"><body>{children}</body></html>;
}
