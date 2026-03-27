import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { DataGapsClient } from "@/app/(admin)/admin/ingest/data-gaps/data-gaps-client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const VALID_FLAGS = ["MISSING_IMAGE", "LOW_CONFIDENCE_METADATA", "INCOMPLETE"] as const;

type ValidFlag = (typeof VALID_FLAGS)[number];

export default async function DataGapsPage({
  searchParams,
}: {
  searchParams: Promise<{ flag?: string; page?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const parsedPage = Number(params.page ?? "1");
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
  const flag = params.flag ?? null;
  const currentFlag: ValidFlag | null = flag && VALID_FLAGS.includes(flag as ValidFlag) ? (flag as ValidFlag) : null;

  const where = {
    deletedAt: null,
    ...(currentFlag
      ? { completenessFlags: { has: currentFlag } }
      : { completenessFlags: { isEmpty: false } }),
  };

  const [artworks, total, flagCounts] = await Promise.all([
    db.artwork.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        completenessScore: true,
        completenessFlags: true,
        completenessUpdatedAt: true,
        medium: true,
        year: true,
        featuredAssetId: true,
        artist: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ completenessScore: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.artwork.count({ where }),
    Promise.all(
      VALID_FLAGS.map(async (candidateFlag) => ({
        flag: candidateFlag,
        count: await db.artwork.count({
          where: {
            deletedAt: null,
            completenessFlags: { has: candidateFlag },
          },
        }),
      })),
    ),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AdminPageHeader
        title="Data gaps"
        description={`${total} artwork${total === 1 ? "" : "s"} with missing or incomplete data — sorted by lowest score first.`}
      />
      <DataGapsClient
        artworks={artworks}
        total={total}
        totalPages={totalPages}
        currentPage={Math.min(page, totalPages)}
        currentFlag={currentFlag}
        flagCounts={flagCounts}
      />
    </>
  );
}
