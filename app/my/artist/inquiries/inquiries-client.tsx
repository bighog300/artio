"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type InquiryRow = {
  id: string;
  artworkId: string;
  createdAt: string;
  buyerName: string;
  buyerEmail: string;
  message: string | null;
  readAt: string | null;
  artwork: {
    title: string;
    slug: string | null;
  };
};

export default function InquiriesClient({ initialInquiries }: { initialInquiries: InquiryRow[] }) {
  const [inquiries, setInquiries] = useState(initialInquiries);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const unreadCount = useMemo(() => inquiries.filter((inquiry) => !inquiry.readAt).length, [inquiries]);

  async function toggleRead(id: string) {
    const existing = inquiries.find((inquiry) => inquiry.id === id);
    if (!existing) return;

    const optimisticReadAt = existing.readAt ? null : new Date().toISOString();

    setPendingIds((current) => new Set(current).add(id));
    setInquiries((current) => current.map((inquiry) => (
      inquiry.id === id ? { ...inquiry, readAt: optimisticReadAt } : inquiry
    )));

    try {
      const res = await fetch(`/api/my/artist/inquiries/${encodeURIComponent(id)}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to update inquiry read status.");

      const payload = (await res.json()) as { inquiry?: { id: string; readAt: string | null } };
      setInquiries((current) => current.map((inquiry) => (
        inquiry.id === id ? { ...inquiry, readAt: payload.inquiry?.readAt ?? inquiry.readAt } : inquiry
      )));
    } catch {
      setInquiries((current) => current.map((inquiry) => (
        inquiry.id === id ? { ...inquiry, readAt: existing.readAt } : inquiry
      )));
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">Artwork inquiries</h2>
          <p className="text-sm text-muted-foreground">Review buyer messages and track read state.</p>
        </div>
        {unreadCount > 0 ? (
          <Badge className="bg-amber-100 text-amber-800">{unreadCount} new</Badge>
        ) : (
          <Badge variant="secondary">All caught up</Badge>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artwork</TableHead>
              <TableHead>Buyer</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inquiries.map((inquiry) => {
              const isPending = pendingIds.has(inquiry.id);
              const truncatedMessage = inquiry.message
                ? (inquiry.message.length > 80 ? `${inquiry.message.slice(0, 80)}…` : inquiry.message)
                : "—";

              return (
                <TableRow key={inquiry.id}>
                  <TableCell>
                    {inquiry.artwork.slug ? (
                      <Link className="underline-offset-2 hover:underline" href={`/artwork/${inquiry.artwork.slug}`}>
                        {inquiry.artwork.title}
                      </Link>
                    ) : inquiry.artwork.title}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{inquiry.buyerName}</div>
                    <a className="text-xs text-muted-foreground underline-offset-2 hover:underline" href={`mailto:${inquiry.buyerEmail}`}>
                      {inquiry.buyerEmail}
                    </a>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate" title={inquiry.message ?? ""}>{truncatedMessage}</TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(inquiry.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    {inquiry.readAt ? (
                      <Badge variant="secondary">Read</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800">New</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" disabled={isPending} onClick={() => toggleRead(inquiry.id)}>
                      {inquiry.readAt ? "Mark as unread" : "Mark as read"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {inquiries.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center text-muted-foreground" colSpan={6}>No inquiries yet.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
