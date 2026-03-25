"use client";

import { useMemo, useState } from "react";
import { VenueClaimRequestStatus } from "@prisma/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Claim = {
  id: string;
  venueId: string;
  userId: string;
  roleAtVenue: string;
  message: string | null;
  rejectionReason: string | null;
  status: VenueClaimRequestStatus;
  createdAt: string;
  verifiedAt: string | null;
  venue: { id: string; name: string; slug: string };
  user: { id: string; email: string };
  invite: { id: string; personalMessage: string | null } | null;
};

type TabValue = "ALL" | VenueClaimRequestStatus;

const TABS: Array<{ label: string; value: TabValue }> = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING_VERIFICATION" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Expired", value: "EXPIRED" },
];

function MessageCell({ message }: { message: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const normalized = message?.trim();
  if (!normalized) return <span className="text-muted-foreground">—</span>;
  if (normalized.length <= 100) return <span>{normalized}</span>;

  return (
    <div className="max-w-md">
      <span>{expanded ? normalized : `${normalized.slice(0, 100)}...`}</span>{" "}
      <button className="text-xs text-blue-600 hover:underline" onClick={() => setExpanded((x) => !x)} type="button">
        {expanded ? "show less" : "show more"}
      </button>
    </div>
  );
}

export default function VenueClaimsClient({ claims }: { claims: Claim[] }) {
  const [rows, setRows] = useState(claims);
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState<Record<string, boolean>>({});
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentParam = searchParams.get("status");
  const activeTab: TabValue =
    currentParam && (TABS.some((tab) => tab.value === currentParam) ? (currentParam as TabValue) : false)
      ? (currentParam as TabValue)
      : "PENDING_VERIFICATION";

  const filtered = useMemo(
    () => rows.filter((row) => (activeTab === "ALL" ? true : row.status === activeTab)),
    [activeTab, rows],
  );

  function setTab(status: TabValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", status);
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function runAction(claimId: string, action: "approve" | "reject" | "revoke", reason?: string) {
    setErrors((prev) => ({ ...prev, [claimId]: "" }));
    setPendingIds((prev) => ({ ...prev, [claimId]: true }));

    try {
      const res = await fetch(`/api/admin/venue-claims/${claimId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "reject" ? JSON.stringify({ reason: reason?.trim() || undefined }) : undefined,
      });

      if (!res.ok) {
        throw new Error((await res.json().catch(() => null))?.error?.message ?? "Request failed");
      }

      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== claimId) return row;
          if (action === "approve") return { ...row, status: "VERIFIED", verifiedAt: new Date().toISOString(), rejectionReason: null };
          if (action === "reject") return { ...row, status: "REJECTED", rejectionReason: reason?.trim() || null };
          return { ...row, status: "REJECTED", rejectionReason: "Revoked by admin" };
        }),
      );

      if (action === "reject") {
        setRejectOpen((prev) => ({ ...prev, [claimId]: false }));
      }
    } catch (error) {
      setErrors((prev) => ({ ...prev, [claimId]: error instanceof Error ? error.message : "Request failed" }));
    } finally {
      setPendingIds((prev) => ({ ...prev, [claimId]: false }));
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`rounded border px-3 py-1 text-xs ${activeTab === tab.value ? "bg-foreground text-background" : "hover:bg-muted"}`}
            onClick={() => setTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th>Venue</th>
            <th>User</th>
            <th>Status</th>
            <th>Role</th>
            <th>Message</th>
            <th>Invite note</th>
            <th>Created</th>
            <th>Verified</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((claim) => {
            const loading = !!pendingIds[claim.id];
            const canDecide = claim.status === "PENDING_VERIFICATION";
            const canRevoke = claim.status === "VERIFIED";
            return (
              <tr key={claim.id} className="border-t align-top">
                <td className="py-2">{claim.venue.name}</td>
                <td>{claim.user.email}</td>
                <td>{claim.status} {claim.invite ? <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">Via invite</span> : null}</td>
                <td>{claim.roleAtVenue}</td>
                <td><MessageCell message={claim.message} /></td>
                <td><MessageCell message={claim.invite?.personalMessage ?? null} /></td>
                <td>{new Date(claim.createdAt).toLocaleString()}</td>
                <td>{claim.verifiedAt ? new Date(claim.verifiedAt).toLocaleString() : "—"}</td>
                <td>
                  {(canDecide || canRevoke) ? (
                    <div className="space-y-2">
                      {canDecide ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => runAction(claim.id, "approve")}
                            className="rounded border px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-60"
                          >
                            {loading ? "⏳" : "Approve"}
                          </button>

                          {!rejectOpen[claim.id] ? (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => setRejectOpen((prev) => ({ ...prev, [claim.id]: true }))}
                              className="rounded border px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                            >
                              {loading ? "⏳" : "Reject"}
                            </button>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                value={rejectReason[claim.id] ?? ""}
                                onChange={(event) => setRejectReason((prev) => ({ ...prev, [claim.id]: event.target.value }))}
                                placeholder="Optional reason"
                                disabled={loading}
                                className="h-7 rounded border px-2 text-xs"
                              />
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => runAction(claim.id, "reject", rejectReason[claim.id])}
                                className="rounded border px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                              >
                                {loading ? "⏳" : "Confirm reject"}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {canRevoke ? (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => runAction(claim.id, "revoke")}
                          className="rounded border px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                        >
                          {loading ? "⏳" : "Revoke"}
                        </button>
                      ) : null}

                      {errors[claim.id] ? <p className="text-xs text-red-600">{errors[claim.id]}</p> : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{claim.status}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
