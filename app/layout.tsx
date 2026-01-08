import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Companions Watch',
  description:
    'Real-time intelligence stream for the AI companions ecosystem. Track product updates, safety news, regulatory changes, and cultural trends.',
  keywords: [
    'AI companions',
    'virtual companions',
    'Replika',
    'Character.AI',
    'AI news',
    'AI regulation',
  ],
  openGraph: {
    title: 'AI Companions Watch',
    description:
      'Understand what is happening in AI companions today. A Techmeme-style intelligence stream.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Companions Watch',
    description:
      'Real-time intelligence stream for the AI companions ecosystem.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <header className="tm-header">
          <div className="tm-header-inner">
            <a href="/" className="tm-logo">
              AI Companions Watch
            </a>
            <span className="tm-tagline">
              The AI companion ecosystem, one page
            </span>
          </div>
        </header>

        <main className="tm-container">{children}</main>

        <footer className="tm-footer">
          <p>
            AI Companions Watch aggregates news from public sources.
            <br />
            Not affiliated with any AI companion platform.
          </p>
        </footer>
      </body>
    </html>
  );
}
