"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

type ToastType = "error" | "success" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showError: (userMessage: string, error?: unknown) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  showError: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const showError = useCallback((userMessage: string, error?: unknown) => {
    // Full details to console
    if (error) {
      console.error(`[Vault Error] ${userMessage}`, error);
    } else {
      console.error(`[Vault Error] ${userMessage}`);
    }
    // Friendly message to toast
    showToast(userMessage, "error", 5000);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showError }}>
      {children}

      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm animate-slide-in-right ${
                toast.type === "error"
                  ? "bg-[#2a1a1a] border-[#4a2020] text-[#f87171]"
                  : toast.type === "warning"
                  ? "bg-[#2a2415] border-[#4a3d20] text-[#fbbf24]"
                  : toast.type === "success"
                  ? "bg-[#1a2a1a] border-[#204a20] text-[#4ade80]"
                  : "bg-[#1a1a2a] border-[#20204a] text-[#7eb8f7]"
              }`}
            >
              <span className="flex-1 leading-snug">{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
