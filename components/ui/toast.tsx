"use client";

import { useEffect, useState } from "react";
import { subscribeToasts, type ToastItem } from "@/lib/toast";

const baseToastClasses = "rounded border bg-card px-3 py-2 text-card-foreground shadow";

function toastVariantClasses(variant: ToastItem["variant"]) {
  if (variant === "error") return "border-destructive/40";
  if (variant === "success") return "border-emerald-500/40";
  return "border-border";
}

export function ToastCard({ item }: { item: ToastItem }) {
  return (
    <div className={`${baseToastClasses} ${toastVariantClasses(item.variant)}`}>
      <p className="text-sm font-semibold">{item.title}</p>
      {item.message ? <p className="text-xs text-muted-foreground">{item.message}</p> : null}
    </div>
  );
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToasts((toast) => {
      setItems((current) => [...current, toast]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== toast.id));
      }, 3000);
    });
    return () => { unsubscribe(); };
  }, []);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2" role="status" aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
