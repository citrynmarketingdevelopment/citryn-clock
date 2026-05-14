import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

function hasKitchenModels() {
  return typeof prisma.kitchenVideo?.findFirst === "function";
}

function toCommentResponse(comment) {
  return {
    id: comment.id,
    authorEmail: comment.authorEmail,
    body: comment.body,
    timestampSeconds: comment.timestampSeconds,
    createdAt: comment.createdAt,
  };
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
    comments: (video.comments ?? []).map(toCommentResponse),
    commentCount: video._count?.comments ?? video.comments?.length ?? 0,
  };
}

export async function GET(request, { params }) {
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
    const routeParams = await params;
    const videoId = routeParams?.videoId;
    if (!videoId) {
      return NextResponse.json({ error: "Video id is required." }, { status: 400 });
    }

    const video = await prisma.kitchenVideo.findFirst({
      where: {
        id: videoId,
        uploaderId: user.id,
      },
      include: {
        comments: {
          orderBy: [{ timestampSeconds: "asc" }, { createdAt: "asc" }],
        },
        _count: {
          select: {
            comments: true,
          },
        },
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    return NextResponse.json({
      video: toVideoResponse(video),
    });
  } catch {
    return NextResponse.json({ error: "Unable to load video." }, { status: 500 });
  }
}
