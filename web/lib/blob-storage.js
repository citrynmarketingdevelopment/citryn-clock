import path from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

function sanitizeSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function normalizeAccess(value) {
  if (value === "public" || value === "private") {
    return value;
  }
  return "public";
}

function inferFallbackAccess(errorMessage, attemptedAccess) {
  const message = String(errorMessage || "").toLowerCase();
  if (attemptedAccess === "public" && message.includes("private store")) {
    return "private";
  }
  if (attemptedAccess === "private" && message.includes("public store")) {
    return "public";
  }
  return null;
}

export function inferBlobAccessFromUrl(url) {
  const normalized = String(url || "");
  if (normalized.includes(".private.blob.vercel-storage.com")) {
    return "private";
  }
  return "public";
}

export async function uploadBlob({ namespace, file }) {
  if (!isBlobConfigured()) {
    throw new Error("BLOB_NOT_CONFIGURED");
  }
  if (!(file instanceof File)) {
    throw new Error("INVALID_FILE");
  }

  const extension = path.extname(file.name || "").toLowerCase();
  const safeExtension = /^\.[a-z0-9]+$/.test(extension) ? extension : "";
  const safeName = sanitizeSegment(path.basename(file.name || "upload", extension)) || "upload";
  const pathname = `${namespace}/${safeName}-${randomUUID()}${safeExtension}`;
  const preferredAccess = normalizeAccess(process.env.BLOB_ACCESS);

  try {
    const blob = await put(pathname, file, {
      access: preferredAccess,
      addRandomSuffix: false,
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
      access: preferredAccess,
    };
  } catch (error) {
    const fallbackAccess = inferFallbackAccess(error instanceof Error ? error.message : "", preferredAccess);
    if (!fallbackAccess) {
      throw error;
    }

    const blob = await put(pathname, file, {
      access: fallbackAccess,
      addRandomSuffix: false,
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
      access: fallbackAccess,
    };
  }
}
