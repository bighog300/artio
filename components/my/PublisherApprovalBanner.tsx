"use client";

import { useState } from "react";

export default function PublisherApprovalBanner({ noticeId }: { noticeId: string }) {
  const [dismissed, setDismissed] = useState(false);

  async function handleDismiss() {
    setDismissed(true);
    try {
      await fetch(`/api/my/publisher-notice/${noticeId}/dismiss`, { method: "POST" });
    } catch {
      // Keep dismissed UI state even if request fails.
    }
  }

  if (dismissed) return null;

  return (
    <section
      aria-live="polite"
      className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900"
    >
      <p className="text-sm">
        Your publisher access has been approved. You can now publish events directly.
      </p>
      <button
        aria-label="Dismiss"
        className="rounded px-2 py-1 text-lg leading-none hover:bg-emerald-100"
        onClick={handleDismiss}
        type="button"
      >
        ×
      </button>
    </section>
  );
}
