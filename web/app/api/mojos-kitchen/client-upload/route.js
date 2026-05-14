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
  if (!isBlobConfigured()) {
    return NextResponse.json({ error: "Blob storage is not configured." }, { status: 503 });
  }

  const body = await request.json();
  const isGenerateTokenRequest = body?.type === "blob.generate-client-token";
  let uploaderUserId = null;

  if (isGenerateTokenRequest) {
    try {
      const user = await requireRequestUser(request);
      uploaderUserId = user.id;
    } catch {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  try {
    const jsonResponse = await handleUpload({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!uploaderUserId) {
          throw new Error("Unauthorized.");
        }
        if (!pathname || !pathname.startsWith("mojos-kitchen/")) {
          throw new Error("Invalid upload path.");
        }

        return {
          addRandomSuffix: true,
          callbackUrl: `${new URL(request.url).origin}/api/mojos-kitchen/client-upload`,
          allowedContentTypes: ALLOWED_VIDEO_TYPES,
          tokenPayload: JSON.stringify({
            userId: uploaderUserId,
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
