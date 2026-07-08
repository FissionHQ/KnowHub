"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
