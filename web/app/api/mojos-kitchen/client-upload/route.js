import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";
import { requireRequestUser } from "@/lib/api-auth";
import { isBlobConfigured } from "@/lib/blob-storage";

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/x-msvideo",
  "video/mpeg",
  "video/ogg",
];

export async function POST(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isBlobConfigured()) {
    return NextResponse.json({ error: "Blob storage is not configured." }, { status: 503 });
  }

  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname || !pathname.startsWith("mojos-kitchen/")) {
          throw new Error("Invalid upload path.");
        }

        return {
          access: "public",
          addRandomSuffix: true,
          allowedContentTypes: ALLOWED_VIDEO_TYPES,
          tokenPayload: JSON.stringify({
            userId: user.id,
          }),
        };
      },
      onUploadCompleted: async () => {
        // DB record is created by the app after upload completes.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload file." },
      { status: 400 },
    );
  }
}
