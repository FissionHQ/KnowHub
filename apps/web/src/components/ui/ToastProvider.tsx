"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  visible: boolean;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;
const SLIDE_OUT_MS = 300;

const variantStyles: Record<ToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  error: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  info: "border-border bg-card text-card-foreground",
};

const variantIcons: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, visible: false } : t));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, SLIDE_OUT_MS);
  }

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant, visible: true }]);
    window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none max-w-sm w-full"
            aria-live="polite"
            aria-relevant="additions"
          >
            {toasts.map((item) => {
              const Icon = variantIcons[item.variant];
              return (
                <div
                  key={item.id}
                  role="status"
                  style={{
                    transition: `transform ${SLIDE_OUT_MS}ms ease, opacity ${SLIDE_OUT_MS}ms ease`,
                    transform: item.visible ? "translateX(0)" : "translateX(110%)",
                    opacity: item.visible ? 1 : 0,
                  }}
                  className={clsx(
                    "flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg pointer-events-auto",
                    variantStyles[item.variant],
                  )}
                >
                  <Icon size={16} className="shrink-0 mt-0.5" />
                  <span className="flex-1">{item.message}</span>
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
