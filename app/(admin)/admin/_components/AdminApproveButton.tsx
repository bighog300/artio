"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

type Props = {
  entityType: "venue" | "event";
  submissionId: string | null;
  entityId?: string;
  directStatusEndpoint?: string;
  disabled?: boolean;
};

export default function AdminApproveButton({ entityType, submissionId, entityId, directStatusEndpoint, disabled }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onApprove() {
    setLoading(true);
    try {
      let res: Response | null = null;
      if (submissionId) {
        res = await fetch(`/api/admin/submissions/${submissionId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      } else if (directStatusEndpoint && entityId) {
        res = await fetch(directStatusEndpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PUBLISHED" }),
        });
      }

      if (!res || !res.ok) {
        enqueueToast({ title: "Approval failed", variant: "error" });
        return;
      }
      enqueueToast({ title: `${entityType === "venue" ? "Venue" : "Event"} approved`, variant: "success" });
      router.push(entityType === "venue" ? "/admin/venues" : "/admin/events");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button disabled={Boolean(disabled) || loading || (!submissionId && !(directStatusEndpoint && entityId))} onClick={onApprove}>
      {loading ? "Approving…" : `Approve ${entityType}`}
    </Button>
  );
}
