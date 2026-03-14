import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin";
import { getServerBaseUrl } from "@/lib/server/get-base-url";
import AdminPageHeader from "../_components/AdminPageHeader";
import ArtworkInquiriesClient from "./inquiries-client";

type InquiryRow = {
  id: string;
  createdAt: string;
  buyerName: string;
  buyerEmail: string;
  message: string | null;
  artwork: {
    title: string;
    slug: string | null;
  };
};

type InquiriesPayload = {
  inquiries: InquiryRow[];
  thirtyDayCount: number;
};

async function fetchInquiries(): Promise<{ inquiries: InquiryRow[]; thirtyDayCount: number }> {
  const baseUrl = await getServerBaseUrl();
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";

  const res = await fetch(`${baseUrl}/api/admin/artwork/inquiries`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  if (!res.ok) return { inquiries: [], thirtyDayCount: 0 };

  const payload = (await res.json()) as InquiriesPayload;

  return {
    inquiries: payload.inquiries,
    thirtyDayCount: payload.thirtyDayCount,
  };
}

export const dynamic = "force-dynamic";

export default async function AdminArtworkInquiriesPage() {
  await requireAdmin({ redirectOnFail: true });
  const data = await fetchInquiries();

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Artwork Enquiries" description="Buyer messages submitted from artwork pages." />
      <ArtworkInquiriesClient inquiries={data.inquiries} thirtyDayCount={data.thirtyDayCount} />
    </main>
  );
}
