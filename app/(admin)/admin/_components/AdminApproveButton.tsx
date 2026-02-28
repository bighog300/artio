"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

type Props = {
  entityType: "venue" | "event";
  submissionId: string | null;
  disabled?: boolean;
};

export default function AdminApproveButton({ entityType, submissionId, disabled }: Props) {
  const [loading, setLoading] = useState(false);

  async function onApprove() {
    if (!submissionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        enqueueToast({ title: "Approval failed", variant: "error" });
        return;
      }
      enqueueToast({ title: `${entityType === "venue" ? "Venue" : "Event"} approved`, variant: "success" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button disabled={disabled || !submissionId || loading} onClick={onApprove}>
      {loading ? "Approving…" : `Approve ${entityType}`}
    </Button>
  );
}
