import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Söyle — играем, общаемся, растём",
  description: "Цифровой помощник для развития речи и коммуникации ребёнка",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
