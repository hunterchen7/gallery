import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "~/db";

export interface CollectionNavigationItem {
  id: string;
  name: string;
  isPrivate: boolean;
}

export interface CollectionListItem extends CollectionNavigationItem {
  description: string | null;
}

export interface CollectionPagePhoto {
  id: string;
  url: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  date: string;
}

export interface CollectionPageData {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
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
  photos: Array<{
    id: string;
    url: string;
    thumbnail: string;
    width: number | null;
    height: number | null;
    date: Date | string;
  }>;
}): CollectionPageData {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description,
    isPrivate: collection.isPrivate,
    photos: collection.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      thumbnail: photo.thumbnail,
      width: photo.width,
      height: photo.height,
      date: serializeDate(photo.date),
    })),
  };
}

export async function loadCollectionFromD1(
  id: string,
): Promise<CollectionPageData | null> {
  const db = getDb();
  const collection = await db.query.collections.findFirst({
    columns: {
      id: true,
      name: true,
      description: true,
      isPrivate: true,
    },
    where: eq(schema.collections.id, id),
    with: {
      photoCollections: {
        columns: {},
        with: {
          photo: {
            columns: {
              id: true,
              url: true,
              thumbnail: true,
              width: true,
              height: true,
              date: true,
            },
          },
        },
        orderBy: (photoCollections, { asc }) => [asc(photoCollections.order)],
      },
    },
  });

  if (!collection) return null;
  return serializeCollection({
    ...collection,
    photos: collection.photoCollections.map(
      (photoCollection) => photoCollection.photo,
    ),
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
