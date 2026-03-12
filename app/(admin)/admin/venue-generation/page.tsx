import { redirect } from "next/navigation";

export default function AdminVenueGenerationRedirect() {
  redirect("/admin/ingest/venue-generation");
}
