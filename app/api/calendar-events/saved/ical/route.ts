import { handleIcalSavedGet } from "@/lib/calendar/ical-saved-route";

export const runtime = "nodejs";

export async function GET() {
  return handleIcalSavedGet();
}
