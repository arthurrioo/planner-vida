import type { Metadata } from "next";
import type React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planner Vida",
  description: "Planner Vida Phase 1 foundation",
  applicationName: "Planner Vida",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
