export type ToastVariant = "success" | "error" | "default";

export type ToastInput = {
  title: string;
  message?: string;
  variant?: ToastVariant;
};

export type ToastItem = ToastInput & { id: string; variant: ToastVariant };

type Listener = (toast: ToastItem) => void;

const listeners = new Set<Listener>();

export function enqueueToast(input: ToastInput) {
  const toast: ToastItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: input.title,
    message: input.message,
    variant: input.variant ?? "default",
  };
  listeners.forEach((listener) => listener(toast));
  return toast;
}

export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
