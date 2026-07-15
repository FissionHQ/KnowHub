import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { themeInitScript } from "@/lib/theme";
import "@/styles/heroui.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "FissionDocs",
  description: "Organizational knowledge base",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.className}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-zinc-50 text-foreground antialiased dark:bg-zinc-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
