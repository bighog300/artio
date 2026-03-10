"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildEventQueryString } from "@/lib/events-filters";
import { track } from "@/lib/analytics/client";

type EventsFiltersBarProps = {
  defaultSort?: "soonest" | "popular" | "nearby";
  queryParamName?: "query" | "q";
  sortOptions?: Array<"soonest" | "popular" | "nearby" | "distance">;
  dayOptions?: number[];
};


const CATEGORY_LABELS: Record<string, string> = {
  medium: "Medium",
  genre: "Genre",
  movement: "Movement",
  mood: "Mood",
};

function dateRangeForPreset(preset: string) {
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  if (preset === "today") return { from, to: from };
  if (preset === "weekend") {
    const day = now.getDay();
    const toSaturday = (6 - day + 7) % 7;
    const saturday = new Date(now);
    saturday.setDate(now.getDate() + toSaturday);
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    return { from: saturday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
  }
  if (preset === "next7") {
    const end = new Date(now);
    end.setDate(now.getDate() + 7);
    return { from, to: end.toISOString().slice(0, 10) };
  }
  return { from: "", to: "" };
}

export function EventsFiltersBar({ defaultSort = "soonest", queryParamName = "query", sortOptions = ["soonest", "popular", "nearby"], dayOptions }: EventsFiltersBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [frequency, setFrequency] = useState<"WEEKLY" | "OFF">("WEEKLY");
  const [savedSearchId, setSavedSearchId] = useState<string | null>(null);
  const [fetchedTags, setFetchedTags] = useState<Array<{ id: string; name: string; slug: string; category: string }>>([]);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => setFetchedTags(data.items ?? []))
      .catch(() => {});
  }, []);

  const query = searchParams?.get(queryParamName) ?? "";
  const from = searchParams?.get("from") ?? "";
  const to = searchParams?.get("to") ?? "";
  const sort = searchParams?.get("sort") ?? defaultSort;
  const days = searchParams?.get("days") ?? "";
  const tags = (searchParams?.get("tags") ?? "").split(",").filter(Boolean);

  const datePreset = useMemo(() => {
    const presets = ["today", "weekend", "next7"] as const;
    const matched = presets.find((preset) => {
      const range = dateRangeForPreset(preset);
      return from === range.from && to === range.to;
    });
    if (matched) return matched;
    return from || to ? "range" : "all";
  }, [from, to]);

  const hasFilters = Boolean(query || from || to || tags.length || days || sort !== defaultSort);
  const canSaveSearch = Boolean(query.trim() || tags.length || datePreset !== "all" || days || sort !== defaultSort);
  const tagGroups = useMemo(() => {
    const order = ["medium", "genre", "movement", "mood"];
    return order
      .map((cat) => ({
        category: cat,
        label: CATEGORY_LABELS[cat] ?? cat,
        tags: fetchedTags.filter((t) => t.category === cat),
      }))
      .filter((g) => g.tags.length > 0);
  }, [fetchedTags]);

  const updateQuery = (updates: Record<string, string | null>) => {
    const next = buildEventQueryString(searchParams, updates);
    startTransition(() => {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    });
  };

  const toggleTag = (tag: string) => {
    const nextTags = tags.includes(tag) ? tags.filter((entry) => entry !== tag) : [...tags, tag];
    updateQuery({ tags: nextTags.length ? nextTags.join(",") : null });
  };

  const onOpenSave = () => {
    setSavedSearchId(null);
    setIsSaveOpen(true);
    track("events_save_search_opened", { hasQuery: Boolean(query.trim()), queryLength: query.trim().length, tagsCount: tags.length, datePreset, sort });
  };

  const onCreateSavedSearch = async () => {
    if (!canSaveSearch) return;
    const payload = {
      type: "EVENTS_FILTER",
      name: `Events: ${query.trim() ? query.trim().slice(0, 24) : "Filtered feed"}`,
      frequency: frequency === "WEEKLY" ? "WEEKLY" : undefined,
      params: {
        q: query.trim() || undefined,
        from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59.000Z`).toISOString() : undefined,
        tags,
      },
    };

    const response = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return;
    const item = await response.json() as { id?: string };
    setSavedSearchId(item.id ?? "saved");
    track("events_save_search_created", { method: "events_filters" });
  };

  const summaryChips = tags.slice(0, 3);

  const bar = (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <Input value={query} onChange={(event) => updateQuery({ [queryParamName]: event.target.value || null })} placeholder="Search events" aria-label="Search events" className="ui-trans focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm ui-trans hover:border-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={sort} onChange={(event) => updateQuery({ sort: event.target.value || null })} aria-label="Sort events">
          {sortOptions.includes("soonest") ? <option value="soonest">Soonest</option> : null}
          {sortOptions.includes("distance") ? <option value="distance">Distance</option> : null}
          {sortOptions.includes("popular") ? <option value="popular">Popular</option> : null}
          {sortOptions.includes("nearby") ? <option value="nearby">Nearby</option> : null}
        </select>
        <Button type="button" variant="outline" onClick={onOpenSave}>Save search</Button>
        {hasFilters ? <Button type="button" variant="ghost" className="ui-trans ui-press" onClick={() => updateQuery({ [queryParamName]: null, from: null, to: null, tags: null, days: null, sort: null })}>Clear</Button> : null}
      </div>

      {dayOptions?.length ? <Tabs value={days || "30"} onValueChange={(value) => updateQuery({ days: value, from: null, to: null })}><TabsList className="grid w-full grid-cols-3">{dayOptions.map((option) => <TabsTrigger key={option} value={String(option)}>Next {option}d</TabsTrigger>)}</TabsList></Tabs> : null}

      <Tabs value={datePreset} onValueChange={(value) => {
        const range = dateRangeForPreset(value);
        updateQuery({ from: range.from || null, to: range.to || null, days: null });
      }}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">Any day</TabsTrigger>
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="weekend">This weekend</TabsTrigger>
          <TabsTrigger value="next7">Next 7 days</TabsTrigger>
        </TabsList>
      </Tabs>

      {tagGroups.length > 0 ? (
        <div className="flex flex-col gap-3">
          {tagGroups.map((group) => (
            <div key={group.category}>
              <p className="text-xs text-muted-foreground mb-1">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.tags.map((tag) => (
                  <Button
                    key={tag.slug}
                    type="button"
                    size="sm"
                    variant={tags.includes(tag.slug) ? "default" : "outline"}
                    onClick={() => toggleTag(tag.slug)}
                    aria-label={`Filter by tag ${tag.name}`}
                  >
                    {tag.name}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="h-4" aria-live="polite">{isPending ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" aria-hidden="true" />Updating filters…</span> : null}</div>

      <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current filters</DialogTitle>
            <DialogDescription>Turn this filter set into a saved search.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Query: {query.trim() ? `“${query.trim()}”` : "None"}</p>
            <p>Date: {datePreset === "all" ? "Any day" : datePreset === "today" ? "Today" : datePreset === "weekend" ? "This weekend" : datePreset === "next7" ? "Next 7 days" : "Custom range"}</p>
            <p>Sort: {sort}</p>
            <div className="flex flex-wrap gap-1">{summaryChips.map((tag) => <span key={tag} className="rounded-full border px-2 py-0.5 text-xs">{tag}</span>)}{tags.length > 3 ? <span className="rounded-full border px-2 py-0.5 text-xs">+{tags.length - 3}</span> : null}</div>
            <label className="text-xs text-muted-foreground" htmlFor="events-save-frequency">Digest frequency</label>
            <select id="events-save-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as "WEEKLY" | "OFF")} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="WEEKLY">Weekly</option>
              <option value="OFF">Off</option>
            </select>
            {!canSaveSearch ? <p className="text-xs text-muted-foreground">Add a query, date preset, tags, or sort change to save this search.</p> : null}
            {savedSearchId ? <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs">Saved ✓ <div className="mt-2 flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { track("events_save_search_preview_clicked"); router.push("/saved-searches"); }}>Preview digest</Button><Button type="button" size="sm" variant="ghost" onClick={() => router.push("/saved-searches")}>Manage saved searches</Button></div></div> : null}
          </div>
          <div className="pt-2"><Button type="button" onClick={() => void onCreateSavedSearch()} disabled={!canSaveSearch}>Save</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return <><div className="md:hidden"><Button type="button" variant="outline" className="ui-trans ui-press" onClick={() => setIsMobileOpen((value) => !value)} aria-expanded={isMobileOpen} aria-controls="events-filters-mobile">Filters</Button>{isMobileOpen ? <div id="events-filters-mobile" className="mt-2">{bar}</div> : null}</div><div className="hidden md:block">{bar}</div></>;
}
