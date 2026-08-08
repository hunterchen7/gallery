import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "~/db";
import { getR2Object } from "~/lib/r2";

function extensionFor(contentType: string | null) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/avif") return "avif";
  if (contentType === "image/heic" || contentType === "image/heif") return "heic";
  return "jpg";
}

export async function GET(event: APIEvent) {
  const db = getDb();
  const photo = await db.query.photos.findFirst({
    where: eq(schema.photos.id, event.params.id),
  });
  if (!photo) return new Response("Photo not found", { status: 404 });

  const object = await getR2Object(photo.url);
  if (!object.ok || !object.body) {
    return new Response("Photo download failed", { status: object.status });
  }

  const contentType = object.headers.get("Content-Type");
  const originalName = photo.url.split("/").pop() || "photo";
  const filename = /\.[a-z0-9]{2,5}$/i.test(originalName)
    ? originalName
    : `photo-${photo.id}.${extensionFor(contentType)}`;
  const headers = new Headers({
    "Content-Type": contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, max-age=3600",
  });
  const contentLength = object.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(object.body, { headers });
}
