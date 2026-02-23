import { apiError } from "@/lib/api";
import { handleCalendarEventsGet } from "@/lib/calendar/calendar-events";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    return await handleCalendarEventsGet(req);
  } catch {
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
