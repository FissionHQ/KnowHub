import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

/** Match Fission DS: Inter via next/font on <body> only (no antialiased). */
const inter = Inter({
  subsets: ["latin"],
});

/** Force light theme — clear any leftover dark-mode preference. */
const lightThemeInitScript = `(function(){try{document.documentElement.classList.remove("dark");localStorage.removeItem("knowhub-theme");}catch(e){}})();`;

export const metadata: Metadata = {
  title: "KnowHub",
  description: "Organizational knowledge base",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="fission" className="light">
      <head>
        <script dangerouslySetInnerHTML={{ __html: lightThemeInitScript }} />
      </head>
      <body className={`${inter.className} min-h-screen bg-background text-foreground`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
