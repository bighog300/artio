"use client";

import { useEffect, useState } from "react";
import { enqueueToast } from "@/lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Role = "USER" | "EDITOR" | "ADMIN";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isTrustedPublisher: boolean;
  trustedPublisherSince: string | null;
  trustedPublisherById: string | null;
  trustedPublisherBy: { id: string; email: string; name: string | null } | null;
  createdAt: string;
};

type AdminInvite = {
  id: string;
  email: string;
  intendedRole: Role;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  status: "active" | "accepted" | "revoked" | "expired";
};

export function UsersManagerClient() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("EDITOR");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [adminInviteDialogOpen, setAdminInviteDialogOpen] = useState(false);

  async function loadUsers(nextQuery: string) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextQuery.trim()) params.set("query", nextQuery.trim());
      const res = await fetch(`/api/admin/users?${params.toString()}`, { method: "GET" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load users");
      setUsers(body.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setBusy(false);
    }
  }

  async function loadInvites() {
    try {
      const res = await fetch("/api/admin/invites", { method: "GET" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load invites");
      setInvites(body.invites ?? []);
    } catch {
      // Non-fatal for users management table.
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadUsers(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void loadInvites();
  }, []);

  async function updateRole(userId: string, role: Role) {
    setSavingUserId(userId);
    setError(null);

    const previousUsers = users;
    setUsers((current) => current.map((item) => (item.id === userId ? { ...item, role } : item)));

    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to update role");
      setUsers((current) => current.map((item) => (item.id === userId ? { ...item, role: body.user.role as Role } : item)));
    } catch (err) {
      setUsers(previousUsers);
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingUserId(null);
    }
  }

  async function updateTrustedPublisher(userId: string, enabled: boolean) {
    setSavingUserId(userId);
    setError(null);

    const previousUsers = users;
    const nowIso = new Date().toISOString();
    setUsers((current) => current.map((item) => {
      if (item.id !== userId) return item;
      if (enabled) {
        return { ...item, isTrustedPublisher: true, trustedPublisherSince: item.trustedPublisherSince ?? nowIso };
      }
      return { ...item, isTrustedPublisher: false };
    }));

    try {
      const res = await fetch(`/api/admin/users/${userId}/trusted-publisher`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to update trusted publisher capability");
      setUsers((current) => current.map((item) => (item.id === userId ? { ...item, ...body.user } : item)));
      enqueueToast({ title: enabled ? "Trusted Publisher enabled" : "Trusted Publisher revoked" });
    } catch (err) {
      setUsers(previousUsers);
      const message = err instanceof Error ? err.message : "Failed to update trusted publisher capability";
      setError(message);
      enqueueToast({ title: message, variant: "error" });
    } finally {
      setSavingUserId(null);
    }
  }

  async function doCreateInvite(role: Role) {
    const normalized = inviteEmail.trim().toLowerCase();
    if (!normalized) return;

    setCreatingInvite(true);
    setInviteNotice(null);
    setError(null);
    setInviteUrl(null);
    setInviteExpiresAt(null);

    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalized, role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to create invite");

      setInviteUrl(body.inviteUrl ?? null);
      setInviteExpiresAt(body.expiresAt ?? null);
      if (body.reused) {
        setInviteNotice("An active invite already exists for this email. Existing invite returned.");
      } else {
        setInviteNotice("Invite created. Copy and share the link below.");
      }

      await loadInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function createInvite() {
    if (inviteRole === "ADMIN") {
      setAdminInviteDialogOpen(true);
      return;
    }

    await doCreateInvite(inviteRole);
  }

  async function revokeInvite(inviteId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/admin/invites/${inviteId}/revoke`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to revoke invite");
      await loadInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invite");
    }
  }

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteNotice("Invite link copied.");
    } catch {
      setInviteNotice("Copy failed. Please copy manually.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border bg-background p-3 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Invite user / create editor</h2>
        </div>

        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            type="email"
            placeholder="person@example.com"
            className="w-full rounded border px-2 py-1 text-sm"
          />
          <select className="rounded border px-2 py-1 text-sm" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)}>
            <option value="USER">USER</option>
            <option value="EDITOR">EDITOR</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button type="button" disabled={creatingInvite} onClick={() => void createInvite()} className="rounded border px-3 py-1 text-sm">
            {creatingInvite ? "Creating…" : "Create invite"}
          </button>
        </div>

        {inviteNotice ? <p className="text-sm text-muted-foreground">{inviteNotice}</p> : null}

        {inviteUrl ? (
          <div className="space-y-2 rounded border p-2">
            <label className="text-xs font-medium text-muted-foreground">Invite link</label>
            <div className="flex gap-2">
              <input readOnly value={inviteUrl} className="w-full rounded border px-2 py-1 text-xs" />
              <button type="button" onClick={() => void copyInviteLink()} className="rounded border px-3 py-1 text-sm">Copy link</button>
            </div>
            {inviteExpiresAt ? <p className="text-xs text-muted-foreground">Expires: {new Date(inviteExpiresAt).toISOString()}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="rounded border bg-background p-3 space-y-2">
        <label htmlFor="users-search" className="text-sm font-medium">Search users</label>
        <input
          id="users-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email or name"
          className="w-full rounded border px-2 py-1 text-sm"
        />
      </div>

      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Trusted Publisher</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-muted-foreground" colSpan={5}>{busy ? "Loading users..." : "No users found."}</td>
              </tr>
            ) : users.map((user) => (
              <tr key={user.id} className="border-t">
                <td className="px-3 py-2">{user.email}</td>
                <td className="px-3 py-2">{user.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <select
                    className="rounded border px-2 py-1"
                    value={user.role}
                    disabled={savingUserId === user.id}
                    onChange={(event) => void updateRole(user.id, event.target.value as Role)}
                  >
                    <option value="USER">USER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Trusted Publisher: {user.isTrustedPublisher ? "Enabled" : "Disabled"}</p>
                    <p className="text-xs text-muted-foreground">Granted since: {user.trustedPublisherSince ? new Date(user.trustedPublisherSince).toISOString() : "—"}</p>
                    <p className="text-xs text-muted-foreground">Granted by: {user.trustedPublisherBy?.email ?? "—"}</p>
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs"
                      disabled={savingUserId === user.id}
                      onClick={() => void updateTrustedPublisher(user.id, !user.isTrustedPublisher)}
                    >
                      {user.isTrustedPublisher ? "Revoke Trusted Publisher" : "Enable Trusted Publisher"}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">{new Date(user.createdAt).toISOString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2">Invite email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-muted-foreground" colSpan={5}>No invites found.</td>
              </tr>
            ) : invites.map((invite) => (
              <tr key={invite.id} className="border-t">
                <td className="px-3 py-2">{invite.email}</td>
                <td className="px-3 py-2">{invite.intendedRole}</td>
                <td className="px-3 py-2">{invite.status}</td>
                <td className="px-3 py-2">{new Date(invite.expiresAt).toISOString()}</td>
                <td className="px-3 py-2">
                  {invite.status === "active" ? (
                    <button type="button" onClick={() => void revokeInvite(invite.id)} className="rounded border px-2 py-1 text-xs">Revoke</button>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={adminInviteDialogOpen} onOpenChange={setAdminInviteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create admin invite?</AlertDialogTitle>
            <AlertDialogDescription>
              The recipient will receive full admin access upon accepting this invite.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAdminInviteDialogOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              className="rounded border px-3 py-1 text-sm"
              disabled={creatingInvite}
              onClick={() => {
                setAdminInviteDialogOpen(false);
                void doCreateInvite("ADMIN");
              }}
            >
              {creatingInvite ? "Creating…" : "Create invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
