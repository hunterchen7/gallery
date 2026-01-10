import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { getDb, schema } from "~/db";
import { eq } from "drizzle-orm";

/**
 * GET /api/collections - Get all collections
 * No authentication required
 */
export async function GET() {
  const db = getDb();
  const collections = await db.query.collections.findMany({
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
  const { id, name, description } = body;

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

  // Check if collection already exists
  const existing = await db.query.collections.findFirst({
    where: eq(schema.collections.id, id),
  });

  if (existing) {
    return json(
      { error: "Collection with this id already exists" },
      { status: 409 },
    );
  }

  const [collection] = await db
    .insert(schema.collections)
    .values({
      id,
      name,
      description: description || null,
    })
    .returning();

  return json(collection, { status: 201 });
}
