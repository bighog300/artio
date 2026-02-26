"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  venueId: string;
  missingRequired: string[];
};

export default function VenueCreatedDraftBanner({ venueId, missingRequired }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const isCreated = searchParams.get("created") === "1";
  const visible = isCreated && !dismissed;

  const trimmedQuery = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("created");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!isCreated) return;
    router.replace(trimmedQuery, { scroll: false });
  }, [isCreated, router, trimmedQuery]);

  if (!visible) return null;

  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm font-semibold">Venue created (Draft)</p>
          <p className="text-sm">Your venue is saved as a draft and is not yet in the Admin review queue.</p>
          <p className="text-sm">
            Next steps: confirm location + add at least 1 image, then click “Submit for review”.
          </p>
          {missingRequired.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {missingRequired.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="underline" href={`#images-section-${venueId}`}>Jump to Images</Link>
            <Link className="underline" href={`#location-section-${venueId}`}>Jump to Location</Link>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => setDismissed(true)}>Dismiss</Button>
      </div>
    </div>
  );
}
