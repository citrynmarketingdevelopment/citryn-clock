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

export async function uploadPublicBlob({ namespace, file }) {
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

  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: false,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
  };
}
