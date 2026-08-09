import { readCollectionCache } from "~/lib/collection-cache";
import {
  collectionSnapshotKey,
  type CollectionNavigationItem,
  type CollectionPageData,
  loadCollectionFromNeon,
  loadPublicCollectionsFromNeon,
  PUBLIC_COLLECTIONS_SNAPSHOT_KEY,
  serializeCollection,
} from "~/lib/collection-source";
import { publishSnapshot, readSnapshot } from "~/lib/d1-snapshot-store";

export type {
  CollectionNavigationItem,
  CollectionPageData,
  CollectionPagePhoto,
} from "~/lib/collection-source";

export interface CollectionPageResult {
  collection: CollectionPageData | null;
  cacheStatus: string;
}

export interface CollectionRouteData {
  collection: CollectionPageData | null;
  collections: CollectionNavigationItem[];
}

export async function loadPublicCollections(): Promise<
  CollectionNavigationItem[]
> {
  const cached = await readSnapshot<CollectionNavigationItem[]>(
    PUBLIC_COLLECTIONS_SNAPSHOT_KEY,
  );
  if (cached.status === "hit") return cached.payload;

  const collections = await loadPublicCollectionsFromNeon();
  if (cached.status === "miss" || cached.status === "dirty") {
    await publishSnapshot(
      PUBLIC_COLLECTIONS_SNAPSHOT_KEY,
      collections,
      cached.generation,
    );
  }
  return collections;
}

/**
 * Loads the complete payload needed by a collection route. D1 is the primary
 * snapshot store. The Durable Object remains a temporary rollout fallback and
 * Neon remains authoritative for cache repair.
 */
export async function loadCollectionPage(
  id: string,
  isAdmin = false,
): Promise<CollectionPageResult> {
  const snapshot = await readSnapshot<CollectionPageData | null>(
    collectionSnapshotKey(id),
  );
  if (snapshot.status === "hit") {
    const collection = snapshot.payload;
    if (!collection || (collection.isPrivate && !isAdmin)) {
      return { collection: null, cacheStatus: "D1-HIT" };
    }
    return { collection, cacheStatus: "D1-HIT" };
  }

  const durable = await readCollectionCache(id);
  let collection: CollectionPageData | null;
  let cacheStatus: string;

  if (durable.status === "available") {
    collection = durable.collection
      ? serializeCollection(durable.collection)
      : null;
    cacheStatus = `D1-${snapshot.status.toUpperCase()}/DO-${durable.cacheStatus}`;
  } else {
    collection = await loadCollectionFromNeon(id);
    cacheStatus =
      snapshot.status === "unavailable"
        ? "D1-UNAVAILABLE/NEON"
        : `D1-${snapshot.status.toUpperCase()}/NEON`;
  }

  if (snapshot.status === "miss" || snapshot.status === "dirty") {
    await publishSnapshot(
      collectionSnapshotKey(id),
      collection,
      snapshot.generation,
    );
  }

  if (!collection || (collection.isPrivate && !isAdmin)) {
    return { collection: null, cacheStatus };
  }
  return { collection, cacheStatus };
}

export async function loadPublicCollectionRoute(
  id: string,
): Promise<CollectionRouteData> {
  const [page, collections] = await Promise.all([
    loadCollectionPage(id),
    loadPublicCollections(),
  ]);
  return { collection: page.collection, collections };
}
