import { ReactNode } from "react";
import { MyHeaderBar } from "@/app/my/_components/my-header-bar";
import { MySubNav } from "@/app/my/_components/my-sub-nav";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function MyShell({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  let venues: Array<{ id: string; name: string; role: "OWNER" | "EDITOR" }> = [];
  let hasArtistProfile = false;
  let unreadInquiryCount = 0;

  if (user) {
    const [memberships, artist] = await Promise.all([
      db.venueMembership.findMany({
        where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] }, venue: { deletedAt: null } },
        select: { venueId: true, role: true, venue: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      db.artist.findUnique({ where: { userId: user.id }, select: { id: true } }),
    ]);
    venues = memberships.map((m) => ({ id: m.venueId, name: m.venue.name, role: m.role }));
    hasArtistProfile = Boolean(artist);

    if (artist) {
      unreadInquiryCount = await db.artworkInquiry.count({
        where: {
          artwork: { artistId: artist.id },
          readAt: null,
        },
      });
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <MyHeaderBar venues={venues} hasArtistProfile={hasArtistProfile} />
      <MySubNav unreadInquiryCount={unreadInquiryCount} />
      <div>{children}</div>
    </div>
  );
}
