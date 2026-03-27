type VenueTrackRecordStore = {
  ingestExtractedEvent: {
    findMany: (args: {
      where: {
        venueId: string;
        status: { in: Array<"APPROVED" | "REJECTED"> };
      };
      select: { status: true };
      orderBy: { createdAt: "desc" };
      take: number;
    }) => Promise<Array<{ status: string }>>;
  };
};

const LOOKBACK_CANDIDATES = 20;
const MIN_DECISIONS_REQUIRED = 5;

export async function getVenueTrackRecordBonus(
  venueId: string,
  db: VenueTrackRecordStore,
): Promise<number> {
  const recent = await db.ingestExtractedEvent.findMany({
    where: {
      venueId,
      status: { in: ["APPROVED", "REJECTED"] },
    },
    select: { status: true },
    orderBy: { createdAt: "desc" },
    take: LOOKBACK_CANDIDATES,
  });

  if (recent.length < MIN_DECISIONS_REQUIRED) return 0;

  const approved = recent.filter((record) => record.status === "APPROVED").length;
  const rate = approved / recent.length;

  if (rate >= 0.8) return 8;
  if (rate >= 0.6) return 4;
  if (rate < 0.4) return -5;
  return 0;
}
