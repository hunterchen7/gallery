import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { generateUploadUrls } from "~/lib/r2";

/**
 * POST /api/upload - Generate presigned URLs for file upload
 * Requires authentication
 *
 * Body: {
 *   filename: string,
 *   thumbnailFilename: string
 * }
 *
 * Returns: {
 *   imageUrl: string,
 *   thumbnailUrl: string
 * }
 */
export async function POST(event: APIEvent) {
  const authKey = event.request.headers.get("X-Auth-Key");
  const expectedKey = process.env.API_KEY;

  if (!authKey || authKey !== expectedKey) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await event.request.json();
  const { filename, thumbnailFilename } = body;

  if (!filename || !thumbnailFilename) {
    return json(
      { error: "filename and thumbnailFilename are required" },
      { status: 400 },
    );
  }

  try {
    const urls = await generateUploadUrls(filename, thumbnailFilename);
    return json(urls);
  } catch (error) {
    console.error("Failed to generate upload URLs:", error);
    return json({ error: "Failed to generate upload URLs" }, { status: 500 });
  }
}
