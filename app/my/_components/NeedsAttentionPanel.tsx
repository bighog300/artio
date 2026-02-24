import type { ComponentType } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, FileWarning, Info, RefreshCw, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AttentionItem } from "@/lib/my/dashboard-schema";

type GroupSeverity = "destructive" | "warning" | "info" | "muted";

type AttentionGroupConfig = {
  key: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  severity: GroupSeverity;
};

const ATTENTION_GROUPS: AttentionGroupConfig[] = [
  { key: "rejected", title: "Rejected", icon: AlertTriangle, severity: "destructive" },
  { key: "pending_review", title: "Pending review", icon: Clock, severity: "muted" },
  { key: "incomplete_draft", title: "Incomplete drafts", icon: FileWarning, severity: "warning" },
  { key: "revision_required", title: "Revisions", icon: RefreshCw, severity: "warning" },
  { key: "pending_invite", title: "Team invites", icon: Users, severity: "info" },
  { key: "other", title: "Other", icon: Info, severity: "muted" },
];

const GROUP_KIND_MAP: Record<string, AttentionGroupConfig["key"]> = {
  rejected: "rejected",
  pending_review: "pending_review",
  incomplete_draft: "incomplete_draft",
  revision_required: "revision_required",
  pending_invite: "pending_invite",
};

const GROUP_STYLE_BY_SEVERITY: Record<GroupSeverity, string> = {
  destructive: "border-l-4 border-l-destructive",
  warning: "border-l-4 border-l-amber-500/40",
  info: "border-l-4 border-l-muted-foreground/30",
  muted: "border-l-4 border-l-muted-foreground/30",
};

const STATUS_BADGE_VARIANT_BY_SEVERITY: Record<GroupSeverity, "destructive" | "secondary" | "outline"> = {
  destructive: "destructive",
  warning: "outline",
  info: "secondary",
  muted: "outline",
};

function groupAttentionItems(items: AttentionItem[]) {
  const grouped = new Map<string, AttentionItem[]>();

  for (const item of items) {
    const key = GROUP_KIND_MAP[item.kind] ?? "other";
    const current = grouped.get(key) ?? [];
    current.push(item);
    grouped.set(key, current);
  }

  return ATTENTION_GROUPS.map((group) => ({
    ...group,
    items: (grouped.get(group.key) ?? []).sort((a, b) => {
      const bSortKey = b.updatedAtISO ?? b.createdAtISO;
      const aSortKey = a.updatedAtISO ?? a.createdAtISO;
      return Date.parse(bSortKey ?? "") - Date.parse(aSortKey ?? "");
    }),
  })).filter((group) => group.items.length > 0);
}

export default function NeedsAttentionPanel({ attention }: { attention: AttentionItem[] }) {
  const groupedAttention = groupAttentionItems(attention);

  return (
    <section className="rounded border p-3">
      <h2 className="text-lg font-semibold">Needs attention</h2>
      {attention.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 rounded border p-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" />
          Nothing needs attention — you&apos;re all caught up.
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {groupedAttention.map((group) => {
            const GroupIcon = group.icon;
            const groupStyles = GROUP_STYLE_BY_SEVERITY[group.severity];
            return (
              <section key={group.key} className={`rounded border bg-card p-3 ${groupStyles}`}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <GroupIcon className="h-4 w-4" />
                  {group.title}
                </h3>
                <ul className="space-y-2">
                  {group.items.map((item) => {
                    const status = "status" in item ? item.status : undefined;
                    return (
                      <li key={item.id} className="rounded border p-2 text-sm">
                        <div className="flex items-start gap-2">
                          <GroupIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{item.title}</p>
                              {typeof status === "string" && status.length > 0 ? <Badge variant={STATUS_BADGE_VARIANT_BY_SEVERITY[group.severity]}>{status}</Badge> : null}
                            </div>
                            <p className="line-clamp-2 text-muted-foreground">{item.reason}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <Link className="underline" href={item.ctaHref}>{item.ctaLabel}</Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
