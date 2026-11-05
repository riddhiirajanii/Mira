import './globals.css';

export const metadata = {
  title: 'Mira',
  description: 'AI-powered talking assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
