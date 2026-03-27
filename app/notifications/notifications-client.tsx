"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorCard } from "@/components/ui/error-card";
import { LoadingCard } from "@/components/ui/loading-card";
import { enqueueToast } from "@/lib/toast";
import { track } from "@/lib/analytics/client";
import { groupNotificationsByDay } from "@/lib/notifications-grouping";
import type { Notification } from "@prisma/client";

type NotificationPageProps = {
  initialItems: Notification[];
  initialNextCursor: string | null;
};

function relativeTimeLabel(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function refreshUnreadBadge() {
  try {
    await fetch("/api/notifications/unread-count", { cache: "no-store" });
    window.dispatchEvent(new Event("notifications:unread-refresh"));
  } catch {
    // best effort
  }
}

export function NotificationsClient({ initialItems, initialNextCursor }: NotificationPageProps) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<"ALL" | "UNREAD">("ALL");
  const [error, setError] = useState<string | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  useEffect(() => {
    track("notifications_viewed");
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => item.readAt == null).length, [items]);
  const visibleItems = useMemo(() => items.filter((item) => (activeTab === "UNREAD" ? item.readAt == null : true)), [activeTab, items]);
  const groups = useMemo(() => groupNotificationsByDay(visibleItems), [visibleItems]);

  async function markRead(id: string) {
    const readAt = new Date();
    setItems((current) => current.map((item) => item.id === id ? { ...item, status: "READ", readAt } : item));
    const response = await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (!response.ok) {
      setItems((current) => current.map((item) => item.id === id ? { ...item, status: "UNREAD", readAt: null } : item));
      enqueueToast({ title: "Unable to mark as read", variant: "error" });
      return false;
    }
    const matched = items.find((entry) => entry.id === id);
    track("notification_marked_read", { notificationType: matched?.type, hasTarget: Boolean(matched?.href) });
    void refreshUnreadBadge();
    return true;
  }

  async function markAllRead() {
    if (markingAllRead) return;
    setMarkingAllRead(true);
    const readAt = new Date();
    setItems((current) => current.map((item) => ({ ...item, status: "READ", readAt })));
    try {
      const response = await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
      if (!response.ok) throw new Error("request_failed");
      track("notifications_mark_all_read");
      enqueueToast({ title: "All notifications marked read" });
      void refreshUnreadBadge();
    } catch {
      setItems(initialItems);
      enqueueToast({ title: "Unable to mark all read", variant: "error" });
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      setError(null);
      const response = await fetch(`/api/notifications?cursor=${nextCursor}&limit=20`);
      if (!response.ok) {
        setError("Unable to load more notifications right now.");
        return;
      }
      const data = await response.json() as { items: Notification[]; nextCursor: string | null };
      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  if (activeTab === "UNREAD" && groups.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button className="rounded border px-3 py-1 text-sm" type="button" onClick={() => setActiveTab("ALL")}>All</button>
            <button className="rounded border border-foreground px-3 py-1 text-sm" type="button" onClick={() => setActiveTab("UNREAD")}>Unread</button>
          </div>
        </div>
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">You&apos;re all caught up.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-busy={loadingMore}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-700">Unread: {unreadCount}</p>
        <div className="flex gap-2">
          <button className={`rounded border px-3 py-1 text-sm ${activeTab === "ALL" ? "border-foreground" : "border-border"}`} type="button" onClick={() => setActiveTab("ALL")}>All</button>
          <button className={`rounded border px-3 py-1 text-sm ${activeTab === "UNREAD" ? "border-foreground" : "border-border"}`} type="button" onClick={() => setActiveTab("UNREAD")}>Unread</button>
          <button className="rounded border px-3 py-1 text-sm" type="button" onClick={markAllRead} disabled={markingAllRead || unreadCount === 0}>{markingAllRead ? "Marking..." : "Mark all read"}</button>
        </div>
      </div>

      {error ? <ErrorCard message={error} onRetry={() => void loadMore()} /> : null}
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{group.label}</h2>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.id} className={`rounded-lg border p-3 ${item.readAt == null ? "border-foreground bg-muted/40" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={async () => {
                        const ok = await markRead(item.id);
                        if (!ok || !item.href) return;
                        window.location.href = item.href;
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {item.readAt == null ? <span className="mt-1 h-2 w-2 rounded-full bg-foreground" aria-hidden="true" /> : null}
                        <p className={item.readAt == null ? "font-semibold" : "font-medium"}>{item.title}</p>
                      </div>
                      {item.body ? <p className="text-sm text-gray-700">{item.body}</p> : null}
                      <p className="text-xs text-gray-500" suppressHydrationWarning title={new Date(item.createdAt).toLocaleString()}>{relativeTimeLabel(new Date(item.createdAt))}</p>
                    </button>
                    <button className="rounded border px-2 py-1 text-xs" type="button" onClick={() => void markRead(item.id)} aria-label={`Mark ${item.title} as read`}>Read</button>
                  </div>
                  {item.href ? <Link href={item.href} className="mt-2 inline-block text-sm font-medium underline">Open</Link> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {loadingMore ? <LoadingCard lines={2} /> : null}
      {nextCursor ? <button className="rounded border px-3 py-1 text-sm" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading..." : "Load more"}</button> : null}
    </section>
  );
}
