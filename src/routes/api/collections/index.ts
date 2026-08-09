import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { getDb, schema } from "~/db";
import { eq } from "drizzle-orm";
import { withCollectionCacheRefresh } from "~/lib/collection-cache";

/**
 * GET /api/collections - Get all collections
 * No authentication required
 */
export async function GET(event: APIEvent) {
  const db = getDb();
  const isAdmin = event.request.headers.get("X-Auth-Key") === process.env.API_KEY;
  const collections = await db.query.collections.findMany({
    where: isAdmin ? undefined : eq(schema.collections.isPrivate, false),
    orderBy: (collections, { asc }) => [asc(collections.name)],
  });
  return json(collections);
}

/**
 * POST /api/collections - Create a new collection
 * Requires authentication
 */
export async function POST(event: APIEvent) {
  // Verify authentication
  const authKey = event.request.headers.get("X-Auth-Key");
  const expectedKey = process.env.API_KEY;

  if (!authKey || authKey !== expectedKey) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await event.request.json();
  const { id, name, description, isPrivate } = body;

  if (!id || !name) {
    return json({ error: "id and name are required" }, { status: 400 });
  }

  // Validate id is URL-safe
  if (!/^[a-z0-9-]+$/.test(id)) {
    return json(
      { error: "id must be lowercase alphanumeric with hyphens only" },
      { status: 400 },
    );
  }

  const db = getDb();

  const nativeEvent = event.nativeEvent as typeof event.nativeEvent & {
    waitUntil?: (promise: Promise<void>) => void;
  };
  const waitUntil = nativeEvent.waitUntil?.bind(nativeEvent);

  const [collection] = await withCollectionCacheRefresh(
    [id],
    () =>
      db
        .insert(schema.collections)
        .values({
          id,
          name,
          description: description || null,
          isPrivate: isPrivate === true,
        })
        .onConflictDoNothing({ target: schema.collections.id })
        .returning(),
    {
      includePublicCollections: isPrivate !== true,
      waitUntil,
    },
  );

  if (!collection) {
    return json(
      { error: "Collection with this id already exists" },
      { status: 409 },
    );
  }

  return json(collection, { status: 201 });
}
