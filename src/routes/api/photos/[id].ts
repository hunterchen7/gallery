import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { getDb, schema } from "~/db";
import { eq } from "drizzle-orm";

/**
 * GET /api/photos/[id] - Get a single photo with its collections
 * No authentication required
 */
export async function GET(event: APIEvent) {
  const id = event.params.id;
  const db = getDb();

  const photo = await db.query.photos.findFirst({
    where: eq(schema.photos.id, id),
    with: {
      photoCollections: {
        with: {
          collection: true,
        },
      },
    },
  });

  if (!photo) {
    return json({ error: "Photo not found" }, { status: 404 });
  }

  // Transform to flatten the structure
  const collections = photo.photoCollections.map((pc) => pc.collection);

  return json({
    ...photo,
    collections,
    photoCollections: undefined,
  });
}

/**
 * PUT /api/photos/[id] - Update a photo's collections
 * Requires authentication
 */
export async function PUT(event: APIEvent) {
  const authKey = event.request.headers.get("X-Auth-Key");
  const expectedKey = process.env.API_KEY;

  if (!authKey || authKey !== expectedKey) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = event.params.id;
  const body = await event.request.json();
  const { collectionIds } = body;

  if (!collectionIds || !Array.isArray(collectionIds)) {
    return json({ error: "collectionIds array is required" }, { status: 400 });
  }

  const db = getDb();

  // Delete existing associations
  await db
    .delete(schema.photoCollections)
    .where(eq(schema.photoCollections.photoId, id));

  // Create new associations
  if (collectionIds.length > 0) {
    await db.insert(schema.photoCollections).values(
      collectionIds.map((collectionId: string) => ({
        photoId: id,
        collectionId,
      })),
    );
  }

  return json({ success: true });
}

/**
 * DELETE /api/photos/[id] - Delete a photo
 * Requires authentication
 * Note: This will cascade delete photo_collections entries
 */
export async function DELETE(event: APIEvent) {
  const authKey = event.request.headers.get("X-Auth-Key");
  const expectedKey = process.env.API_KEY;

  if (!authKey || authKey !== expectedKey) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = event.params.id;
  const db = getDb();

  const [deleted] = await db
    .delete(schema.photos)
    .where(eq(schema.photos.id, id))
    .returning();

  if (!deleted) {
    return json({ error: "Photo not found" }, { status: 404 });
  }

  return json({ success: true });
}
