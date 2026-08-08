import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { getDb, schema } from "~/db";
import { generateHashUploadPlan, getObjectContentHash } from "~/lib/r2";
import { and, eq, isNull } from "drizzle-orm";

/**
 * POST /api/upload - Generate presigned URLs for file upload
 * Requires authentication
 *
 * Body: {
 *   contentHash: string
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
  const { contentHash, contentType, sourceFilename } = body;

  if (typeof contentHash !== "string" || !/^[a-f0-9]{64}$/.test(contentHash)) {
    return json(
      { error: "A lowercase SHA-256 contentHash is required" },
      { status: 400 },
    );
  }

  if (
    typeof contentType !== "string" ||
    (!contentType.startsWith("image/") && contentType !== "application/octet-stream")
  ) {
    return json({ error: "A valid image contentType is required" }, { status: 400 });
  }

  try {
    const db = getDb();
    const existingPhoto = await db.query.photos.findFirst({
      where: eq(schema.photos.contentHash, contentHash),
    });

    if (existingPhoto) {
      return json({ duplicate: true, photo: existingPhoto });
    }

    // Opportunistically identify legacy, name-keyed objects by their bytes.
    // A same-name but different image is left untouched and gets a hash key.
    if (typeof sourceFilename === "string" && sourceFilename.length > 0) {
      const legacyPhoto = await db.query.photos.findFirst({
        where: and(
          eq(schema.photos.url, sourceFilename),
          isNull(schema.photos.contentHash),
        ),
      });

      if (legacyPhoto) {
        try {
          const legacyHash = await getObjectContentHash(legacyPhoto.url);
          if (legacyHash === contentHash) {
            const [updatedPhoto] = await db
              .update(schema.photos)
              .set({ contentHash })
              .where(eq(schema.photos.id, legacyPhoto.id))
              .returning();
            return json({ duplicate: true, photo: updatedPhoto });
          }
        } catch (error) {
          console.warn("Failed to hash legacy R2 object:", error);
        }
      }
    }

    return json(await generateHashUploadPlan(contentHash, contentType));
  } catch (error) {
    console.error("Failed to generate upload URLs:", error);
    return json({ error: "Failed to generate upload URLs" }, { status: 500 });
  }
}
