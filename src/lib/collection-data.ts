import { and, eq } from "drizzle-orm";
import { getDb, schema } from "~/db";
import type { Collection } from "~/db/schema";
import { readCollectionCache } from "~/lib/collection-cache";

export interface CollectionPagePhoto {
  id: string;
  url: string;
  thumbnail: string;
  contentHash: string | null;
  width: number | null;
  height: number | null;
  date: string;
  createdAt: string;
  order: number;
}

export interface CollectionPageData {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  photos: CollectionPagePhoto[];
}

export interface CollectionPageResult {
  collection: CollectionPageData | null;
  cacheStatus: string;
}

export async function loadPublicCollections(): Promise<Collection[]> {
  const db = getDb();
  return db.query.collections.findMany({
    where: eq(schema.collections.isPrivate, false),
    orderBy: (collections, { asc }) => [asc(collections.name)],
  });
}

function serializeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeCollection(collection: {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  photos: Array<{
    id: string;
    url: string;
    thumbnail: string;
    contentHash: string | null;
    width: number | null;
    height: number | null;
    date: Date | string;
    createdAt: Date | string;
    order: number;
  }>;
}): CollectionPageData {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    isPrivate: collection.isPrivate,
    createdAt: serializeDate(collection.createdAt),
    updatedAt: serializeDate(collection.updatedAt),
    photos: collection.photos.map((photo) => ({
      ...photo,
      date: serializeDate(photo.date),
      createdAt: serializeDate(photo.createdAt),
    })),
  };
}

/**
 * Loads the complete payload needed by a collection route. The Durable Object
 * is authoritative when available; the database query is only a local-dev
 * fallback for environments without the binding.
 */
export async function loadCollectionPage(
  id: string,
  isAdmin = false,
): Promise<CollectionPageResult> {
  const cached = await readCollectionCache(id);
  if (cached.status === "available") {
    const collection = cached.collection;
    if (!collection || (collection.isPrivate && !isAdmin)) {
      return { collection: null, cacheStatus: cached.cacheStatus };
    }

    return {
      collection: serializeCollection(collection),
      cacheStatus: cached.cacheStatus,
    };
  }

  const db = getDb();
  const collection = await db.query.collections.findFirst({
    where: isAdmin
      ? eq(schema.collections.id, id)
      : and(
          eq(schema.collections.id, id),
          eq(schema.collections.isPrivate, false),
        ),
    with: {
      photoCollections: {
        with: { photo: true },
        orderBy: (photoCollections, { asc }) => [asc(photoCollections.order)],
      },
    },
  });

  if (!collection) {
    return { collection: null, cacheStatus: "UNAVAILABLE" };
  }

  return {
    collection: serializeCollection({
      ...collection,
      photos: collection.photoCollections.map((photoCollection) => ({
        ...photoCollection.photo,
        order: photoCollection.order,
      })),
    }),
    cacheStatus: "UNAVAILABLE",
  };
}
