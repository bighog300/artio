import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { logAdminAction } from "@/lib/admin-audit";
import { idParamSchema, parseBody, zodDetails } from "@/lib/validators";

const venuePatchSchema = z.object({
  description: z.string().trim().min(1).nullable().optional(),
  openingHours: z.string().trim().min(1).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  instagramUrl: z.string().trim().url().nullable().optional(),
  facebookUrl: z.string().trim().url().nullable().optional(),
}).strict();

type AdminVenuePatchDeps = {
  appDb: Pick<typeof db, "venue">;
  logAction: typeof logAdminAction;
};

const defaultDeps: AdminVenuePatchDeps = {
  appDb: db,
  logAction: logAdminAction,
};

export async function handleAdminVenuePatch(
  req: Request,
  params: { id?: string },
  actorEmail: string,
  deps: Partial<AdminVenuePatchDeps> = {},
) {
  const resolved = { ...defaultDeps, ...deps };

  const parsedId = idParamSchema.safeParse(params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  const parsedBody = venuePatchSchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));
  const { openingHours, ...rest } = parsedBody.data;

  const venuePatchData: {
    description?: string | null;
    openingHours?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    contactEmail?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
  } = {
    ...rest,
    ...(openingHours === undefined
      ? {}
      : openingHours === null
        ? { openingHours: Prisma.JsonNull }
        : { openingHours: { raw: openingHours } }),
  };

  const existing = await resolved.appDb.venue.findUnique({
    where: { id: parsedId.data.id },
    select: { id: true },
  });
  if (!existing) return apiError(404, "not_found", "Venue not found");

  await resolved.appDb.venue.update({
    where: { id: parsedId.data.id },
    data: venuePatchData,
  });

  await resolved.logAction({
    actorEmail,
    action: "admin.venue.patch",
    targetType: "venue",
    targetId: parsedId.data.id,
    metadata: parsedBody.data,
    req,
  });

  return Response.json({ ok: true });
}
