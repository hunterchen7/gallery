import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { eq, max } from "drizzle-orm";
import { getDb, schema } from "~/db";
import { withCollectionCacheRefresh } from "~/lib/collection-cache";

/**
 * POST /api/collections/[id]/photos - Add existing photos to a collection
 * Requires authentication
 * Body: { photoIds: string[] }
 */
export async function POST(event: APIEvent) {
  const authKey = event.request.headers.get("X-Auth-Key");
  if (!authKey || authKey !== process.env.API_KEY) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const collectionId = event.params.id;
  const body = await event.request.json();
  const photoIds = Array.isArray(body.photoIds)
    ? [...new Set(body.photoIds.filter((id: unknown) => typeof id === "string"))]
    : [];

  if (photoIds.length === 0) {
    return json({ error: "At least one photoId is required" }, { status: 400 });
  }

  const db = getDb();
  const collection = await db.query.collections.findFirst({
    where: eq(schema.collections.id, collectionId),
  });
  if (!collection) {
    return json({ error: "Collection not found" }, { status: 404 });
  }

  const [orderResult] = await db
    .select({ maxOrder: max(schema.photoCollections.order) })
    .from(schema.photoCollections)
    .where(eq(schema.photoCollections.collectionId, collectionId));
  const firstOrder = (orderResult?.maxOrder ?? -1) + 1;

  const added = await withCollectionCacheRefresh([collectionId], () =>
    db
      .insert(schema.photoCollections)
      .values(
        photoIds.map((photoId, index) => ({
          photoId,
          collectionId,
          order: firstOrder + index,
        })),
      )
      .onConflictDoNothing()
      .returning({ photoId: schema.photoCollections.photoId }),
  );

  return json({
    success: true,
    added: added.length,
    alreadyPresent: photoIds.length - added.length,
  });
}
