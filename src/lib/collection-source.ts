import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "~/db";

export interface CollectionNavigationItem {
  id: string;
  name: string;
  isPrivate: boolean;
}

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

export const PUBLIC_COLLECTIONS_SNAPSHOT_KEY = "public-collections";

export function collectionSnapshotKey(id: string) {
  return `collection:${id}`;
}

function serializeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeCollection(collection: {
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

export async function loadCollectionFromD1(
  id: string,
): Promise<CollectionPageData | null> {
  const db = getDb();
  const collection = await db.query.collections.findFirst({
    where: eq(schema.collections.id, id),
    with: {
      photoCollections: {
        with: { photo: true },
        orderBy: (photoCollections, { asc }) => [asc(photoCollections.order)],
      },
    },
  });

  if (!collection) return null;
  return serializeCollection({
    ...collection,
    photos: collection.photoCollections.map((photoCollection) => ({
      ...photoCollection.photo,
      order: photoCollection.order,
    })),
  });
}

export async function loadPublicCollectionsFromD1(): Promise<
  CollectionNavigationItem[]
> {
  const db = getDb();
  return db
    .select({
      id: schema.collections.id,
      name: schema.collections.name,
      isPrivate: schema.collections.isPrivate,
    })
    .from(schema.collections)
    .where(eq(schema.collections.isPrivate, false))
    .orderBy(asc(schema.collections.name));
}
