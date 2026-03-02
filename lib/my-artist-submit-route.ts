import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { evaluateArtistReadiness } from "@/lib/publish-readiness";
import { artistSubmitBodySchema, parseBody, zodDetails } from "@/lib/validators";
import { RATE_LIMITS, enforceRateLimit, isRateLimitError, principalRateLimitKey, rateLimitErrorResponse } from "@/lib/rate-limit";
import { buildInAppFromTemplate, enqueueNotification } from "@/lib/notifications";
import { submissionSubmittedDedupeKey } from "@/lib/notification-keys";
import type { ContentStatus } from "@prisma/client";

type SessionUser = { id: string; email: string };
type SubmissionStatus = ContentStatus | null;

type ArtistRecord = { id: string; slug: string; name: string; bio: string | null; websiteUrl: string | null; featuredAssetId: string | null; featuredImageUrl: string | null; images: Array<{ id: string }>; isPublished?: boolean };
type SubmissionRecord = { id: string; status: string; createdAt: Date; submittedAt: Date | null };

type SubmitArtistDeps = {
  requireAuth: () => Promise<SessionUser>;
  findOwnedArtistByUserId: (userId: string) => Promise<ArtistRecord | null>;
  getLatestSubmissionStatus: (artistId: string) => Promise<SubmissionStatus | null>;
  createSubmission: (input: { artistId: string; userId: string; message?: string; snapshot: { name: string; bioExcerpt: string; coverUrl: string | null; websiteUrl: string | null; slug: string } }) => Promise<SubmissionRecord>;
  enqueueSubmissionNotification?: (input: { userId: string; email: string; submissionId: string; status: string; submittedAt: Date | null; artistId: string }) => Promise<void>;
};

export async function handleMyArtistSubmit(req: NextRequest, deps: SubmitArtistDeps) {
  try {
    const user = await deps.requireAuth();
    await enforceRateLimit({ key: principalRateLimitKey(req, "artist-submit", user.id), limit: RATE_LIMITS.artistSubmitWrite.limit, windowMs: RATE_LIMITS.artistSubmitWrite.windowMs });

    const parsedBody = artistSubmitBodySchema.safeParse(await parseBody(req));
    if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

    const artist = await deps.findOwnedArtistByUserId(user.id);
    if (!artist) return apiError(403, "forbidden", "Artist ownership required");

    const latestStatus = await deps.getLatestSubmissionStatus(artist.id);
    if (latestStatus === "IN_REVIEW") return NextResponse.json({ error: "ALREADY_SUBMITTED", message: "Submission is already pending review." }, { status: 409 });
    if (latestStatus === "APPROVED" && artist.isPublished) return NextResponse.json({ error: "ALREADY_APPROVED", message: "Artist is already approved and published." }, { status: 409 });

    const readiness = evaluateArtistReadiness(artist);
    if (!readiness.ready) {
      console.warn("FAIL_REASON=NOT_READY entity=artist");
      return NextResponse.json({ error: "NOT_READY", message: "Complete required fields before submitting.", blocking: readiness.blocking, warnings: readiness.warnings }, { status: 400 });
    }

    const submission = await deps.createSubmission({ artistId: artist.id, userId: user.id, message: parsedBody.data.message, snapshot: { name: artist.name, bioExcerpt: (artist.bio ?? "").slice(0, 160), coverUrl: artist.featuredImageUrl, websiteUrl: artist.websiteUrl, slug: artist.slug } });
    if (deps.enqueueSubmissionNotification) await deps.enqueueSubmissionNotification({ userId: user.id, email: user.email, submissionId: submission.id, status: submission.status, submittedAt: submission.submittedAt, artistId: artist.id });
    else await enqueueNotification({ type: "SUBMISSION_SUBMITTED", toEmail: user.email, dedupeKey: submissionSubmittedDedupeKey(submission.id), payload: { submissionId: submission.id, status: submission.status, submittedAt: submission.submittedAt?.toISOString() ?? null }, inApp: buildInAppFromTemplate(user.id, "SUBMISSION_SUBMITTED", { type: "SUBMISSION_SUBMITTED", submissionId: submission.id, submissionType: "ARTIST", targetArtistId: artist.id }) });

    return NextResponse.json({ submission: { id: submission.id, status: submission.status, createdAt: submission.createdAt.toISOString() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isRateLimitError(error)) return rateLimitErrorResponse(error);
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
