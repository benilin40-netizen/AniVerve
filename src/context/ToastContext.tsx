import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 md:bottom-6 md:right-6 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="av-toast-enter pointer-events-auto flex items-start gap-3 rounded-xl border border-zinc-200 bg-white/95 p-3.5 text-sm text-zinc-900 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-[#16171F]/95 dark:text-zinc-100"
          >
            {toast.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />}
            {toast.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-rose-500 mt-0.5" />}
            {toast.type === 'info' && <Info className="h-4 w-4 shrink-0 text-[#9B87FF] mt-0.5" />}
            <p className="flex-1 leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="av-btn-press rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
