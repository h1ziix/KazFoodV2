import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KazFood — Генератор аттестации",
  description: "Локальный генератор DOCX по аттестации рабочих мест",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
