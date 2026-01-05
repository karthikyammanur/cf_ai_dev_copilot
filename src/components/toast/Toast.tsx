/**
 * Toast Notification Component
 *
 * Provides success, error, and info toast notifications with animations.
 * Auto-dismisses after a configurable duration.
 *
 * @module components/toast
 */

import {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext
} from "react";
import {
  CheckCircleIcon,
  WarningCircleIcon,
  InfoIcon,
  XIcon
} from "@phosphor-icons/react";

// =============================================================================
// Types
// =============================================================================

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (type: ToastType, message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

// =============================================================================
// Context
// =============================================================================

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Hook to access toast notifications
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// =============================================================================
// Provider Component
// =============================================================================

/**
 * Toast notification provider
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const toast: Toast = { id, type, message, duration };

      setToasts((prev) => [...prev, toast]);

      // Auto-dismiss
      if (duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
      }
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

// =============================================================================
// Toast Container
// =============================================================================

function ToastContainer({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// =============================================================================
// Individual Toast
// =============================================================================

function ToastItem({
  toast,
  onDismiss
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss(toast.id), 200);
  };

  const icons = {
    success: <CheckCircleIcon size={20} weight="fill" />,
    error: <WarningCircleIcon size={20} weight="fill" />,
    warning: <WarningCircleIcon size={20} weight="fill" />,
    info: <InfoIcon size={20} weight="fill" />
  };

  const colors = {
    success: "bg-green-600 text-white",
    error: "bg-red-600 text-white",
    warning: "bg-yellow-500 text-black",
    info: "bg-blue-600 text-white"
  };

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg
        ${colors[toast.type]}
        transform transition-all duration-200 ease-out
        ${isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
      `}
    >
      <span className="flex-shrink-0">{icons[toast.type]}</span>
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
        aria-label="Dismiss"
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}
