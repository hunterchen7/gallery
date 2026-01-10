import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { getDb, schema } from "~/db";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/collections/[id] - Get a single collection with its photos
 * No authentication required
 */
export async function GET(event: APIEvent) {
  const id = event.params.id;
  const db = getDb();

  const collection = await db.query.collections.findFirst({
    where: eq(schema.collections.id, id),
    with: {
      photoCollections: {
        with: {
          photo: true,
        },
        orderBy: (photoCollections, { asc }) => [asc(photoCollections.order)],
      },
    },
  });

  if (!collection) {
    return json({ error: "Collection not found" }, { status: 404 });
  }

  // Extract photos (already sorted by order from query)
  const photos = collection.photoCollections.map((pc) => ({
    ...pc.photo,
    order: pc.order,
  }));

  return json({
    ...collection,
    photos,
    photoCollections: undefined,
  });
}

/**
 * PUT /api/collections/[id] - Update a collection
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
  const { name, description } = body;

  const db = getDb();

  const [updated] = await db
    .update(schema.collections)
    .set({
      name: name || undefined,
      description: description,
      updatedAt: new Date(),
    })
    .where(eq(schema.collections.id, id))
    .returning();

  if (!updated) {
    return json({ error: "Collection not found" }, { status: 404 });
  }

  return json(updated);
}

/**
 * DELETE /api/collections/[id] - Delete a collection
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
    .delete(schema.collections)
    .where(eq(schema.collections.id, id))
    .returning();

  if (!deleted) {
    return json({ error: "Collection not found" }, { status: 404 });
  }

  return json({ success: true });
}
