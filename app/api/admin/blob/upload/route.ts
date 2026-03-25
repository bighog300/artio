import { NextRequest, NextResponse } from "next/server";
import { type HandleUploadBody } from "@vercel/blob/client";
import { handleAdminBlobUpload } from "@/lib/admin-blob-upload-route";

export const runtime = "nodejs";

// Transitional compatibility wrapper for older admin upload clients.
// Keep stable until all callers migrate to centralized asset upload endpoints.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const jsonResponse = await handleAdminBlobUpload(req, body);
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
