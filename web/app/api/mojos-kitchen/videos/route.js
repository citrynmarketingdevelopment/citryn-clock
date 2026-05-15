import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  getYouTubeVideoId,
  getYouTubeWatchUrl,
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
} from "@/lib/youtube";

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
  const youtubeVideoId = getYouTubeVideoId(video.fileUrl);
  return {
    id: video.id,
    title: video.title,
    recipientEmail: video.recipientEmail,
    originalFileName: video.originalFileName,
    fileUrl: video.fileUrl,
    youtubeVideoId,
    youtubeEmbedUrl: youtubeVideoId ? getYouTubeEmbedUrl(youtubeVideoId) : null,
    youtubeThumbnailUrl: youtubeVideoId ? getYouTubeThumbnailUrl(youtubeVideoId) : null,
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
      { error: "Mojo's Kitchen models are missing in this deployment. Redeploy so prisma generate runs on build." },
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
      { error: "Mojo's Kitchen models are missing in this deployment. Redeploy so prisma generate runs on build." },
      { status: 503 },
    );
  }

  try {
    const payload = await request.json().catch(() => null);
    const recipientEmail = String(payload?.recipientEmail || "").trim().toLowerCase();
    const titleRaw = String(payload?.title || "").trim();
    const title = titleRaw.length > 0 ? titleRaw.slice(0, 160) : null;
    const youtubeUrlRaw = String(payload?.youtubeUrl || payload?.fileUrl || "").trim();
    const youtubeVideoId = getYouTubeVideoId(youtubeUrlRaw);

    if (!isValidEmail(recipientEmail)) {
      return NextResponse.json({ error: "Recipient email is invalid." }, { status: 400 });
    }
    if (!youtubeVideoId) {
      return NextResponse.json({ error: "Please enter a valid YouTube link." }, { status: 400 });
    }
    const fileUrl = getYouTubeWatchUrl(youtubeVideoId);
    const originalFileName = `youtube:${youtubeVideoId}`;

    const created = await prisma.kitchenVideo.create({
      data: {
        uploaderId: user.id,
        recipientEmail,
        title,
        originalFileName,
        fileUrl,
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
  } catch {
    return NextResponse.json({ error: "Unable to save YouTube link." }, { status: 500 });
  }
}
