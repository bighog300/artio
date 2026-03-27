import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { EnrichClient, type EnrichmentRun, type WorkbenchTemplate } from "@/app/(admin)/admin/ingest/enrich/enrich-client";
import { requireAdmin } from "@/lib/auth";
import { ENRICHMENT_TEMPLATES } from "@/lib/enrichment/templates";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function buildTemplateConfig(): WorkbenchTemplate[] {
  return ENRICHMENT_TEMPLATES.map((template) => {
    const gapFilter = template.gapField === "bio"
      ? "MISSING_BIO"
      : template.gapField === "description"
        ? "MISSING_DESCRIPTION"
        : "MISSING_IMAGE";

    return {
      key: template.key,
      label: template.label,
      entityType: template.entityType,
      searchEnabled: true,
      gapOptions: [
        { value: "ALL", label: "All gaps" },
        { value: gapFilter, label: template.gapField === "bio" ? "Missing bio" : template.gapField === "description" ? "Missing description" : "Missing image" },
      ],
    };
  });
}

export default async function EnrichmentWorkbenchPage() {
  await requireAdmin();

  const runs = await db.enrichmentRun.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
    include: {
      requestedBy: { select: { id: true, name: true, email: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <>
      <AdminPageHeader
        title="Manual enrichment workbench"
        description="Preview targets, run template-based enrichment, and inspect run outcomes."
      />
      <EnrichClient
        templates={buildTemplateConfig()}
        initialRuns={runs as EnrichmentRun[]}
      />
    </>
  );
}
