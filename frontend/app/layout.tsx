import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Söyle — играем, общаемся, растём",
  description: "Поддерживаемая коммуникация, игровые задания и короткие планы с Söyle AI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
