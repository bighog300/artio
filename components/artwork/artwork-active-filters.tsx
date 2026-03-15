import Link from "next/link";

type Chip = {
  key: string;
  label: string;
  removeHref: string;
};

function buildRemoveHref(currentParams: URLSearchParams, keysToRemove: string[]): string {
  const next = new URLSearchParams(currentParams.toString());
  keysToRemove.forEach((k) => next.delete(k));
  next.delete("page");
  const str = next.toString();
  return str ? `/artwork?${str}` : "/artwork";
}

export function ArtworkActiveFilters({
  searchParams,
  artistName,
}: {
  searchParams: URLSearchParams;
  artistName?: string | null;
}) {
  const chips: Chip[] = [];

  const query = searchParams.get("query");
  if (query) {
    chips.push({
      key: "query",
      label: `Search: "${query.length > 20 ? `${query.slice(0, 20)}…` : query}"`,
      removeHref: buildRemoveHref(searchParams, ["query"]),
    });
  }

  const mediums = searchParams.getAll("medium");
  for (const medium of mediums) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("medium");
    mediums.filter((m) => m !== medium).forEach((m) => next.append("medium", m));
    next.delete("page");
    chips.push({
      key: `medium-${medium}`,
      label: `Medium: ${medium}`,
      removeHref: next.toString() ? `/artwork?${next.toString()}` : "/artwork",
    });
  }

  const yearFrom = searchParams.get("yearFrom");
  const yearTo = searchParams.get("yearTo");
  if (yearFrom || yearTo) {
    const label = yearFrom && yearTo
      ? `Year: ${yearFrom}–${yearTo}`
      : yearFrom
        ? `Year from: ${yearFrom}`
        : `Year to: ${yearTo}`;
    chips.push({
      key: "year",
      label,
      removeHref: buildRemoveHref(searchParams, ["yearFrom", "yearTo"]),
    });
  }

  const priceMin = searchParams.get("priceMin");
  const priceMax = searchParams.get("priceMax");
  const currency = searchParams.get("currency") ?? "£";
  const currencySymbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency;
  if (priceMin || priceMax) {
    const label = priceMin && priceMax
      ? `Price: ${currencySymbol}${priceMin}–${currencySymbol}${priceMax}`
      : priceMin
        ? `Price from: ${currencySymbol}${priceMin}`
        : `Price to: ${currencySymbol}${priceMax}`;
    chips.push({
      key: "price",
      label,
      removeHref: buildRemoveHref(searchParams, ["priceMin", "priceMax"]),
    });
  }

  if (currency && (priceMin || priceMax)) {
    // currency chip only shown alongside price
  } else if (currency) {
    chips.push({
      key: "currency",
      label: `Currency: ${currency}`,
      removeHref: buildRemoveHref(searchParams, ["currency"]),
    });
  }

  if (searchParams.get("hasImages") === "true") {
    chips.push({
      key: "hasImages",
      label: "Has images",
      removeHref: buildRemoveHref(searchParams, ["hasImages"]),
    });
  }

  if (searchParams.get("hasPrice") === "true") {
    chips.push({
      key: "hasPrice",
      label: "Has price",
      removeHref: buildRemoveHref(searchParams, ["hasPrice"]),
    });
  }

  if (searchParams.get("artistId") && artistName) {
    chips.push({
      key: "artistId",
      label: `Artist: ${artistName}`,
      removeHref: buildRemoveHref(searchParams, ["artistId"]),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.removeHref}
          className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs hover:bg-muted/80"
        >
          {chip.label}
          <span aria-hidden>×</span>
        </Link>
      ))}
      {chips.length > 1 ? (
        <Link
          href="/artwork"
          className="rounded-full border border-destructive/40 px-2.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
        >
          Clear all
        </Link>
      ) : null}
    </div>
  );
}
