import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { isSendLayerConfigured, sendKitchenReviewEmail } from "@/lib/sendlayer";

function hasKitchenModels() {
  return typeof prisma.kitchenVideo?.findFirst === "function";
}

export async function POST(request, { params }) {
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

  if (!isSendLayerConfigured()) {
    return NextResponse.json(
      { error: "SendLayer is not configured. Set SENDLAYER_API_KEY and SENDLAYER_FROM_EMAIL." },
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
      select: {
        id: true,
        title: true,
        originalFileName: true,
        recipientEmail: true,
        shareToken: true,
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    const origin = new URL(request.url).origin;
    const reviewUrl = `${origin}/mojos-kitchen/review/${video.shareToken}`;
    const videoTitle = video.title || video.originalFileName;

    const providerResponse = await sendKitchenReviewEmail({
      toEmail: video.recipientEmail,
      videoTitle,
      reviewUrl,
    });

    return NextResponse.json({
      ok: true,
      providerResponse,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send email.";
    return NextResponse.json({ error: message || "Unable to send email." }, { status: 500 });
  }
}
