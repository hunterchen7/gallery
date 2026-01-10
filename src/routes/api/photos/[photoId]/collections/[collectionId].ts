import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { getDb, schema } from "~/db";
import { eq, and } from "drizzle-orm";

/**
 * DELETE /api/photos/[photoId]/collections/[collectionId] - Remove a photo from a collection
 * Requires authentication
 */
export async function DELETE(event: APIEvent) {
  const authKey = event.request.headers.get("X-Auth-Key");
  const expectedKey = process.env.API_KEY;

  if (!authKey || authKey !== expectedKey) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const photoId = event.params.photoId;
  const collectionId = event.params.collectionId;

  if (!photoId || !collectionId) {
    return json(
      { error: "photoId and collectionId are required" },
      { status: 400 },
    );
  }

  const db = getDb();

  const result = await db
    .delete(schema.photoCollections)
    .where(
      and(
        eq(schema.photoCollections.photoId, photoId),
        eq(schema.photoCollections.collectionId, collectionId),
      ),
    );

  return json({ success: true });
}
