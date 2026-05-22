import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/api-auth";
import { canUserAccessProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { isBlobConfigured, uploadBlob } from "@/lib/blob-storage";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(["IMAGE", "LINK"]);

function toTaskPayload(task) {
  return {
    id: task.id,
    projectId: task.projectId,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    laborMinutes: task.laborMinutes,
    priority: task.priority,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    createdById: task.createdById,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    project: task.project ? { id: task.project.id, name: task.project.name } : null,
    column: task.column
      ? {
          id: task.column.id,
          name: task.column.name,
          order: task.column.order,
        }
      : null,
    assignees: (task.assignments ?? []).map((assignment) => ({
      id: assignment.user.id,
      name: assignment.user.name,
      email: assignment.user.email,
    })),
    attachments: (task.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      url: attachment.url,
      label: attachment.label,
      createdById: attachment.createdById,
      createdAt: attachment.createdAt,
    })),
  };
}

function parseHttpUrl(rawValue) {
  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeFormImageFile(value) {
  if (!value) return null;
  if (typeof File !== "undefined" && value instanceof File) {
    return value;
  }
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    if (typeof File === "undefined") return null;
    return new File([value], "attachment", { type: value.type || "application/octet-stream" });
  }
  return null;
}

export async function POST(request, { params }) {
  const routeParams = await params;
  const taskId = routeParams?.taskId;
  if (!taskId) {
    return NextResponse.json({ error: "Task id is required." }, { status: 400 });
  }

  if (typeof prisma.taskAttachment?.create !== "function") {
    return NextResponse.json(
      { error: "Task attachment model is unavailable. Redeploy so prisma generate runs on build." },
      { status: 503 },
    );
  }

  let user;
  try {
    user = await requireRequestUser(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  let canAccess = false;
  try {
    canAccess = await canUserAccessProject(user.id, task.projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_MODEL_UNAVAILABLE") {
      return NextResponse.json({ error: "Project model is unavailable. Please refresh server runtime." }, { status: 503 });
    }
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const typeValue = String(formData.get("type") || "").toUpperCase().trim();
    if (!ALLOWED_ATTACHMENT_TYPES.has(typeValue)) {
      return NextResponse.json({ error: "Attachment type must be IMAGE or LINK." }, { status: 400 });
    }

    const labelRaw = String(formData.get("label") || "").trim();
    const label = labelRaw ? labelRaw.slice(0, 200) : null;

    if (typeValue === "IMAGE") {
      if (!isBlobConfigured()) {
        return NextResponse.json({ error: "Blob storage is not configured on this deployment." }, { status: 503 });
      }

      const file = normalizeFormImageFile(formData.get("file"));
      if (!file) {
        return NextResponse.json({ error: "Image file is required." }, { status: 400 });
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Only image attachments are supported." }, { status: 400 });
      }
      if (file.size < 1 || file.size > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json({ error: "Image size must be between 1 byte and 10MB." }, { status: 400 });
      }

      const upload = await uploadBlob({
        namespace: `task-attachments/${task.projectId}/${task.id}`,
        file,
      });

      await prisma.taskAttachment.create({
        data: {
          taskId: task.id,
          createdById: user.id,
          type: "IMAGE",
          url: upload.url,
          label,
          blobPath: upload.pathname,
        },
      });
    }

    if (typeValue === "LINK") {
      const parsedUrl = parseHttpUrl(String(formData.get("url") || "").trim());
      if (!parsedUrl) {
        return NextResponse.json({ error: "A valid http(s) URL is required for link attachments." }, { status: 400 });
      }

      await prisma.taskAttachment.create({
        data: {
          taskId: task.id,
          createdById: user.id,
          type: "LINK",
          url: parsedUrl,
          label,
          blobPath: null,
        },
      });
    }

    const updatedTask = await prisma.task.findUnique({
      where: { id: task.id },
      include: {
        project: {
          select: { id: true, name: true },
        },
        column: {
          select: { id: true, name: true, order: true },
        },
        assignments: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        attachments: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
    });

    if (!updatedTask) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    return NextResponse.json({ task: toTaskPayload(updatedTask) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "BLOB_NOT_CONFIGURED") {
      return NextResponse.json({ error: "Blob storage is not configured on this deployment." }, { status: 503 });
    }
    if (error instanceof Error && error.message) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to add attachment." }, { status: 400 });
  }
}
