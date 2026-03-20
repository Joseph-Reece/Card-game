import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kenyan Local Poker',
  description: 'Real-time multiplayer card game',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app">{children}</body>
    </html>
  );
}

