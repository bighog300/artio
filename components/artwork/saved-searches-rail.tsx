import Link from "next/link";

type SavedSearch = {
  id: string;
  name: string;
  params: Record<string, unknown>;
};

export function SavedSearchesRail({ searches }: { searches: SavedSearch[] }) {
  if (searches.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Your saved searches</p>
        <Link href="/saved-searches" className="text-xs text-muted-foreground underline">
          Manage
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {searches.map((search) => {
          const rawParams = search.params as Record<string, unknown>;
          const urlParams = new URLSearchParams();
          Object.entries(rawParams).forEach(([k, v]) => {
            if (k === "page" || v == null) return;
            if (Array.isArray(v)) {
              v.forEach((item) => typeof item === "string" && urlParams.append(k, item));
            } else if (typeof v === "string" && v) {
              urlParams.set(k, v);
            }
          });
          const href = urlParams.toString() ? `/artwork?${urlParams.toString()}` : "/artwork";
          return (
            <Link
              key={search.id}
              href={href}
              className="rounded-full border bg-muted px-3 py-1 text-xs hover:bg-muted/80"
            >
              {search.name}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
