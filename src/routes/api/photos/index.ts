import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { getDb, schema } from "~/db";
import { eq } from "drizzle-orm";

/**
 * GET /api/photos - Get all photos
 * No authentication required
 */
export async function GET() {
  const db = getDb();
  const photos = await db.query.photos.findMany({
    orderBy: (photos, { desc }) => [desc(photos.date)],
  });
  return json(photos);
}

/**
 * POST /api/photos - Create a new photo and associate with collections
 * Requires authentication
 *
 * Body: {
 *   url: string,
 *   thumbnail: string,
 *   date: string (ISO),
 *   collectionIds: string[]
 * }
 */
export async function POST(event: APIEvent) {
  const authKey = event.request.headers.get("X-Auth-Key");
  const expectedKey = process.env.API_KEY;

  if (!authKey || authKey !== expectedKey) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await event.request.json();
  const { url, thumbnail, contentHash, date, collectionIds } = body;

  if (!url || !thumbnail || !date) {
    return json(
      { error: "url, thumbnail, and date are required" },
      { status: 400 },
    );
  }

  if (
    !collectionIds ||
    !Array.isArray(collectionIds) ||
    collectionIds.length === 0
  ) {
    return json(
      { error: "At least one collectionId is required" },
      { status: 400 },
    );
  }

  const db = getDb();

  if (
    typeof contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(contentHash)
  ) {
    return json(
      { error: "A lowercase SHA-256 contentHash is required" },
      { status: 400 },
    );
  }

  async function associateWithCollections(photoId: string) {
    await db
      .insert(schema.photoCollections)
      .values(
        collectionIds.map((collectionId: string) => ({
          photoId,
          collectionId,
        })),
      )
      .onConflictDoNothing();
  }

  const existingPhoto = await db.query.photos.findFirst({
    where: eq(schema.photos.contentHash, contentHash),
  });

  if (existingPhoto) {
    await associateWithCollections(existingPhoto.id);
    return json({ ...existingPhoto, duplicate: true });
  }

  let photo;
  try {
    [photo] = await db
      .insert(schema.photos)
      .values({
        url,
        thumbnail,
        contentHash,
        date: new Date(date),
      })
      .returning();
  } catch (error) {
    // Concurrent uploads of the same content can race on the unique hash.
    photo = await db.query.photos.findFirst({
      where: eq(schema.photos.contentHash, contentHash),
    });
    if (!photo) throw error;
  }

  await associateWithCollections(photo.id);

  return json(photo, { status: existingPhoto ? 200 : 201 });
}
