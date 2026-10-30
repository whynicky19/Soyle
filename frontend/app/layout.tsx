import type { Metadata } from "next";
import "./globals.css";
import "./product.css";
import "./branding.css";
import "./child-room.css";
import "./exploration.css";
import "./child-system.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3006")),
  title: "Söyle - общение и практика",
  description: "Поддерживаемая коммуникация, игровые задания и локальные адаптивные планы Söyle",
  manifest: "/manifest.webmanifest",
  applicationName: "Söyle",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
