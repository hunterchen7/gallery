import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { getDb, schema } from "~/db";
import { eq, and } from "drizzle-orm";

/**
 * PUT /api/collections/[id]/reorder - Reorder photos in a collection
 * Requires authentication
 * Body: { photoIds: string[] } - Array of photo IDs in the desired order
 */
export async function PUT(event: APIEvent) {
  const authKey = event.request.headers.get("X-Auth-Key");
  const expectedKey = process.env.API_KEY;

  if (!authKey || authKey !== expectedKey) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const collectionId = event.params.id;
  const body = await event.request.json();
  const { photoIds } = body as { photoIds: string[] };

  if (!Array.isArray(photoIds)) {
    return json({ error: "photoIds must be an array" }, { status: 400 });
  }

  const db = getDb();

  // Update each photo's order in the collection
  const updates = photoIds.map((photoId, index) =>
    db
      .update(schema.photoCollections)
      .set({ order: index })
      .where(
        and(
          eq(schema.photoCollections.photoId, photoId),
          eq(schema.photoCollections.collectionId, collectionId),
        ),
      ),
  );

  await Promise.all(updates);

  return json({ success: true, count: photoIds.length });
}
