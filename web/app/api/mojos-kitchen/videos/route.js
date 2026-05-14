import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isBlobConfigured, uploadPublicBlob } from "@/lib/blob-storage";

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

function hasKitchenModels() {
  return (
    typeof prisma.kitchenVideo?.findMany === "function" &&
    typeof prisma.kitchenVideoComment?.findMany === "function"
  );
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toVideoResponse(video) {
  return {
    id: video.id,
    title: video.title,
    recipientEmail: video.recipientEmail,
    originalFileName: video.originalFileName,
    fileUrl: video.fileUrl,
    shareToken: video.shareToken,
    shareUrl: `/mojos-kitchen/review/${video.shareToken}`,
    createdAt: video.createdAt,
    comments: (video.comments ?? []).map((comment) => ({
      id: comment.id,
      authorEmail: comment.authorEmail,
      body: comment.body,
      timestampSeconds: comment.timestampSeconds,
      createdAt: comment.createdAt,
    })),
    commentCount: video._count?.comments ?? video.comments?.length ?? 0,
  };
}

export async function GET(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasKitchenModels()) {
    return NextResponse.json(
      { error: "Mojo's Kitchen is not configured yet. Run prisma generate and prisma db push." },
      { status: 503 },
    );
  }
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "Blob storage is not configured. Set BLOB_READ_WRITE_TOKEN." },
      { status: 503 },
    );
  }

  try {
    const videos = await prisma.kitchenVideo.findMany({
      where: { uploaderId: user.id },
      include: {
        _count: {
          select: { comments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      videos: videos.map(toVideoResponse),
    });
  } catch {
    return NextResponse.json({ error: "Unable to load videos." }, { status: 500 });
  }
}

export async function POST(request) {
  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!hasKitchenModels()) {
    return NextResponse.json(
      { error: "Mojo's Kitchen is not configured yet. Run prisma generate and prisma db push." },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const video = formData.get("video");
    const recipientEmail = String(formData.get("recipientEmail") || "").trim().toLowerCase();
    const titleRaw = String(formData.get("title") || "").trim();
    const title = titleRaw.length > 0 ? titleRaw.slice(0, 160) : null;

    if (!(video instanceof File)) {
      return NextResponse.json({ error: "Video file is required." }, { status: 400 });
    }
    if (!video.type.startsWith("video/")) {
      return NextResponse.json({ error: "Please upload a valid video file." }, { status: 400 });
    }
    if (video.size <= 0) {
      return NextResponse.json({ error: "Video file is empty." }, { status: 400 });
    }
    if (video.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: "Video is too large. Max size is 250MB for this test page." },
        { status: 400 },
      );
    }
    if (!isValidEmail(recipientEmail)) {
      return NextResponse.json({ error: "Recipient email is invalid." }, { status: 400 });
    }

    const uploaded = await uploadPublicBlob({
      namespace: "mojos-kitchen",
      file: video,
    });

    const created = await prisma.kitchenVideo.create({
      data: {
        uploaderId: user.id,
        recipientEmail,
        title,
        originalFileName: video.name || uploaded.pathname,
        fileUrl: uploaded.url,
        shareToken: randomBytes(24).toString("base64url"),
      },
      include: {
        comments: {
          orderBy: [{ timestampSeconds: "asc" }, { createdAt: "asc" }],
        },
        _count: {
          select: { comments: true },
        },
      },
    });

    return NextResponse.json(
      {
        video: toVideoResponse(created),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BLOB_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Blob storage is not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: "Unable to upload video." }, { status: 500 });
  }
}
