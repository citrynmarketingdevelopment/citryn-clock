import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function hasKitchenModels() {
  return (
    typeof prisma.kitchenVideo?.findUnique === "function" &&
    typeof prisma.kitchenVideoComment?.create === "function"
  );
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function serializeVideo(video) {
  return {
    id: video.id,
    title: video.title,
    recipientEmail: video.recipientEmail,
    originalFileName: video.originalFileName,
    fileUrl: video.fileUrl,
    createdAt: video.createdAt,
    comments: (video.comments ?? []).map((comment) => ({
      id: comment.id,
      authorEmail: comment.authorEmail,
      body: comment.body,
      timestampSeconds: comment.timestampSeconds,
      createdAt: comment.createdAt,
    })),
  };
}

export async function GET(_request, { params }) {
  if (!hasKitchenModels()) {
    return NextResponse.json(
      { error: "Mojo's Kitchen is not configured yet. Run prisma generate and prisma db push." },
      { status: 503 },
    );
  }

  try {
    const routeParams = await params;
    const token = routeParams?.token;
    if (!token) {
      return NextResponse.json({ error: "Missing review link token." }, { status: 400 });
    }

    const video = await prisma.kitchenVideo.findUnique({
      where: { shareToken: token },
      include: {
        comments: {
          orderBy: [{ timestampSeconds: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Review link not found." }, { status: 404 });
    }

    return NextResponse.json({ video: serializeVideo(video) });
  } catch {
    return NextResponse.json({ error: "Unable to load review link." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  if (!hasKitchenModels()) {
    return NextResponse.json(
      { error: "Mojo's Kitchen is not configured yet. Run prisma generate and prisma db push." },
      { status: 503 },
    );
  }

  try {
    const routeParams = await params;
    const token = routeParams?.token;
    if (!token) {
      return NextResponse.json({ error: "Missing review link token." }, { status: 400 });
    }

    const payload = await request.json().catch(() => null);
    const authorEmail = String(payload?.authorEmail || "").trim().toLowerCase();
    const body = String(payload?.body || "").trim();
    const rawTimestamp = Number(payload?.timestampSeconds);
    const timestampSeconds = Number.isFinite(rawTimestamp) ? Math.max(0, Math.round(rawTimestamp)) : 0;

    if (!isValidEmail(authorEmail)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
    }
    if (body.length > 2000) {
      return NextResponse.json({ error: "Comment is too long." }, { status: 400 });
    }

    const video = await prisma.kitchenVideo.findUnique({
      where: { shareToken: token },
      select: { id: true },
    });

    if (!video) {
      return NextResponse.json({ error: "Review link not found." }, { status: 404 });
    }

    const comment = await prisma.kitchenVideoComment.create({
      data: {
        kitchenVideoId: video.id,
        authorEmail,
        body,
        timestampSeconds,
      },
    });

    return NextResponse.json(
      {
        comment: {
          id: comment.id,
          authorEmail: comment.authorEmail,
          body: comment.body,
          timestampSeconds: comment.timestampSeconds,
          createdAt: comment.createdAt,
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Unable to submit comment." }, { status: 500 });
  }
}
