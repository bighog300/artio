"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enqueueToast } from "@/lib/toast";

type Member = {
  id: string;
  role: "OWNER" | "EDITOR";
  user: { id: string; email: string; name: string | null };
};

export default function VenueMembersManager({ venueId, members }: { venueId: string; members: Member[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", role: "EDITOR" as const });
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/my/venues/${venueId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        enqueueToast({ title: body?.error?.message || "Failed to add member", variant: "error" });
        return;
      }

      setForm((prev) => ({ ...prev, email: "" }));
      enqueueToast({ title: "Member added", variant: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function updateRole(memberId: string, role: "OWNER" | "EDITOR") {
    setBusy(true);
    try {
      const res = await fetch(`/api/my/venues/${venueId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        enqueueToast({ title: body?.error?.message || "Failed to update role", variant: "error" });
        return;
      }

      enqueueToast({ title: "Role updated", variant: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(memberId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/my/venues/${venueId}/members/${memberId}`, { method: "DELETE" });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        enqueueToast({ title: body?.error?.message || "Failed to remove member", variant: "error" });
        return;
      }

      enqueueToast({ title: "Member removed", variant: "success" });
      setRemoveTargetId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Members</h2>
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.id} className="border rounded p-2 flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <div className="font-medium">{member.user.name ?? member.user.email}</div>
              <div className="text-sm text-neutral-600">{member.user.email}</div>
            </div>
            <select
              className="border rounded p-1"
              value={member.role}
              disabled={busy}
              onChange={(e) => void updateRole(member.id, e.target.value as "OWNER" | "EDITOR")}
            >
              {/* Role change for existing members — OWNER allowed via PATCH endpoint */}
              <option value="OWNER">OWNER</option>
              <option value="EDITOR">EDITOR</option>
            </select>
            {removeTargetId === member.id ? (
              <>
                <span className="text-sm text-destructive">Remove?</span>
                <button
                  className="rounded border px-2 py-1 text-sm text-destructive"
                  disabled={busy}
                  onClick={() => void removeMember(member.id)}
                >
                  Yes
                </button>
                <button className="rounded border px-2 py-1 text-sm" onClick={() => setRemoveTargetId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="rounded border px-2 py-1 text-sm" disabled={busy} onClick={() => setRemoveTargetId(member.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={addMember} className="space-y-2 max-w-xl">
        <h3 className="font-medium">Add member</h3>
        <input
          className="border rounded p-2 w-full"
          placeholder="Email"
          type="email"
          required
          disabled={busy}
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
        />
        <select className="border rounded p-2" disabled={busy} value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as "EDITOR" }))}>
          <option value="EDITOR">Editor</option>
        </select>
        <div>
          <button className="rounded border px-3 py-1" disabled={busy}>{busy ? "Saving…" : "Add member"}</button>
        </div>
      </form>
    </section>
  );
}
