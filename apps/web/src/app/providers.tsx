"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { A2uiChat } from "@/components/A2uiChat";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <ToastProvider>
        <AuthProvider>
          {children}
          <A2uiChat />
        </AuthProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
