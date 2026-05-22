import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireRequestUser } from "@/lib/api-auth";
import { canUserAccessProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { inferBlobAccessFromUrl, isBlobConfigured } from "@/lib/blob-storage";

export async function GET(request, { params }) {
  const routeParams = await params;
  const attachmentId = routeParams?.attachmentId;
  if (!attachmentId) {
    return NextResponse.json({ error: "Attachment id is required." }, { status: 400 });
  }

  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const attachment = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      type: true,
      url: true,
      blobPath: true,
      task: {
        select: {
          projectId: true,
        },
      },
    },
  });

  if (!attachment || !attachment.task) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }
  if (attachment.type !== "IMAGE") {
    return NextResponse.json({ error: "Only image attachments can be streamed." }, { status: 400 });
  }

  let canAccess = false;
  try {
    canAccess = await canUserAccessProject(user.id, attachment.task.projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_MODEL_UNAVAILABLE") {
      return NextResponse.json({ error: "Project model is unavailable. Please refresh server runtime." }, { status: 503 });
    }
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!isBlobConfigured()) {
    return NextResponse.json({ error: "Blob storage is not configured on this deployment." }, { status: 503 });
  }

  const urlOrPathname = attachment.blobPath || attachment.url;
  const access = inferBlobAccessFromUrl(attachment.url);

  try {
    const blob = await get(urlOrPathname, { access });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return NextResponse.json({ error: "Attachment content was not found." }, { status: 404 });
    }

    const contentType = blob.blob.contentType || "application/octet-stream";
    return new Response(blob.stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to load attachment." }, { status: 400 });
  }
}
