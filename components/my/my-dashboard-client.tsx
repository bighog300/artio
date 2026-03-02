"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CreateVenueForm } from "@/app/my/venues/_components/CreateVenueForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { enqueueToast } from "@/lib/toast";

type EventPipelineItem = {
  id: string;
  title: string;
  startAtISO: string | null;
  venueName: string | null;
  statusLabel: string | null;
  submissionStatus?: string | null;
  submittedAtISO?: string | null;
  decidedAtISO?: string | null;
  feedback?: string | null;
  isPublished?: boolean | null;
  featuredAssetId?: string | null;
  featuredImageUrl?: string | null;
};

type DashboardPayload = {
  needsOnboarding?: boolean;
  message?: string;
  nextHref?: string;
  viewer?: { role: "USER" | "EDITOR" | "ADMIN" };
  stats: {
    artworks: { total: number; published: number; drafts: number; missingCover: number };
    events: { total: number; upcoming30: number; drafts: number; missingVenue: number; nextEvent?: { id: string; title: string; startAtISO: string; venueName?: string | null } };
    venues: { totalManaged: number; published: number; drafts: number; submissionsPending: number };
    views: { last7: number; last30: number; last90: number };
    profile: { completenessPct: number; missing: string[] };
  };
  entities: {
    venues: Array<{ id: string; slug?: string | null; name: string; city?: string | null; country?: string | null; isPublished: boolean; coverUrl?: string | null; submissionStatus?: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | null }>;
  };
  eventsPipeline?: {
    items: EventPipelineItem[];
  };
  venuesQuickPick?: Array<{ id: string; name: string }>;
  actionInbox: Array<{ id: string; label: string; count: number; href: string; severity: "info" | "warn" }>;
  topArtworks30: Array<{ id: string; slug?: string | null; title: string; coverUrl?: string | null; views30: number }>;
  recent: Array<{ label: string; href: string; occurredAtISO: string }>;
  links: {
    addArtworkHref: string;
    addEventHref: string;
    analyticsHref: string;
    artworksHref: string;
    eventsHref: string;
    artistHref: string;
    venuesHref: string;
    venuesNewHref: string;
  };
  publisher?: {
    approval?: {
      showBanner?: boolean;
    };
  };
};

function getVenueStatus(venue: DashboardPayload["entities"]["venues"][number]) {
  if (venue.submissionStatus === "IN_REVIEW") return "Submitted";
  if (venue.submissionStatus === "REJECTED") return "Needs edits";
  if (venue.isPublished) return "Published";
  return "Draft";
}

function formatEventDate(startAtISO: string | null) {
  if (!startAtISO) return null;
  const date = new Date(startAtISO);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatFeedback(feedback: string | null | undefined) {
  if (!feedback) return null;
  const compact = feedback.replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length > 140 ? `${compact.slice(0, 140).trimEnd()}…` : compact;
}

function getEventSubmissionState(event: EventPipelineItem) {
  const submissionStatus = event.submissionStatus ?? null;
  const changesRequestedStatuses = new Set(["REJECTED", "CHANGES_REQUESTED", "NEEDS_CHANGES"]);

  if (submissionStatus === "IN_REVIEW") {
    return {
      label: "Submitted",
      meta: event.submittedAtISO ? `Submitted ${formatEventDate(event.submittedAtISO)}` : null,
      feedback: null,
      showPublished: false,
      showSubmitAction: false,
      showResubmitAction: false,
      showFeedbackAction: false,
    };
  }
  if (submissionStatus === "APPROVED") {
    return {
      label: "Approved",
      meta: event.decidedAtISO ? `Approved ${formatEventDate(event.decidedAtISO)}` : null,
      feedback: null,
      showPublished: Boolean(event.isPublished),
      showSubmitAction: false,
      showResubmitAction: false,
      showFeedbackAction: false,
    };
  }
  if (submissionStatus && changesRequestedStatuses.has(submissionStatus)) {
    return {
      label: "Changes requested",
      meta: event.decidedAtISO ? `Reviewed ${formatEventDate(event.decidedAtISO)}` : null,
      feedback: formatFeedback(event.feedback),
      showPublished: false,
      showSubmitAction: false,
      showResubmitAction: true,
      showFeedbackAction: true,
    };
  }

  return {
    label: "Draft",
    meta: null,
    feedback: null,
    showPublished: Boolean(event.isPublished),
    showSubmitAction: !event.isPublished,
    showResubmitAction: false,
    showFeedbackAction: false,
  };
}

function getFixNowHint(
  event: EventPipelineItem,
  submissionState: ReturnType<typeof getEventSubmissionState>,
): { text: string; tone: "info" | "warn" | "neutral" } | null {
  const isMissingScheduleDetails = !event.startAtISO || !event.venueName;
  const isDraft = submissionState.label === "Draft";
  const needsImage = isDraft && !event.featuredAssetId;
  const changesRequested = submissionState.showResubmitAction;
  const inReview = submissionState.label === "Submitted";
  const approvedNotPublished = submissionState.label === "Approved" && !event.isPublished;
  const isPublished = submissionState.showPublished;

  if (changesRequested) {
    return { text: "Fix now: Address reviewer feedback, then Resubmit.", tone: "warn" };
  }

  if (isDraft && needsImage) {
    if (isMissingScheduleDetails) {
      return { text: "Fix now: Set venue and date/time, then Add image and Submit.", tone: "warn" };
    }
    return { text: "Fix now: Add a featured image, then Submit.", tone: "warn" };
  }

  if (isDraft && submissionState.showSubmitAction) {
    if (isMissingScheduleDetails) {
      return { text: "Fix now: Set venue and date/time, then Submit.", tone: "warn" };
    }
    return { text: "Fix now: Submit for review.", tone: "info" };
  }

  if (inReview) {
    return { text: "In review: We’ll notify you once it’s approved or changes are requested.", tone: "neutral" };
  }

  if (approvedNotPublished) {
    return { text: "Approved: awaiting publish.", tone: "neutral" };
  }

  if (isPublished) {
    return null;
  }

  return null;
}

export function MyDashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [publisherApprovalDismissed, setPublisherApprovalDismissed] = useState(true);
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const [submittingEventId, setSubmittingEventId] = useState<string | null>(null);
  const [activeUploadEventId, setActiveUploadEventId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/my/dashboard", { cache: "no-store" });
    const payload = await response.json() as DashboardPayload;
    setData(payload);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!window.localStorage.getItem("publisherApprovalDismissed")) {
      setPublisherApprovalDismissed(false);
    }
  }, []);

  const dismissPublisherApprovalBanner = useCallback(() => {
    window.localStorage.setItem("publisherApprovalDismissed", "1");
    setPublisherApprovalDismissed(true);
  }, []);

  const openUploadPicker = useCallback((eventId: string) => {
    setActiveUploadEventId(eventId);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  const uploadFeaturedImage = useCallback(async (eventId: string, file: File) => {
    setUploadingEventId(eventId);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploadResponse = await fetch("/api/uploads/image", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const body = await uploadResponse.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Image upload failed");
      }

      const uploaded = await uploadResponse.json() as { assetId?: string };
      if (!uploaded.assetId) {
        throw new Error("Image upload failed");
      }

      const patchResponse = await fetch(`/api/my/events/${eventId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ featuredAssetId: uploaded.assetId }),
      });

      if (!patchResponse.ok) {
        const body = await patchResponse.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Failed to update event image");
      }

      enqueueToast({ title: "Event featured image added", variant: "success" });
      await load();
      router.refresh();
    } catch (error) {
      enqueueToast({ title: error instanceof Error ? error.message : "Failed to add image", variant: "error" });
    } finally {
      setUploadingEventId(null);
      setActiveUploadEventId(null);
    }
  }, [load, router]);

  const onInlineUploadSelected = useCallback(async (file: File | null) => {
    if (!file || !activeUploadEventId) return;
    await uploadFeaturedImage(activeUploadEventId, file);
  }, [activeUploadEventId, uploadFeaturedImage]);

  const submitEventForReview = useCallback(async (eventId: string, successTitle = "Submitted for review") => {
    setSubmittingEventId(eventId);
    try {
      const response = await fetch(`/api/my/events/${eventId}/submit`, { method: "POST" });
      const responseText = await response.text();
      let responseBody: { message?: string; error?: string | { message?: string } } | null = null;

      if (responseText) {
        try {
          responseBody = JSON.parse(responseText) as { message?: string; error?: string | { message?: string } };
        } catch {
          responseBody = null;
        }
      }

      if (!response.ok) {
        const errorMessage = responseBody?.message
          || (typeof responseBody?.error === "string" ? responseBody.error : responseBody?.error?.message)
          || responseText
          || "Failed to submit event";
        throw new Error(errorMessage);
      }

      enqueueToast({ title: successTitle, variant: "success" });
      await load();
      router.refresh();
    } catch (error) {
      enqueueToast({ title: error instanceof Error ? error.message : "Failed to submit event", variant: "error" });
    } finally {
      setSubmittingEventId(null);
    }
  }, [load, router]);

  if (loading) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, idx) => <Skeleton key={idx} className="h-32 w-full" />)}</div>;
  if (!data) return null;

  const ownedCount = data.stats.venues.totalManaged ?? 0;
  const venueLimit = 3;
  const atVenueLimit = ownedCount >= venueLimit;
  const canManageEvents = data.viewer?.role !== "USER";
  const showInlineVenueCreate = canManageEvents && ownedCount === 0 && !atVenueLimit;

  if (data.needsOnboarding) {
    return (
      <Card>
        <CardHeader><CardTitle>Welcome to Publisher Dashboard</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{data.message}</p>
          <Button asChild><Link href={data.nextHref || "/my/artist"}>Set up artist profile</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {data.publisher?.approval?.showBanner && !publisherApprovalDismissed ? (
        <Card>
          <CardHeader>
            <CardTitle>Publisher access approved</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">You can now create venues, events, and artworks.</p>
            <div className="flex flex-wrap gap-2">
              {atVenueLimit ? <Button type="button" disabled>Create venue</Button> : <Button asChild><Link href="/my/venues/new">Create venue</Link></Button>}
              <Button asChild><Link href="/my/events/new">Create event</Link></Button>
              <Button asChild><Link href="/my/artwork/new">Create artwork</Link></Button>
              <Button type="button" variant="outline" onClick={dismissPublisherApprovalBanner}>Dismiss</Button>
            </div>
            {atVenueLimit ? <p className="text-xs text-muted-foreground">You&apos;ve reached the 3 venue limit. Manage an existing venue to continue.</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-base">Artworks</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.stats.artworks.total}</p><p className="text-xs text-muted-foreground">{data.stats.artworks.published} published · {data.stats.artworks.drafts} drafts</p><div className="mt-2 flex items-center gap-2"><Badge variant="secondary">Missing cover: {data.stats.artworks.missingCover}</Badge></div><Link className="mt-2 block text-sm underline" href={data.links.artworksHref}>Manage artworks</Link></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Events</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.stats.events.total}</p><p className="text-xs text-muted-foreground">{data.stats.events.upcoming30} in next 30 days</p><div className="mt-2 flex items-center gap-2"><Badge variant="secondary">Missing venue: {data.stats.events.missingVenue}</Badge></div><Link className="mt-2 block text-sm underline" href={data.links.eventsHref}>Manage events</Link></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Views (30d)</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.stats.views.last30}</p><p className="text-xs text-muted-foreground">7d: {data.stats.views.last7} · 90d: {data.stats.views.last90}</p><Link className="mt-2 block text-sm underline" href={data.links.analyticsHref}>View analytics</Link></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.stats.profile.completenessPct}%</p><p className="text-xs text-muted-foreground">Missing: {data.stats.profile.missing.join(", ") || "None"}</p><Link className="mt-2 block text-sm underline" href={data.links.artistHref}>Update profile</Link></CardContent></Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>My venues ({ownedCount}/{venueLimit})</CardTitle>
          <Link className="text-sm underline" href={data.links.venuesHref}>View all venues</Link>
        </CardHeader>
        <CardContent>
          {data.entities.venues.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 sm:p-5">
              <p className="font-medium">Create your first venue</p>
              <p className="mt-1 text-sm text-muted-foreground">Add your venue so you can publish events and manage your profile.</p>
              {showInlineVenueCreate ? (
                <div className="mt-4 space-y-2">
                  <CreateVenueForm buttonLabel="+ Create venue" />
                  <p className="text-xs text-muted-foreground">
                    Prefer the full page editor? <Link className="underline" href={data.links.venuesNewHref}>Open it here</Link>.
                  </p>
                </div>
              ) : atVenueLimit ? (
                <Button type="button" className="mt-4" disabled>+ Create venue</Button>
              ) : (
                <Button asChild className="mt-4"><Link href={data.links.venuesNewHref}>+ Create venue</Link></Button>
              )}
              {atVenueLimit ? <p className="mt-2 text-xs text-muted-foreground">You&apos;ve reached the 3 venue limit. Manage an existing venue to continue.</p> : null}
            </div>
          ) : (
            <ul className="space-y-2">
              {data.entities.venues.map((venue) => (
                <li key={venue.id}>
                  <Link href={`/my/venues/${venue.id}`} className="flex items-center gap-3 rounded-md border p-2 transition-colors hover:bg-muted/50 sm:p-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted sm:h-12 sm:w-12">
                      {venue.coverUrl ? <img src={venue.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{venue.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{[venue.city, venue.country].filter(Boolean).join(", ") || "Location not set"}</p>
                    </div>
                    <Badge variant="secondary">{getVenueStatus(venue)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManageEvents ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Events pipeline</CardTitle>
            <Link className="text-sm underline" href={data.links.eventsHref}>View all events</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.stats.events.nextEvent ? (
              <p className="text-sm text-muted-foreground">
                Next event:{" "}
                <Link className="underline" href={`/my/events/${data.stats.events.nextEvent.id}`}>
                  {data.stats.events.nextEvent.title}
                </Link>
              </p>
            ) : null}
            {(data.eventsPipeline?.items.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed p-4">
                <p className="text-sm text-muted-foreground">No events yet. Create your first event.</p>
                <Button asChild className="mt-3"><Link href={data.links.addEventHref}>Create event</Link></Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {data.eventsPipeline?.items.slice(0, 5).map((event) => {
                  const submissionState = getEventSubmissionState(event);
                  const isDraftWithoutImage = submissionState.label === "Draft" && !event.featuredAssetId;
                  const fixNowHint = getFixNowHint(event, submissionState);
                  const isUploading = uploadingEventId === event.id;
                  const isSubmitting = submittingEventId === event.id;

                  return (
                    <li key={event.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium">{event.title}</p>
                        <p className="text-xs text-muted-foreground">{[formatEventDate(event.startAtISO), event.venueName].filter(Boolean).join(" · ") || "Date or venue not set"}</p>
                        {fixNowHint ? (
                          <p
                            className={`text-xs ${
                              fixNowHint.tone === "warn"
                                ? "font-medium text-foreground"
                                : fixNowHint.tone === "neutral"
                                  ? "text-muted-foreground"
                                  : "text-foreground/80"
                            }`}
                          >
                            {fixNowHint.text}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{submissionState.label}</Badge>
                          {submissionState.showPublished ? <Badge variant="secondary">Published</Badge> : null}
                          {submissionState.meta ? <span className="text-xs text-muted-foreground">{submissionState.meta}</span> : null}
                          {event.featuredImageUrl ? (
                            <img
                              src={event.featuredImageUrl}
                              alt=""
                              className="h-6 w-6 rounded object-cover"
                            />
                          ) : null}
                          {isDraftWithoutImage ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isUploading || isSubmitting}
                              onClick={() => openUploadPicker(event.id)}
                              aria-label={`Add image for ${event.title}`}
                            >
                              {isUploading ? "Uploading..." : "Add image"}
                            </Button>
                          ) : null}
                          {submissionState.showSubmitAction ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isUploading || isSubmitting}
                              onClick={() => {
                                void submitEventForReview(event.id);
                              }}
                            >
                              {isSubmitting ? "Submitting..." : "Submit"}
                            </Button>
                          ) : null}
                          {submissionState.showResubmitAction ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={isUploading || isSubmitting}
                              onClick={() => {
                                void submitEventForReview(event.id, "Resubmitted");
                              }}
                            >
                              {isSubmitting ? "Submitting..." : "Resubmit"}
                            </Button>
                          ) : null}
                        </div>
                        {submissionState.feedback ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">Feedback: {submissionState.feedback}</p>
                        ) : null}
                        {submissionState.showFeedbackAction ? (
                          <p className="text-xs"><Link className="underline" href={`/my/events/${event.id}`}>View feedback</Link></p>
                        ) : null}
                      </div>
                      <Link
                        className="shrink-0 text-sm underline"
                        href={`/my/events/${event.id}`}
                        aria-disabled={isUploading || isSubmitting}
                        onClick={(eventClick) => {
                          if (isUploading || isSubmitting) {
                            eventClick.preventDefault();
                          }
                        }}
                      >
                        Edit
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild><Link href={data.links.addEventHref}>Create event</Link></Button>
              {data.venuesQuickPick?.map((venue) => (
                <Button key={venue.id} asChild variant="outline" size="sm">
                  <Link href={`${data.links.addEventHref}?venueId=${encodeURIComponent(venue.id)}`}>Create for {venue.name}</Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          void onInlineUploadSelected(event.target.files?.[0] ?? null);
        }}
      />

      <Card>
        <CardHeader><CardTitle>To do</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.actionInbox.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant={item.severity === "warn" ? "destructive" : "secondary"}>{item.count}</Badge>
                  <span className="text-sm">{item.label}</span>
                </div>
                <Link className="text-sm underline" href={item.href}>Fix</Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recent.map((item) => (
                <li key={`${item.href}-${item.occurredAtISO}`} className="text-sm">
                  <Link className="underline" href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top artworks (30d)</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.topArtworks30.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link className="underline" href={`/artwork/${item.slug || item.id}`}>{item.title}</Link>
                  <span className="text-muted-foreground">{item.views30} views</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
