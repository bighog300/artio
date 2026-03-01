import type { ContentStatus } from "@prisma/client";

export type PrimaryAction = {
  label: string;
  href?: string;
  disabled?: boolean;
};

export function getPrimaryAction(status: ContentStatus, hrefs?: { edit?: string; status?: string; live?: string }): PrimaryAction {
  if (status === "DRAFT") return { label: "Continue Editing", href: hrefs?.edit };
  if (status === "CHANGES_REQUESTED") return { label: "Fix & Resubmit", href: hrefs?.edit };
  if (status === "IN_REVIEW") return { label: "View Status", href: hrefs?.status ?? hrefs?.edit };
  if (status === "PUBLISHED") return { label: "View Live", href: hrefs?.live };
  return { label: "Archived", disabled: true };
}
