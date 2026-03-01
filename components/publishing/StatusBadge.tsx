import type { ContentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const CLASS_BY_STATUS: Record<ContentStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-800 border-slate-300",
  IN_REVIEW: "bg-blue-100 text-blue-800 border-blue-300",
  CHANGES_REQUESTED: "bg-amber-100 text-amber-900 border-amber-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  ARCHIVED: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

export function StatusBadge({ status }: { status: ContentStatus }) {
  return <Badge className={CLASS_BY_STATUS[status]}>{status.replaceAll("_", " ")}</Badge>;
}
