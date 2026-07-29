"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
