import {
  collectionSnapshotKey,
  type CollectionListItem,
  type CollectionNavigationItem,
  type CollectionPageData,
  loadCollectionFromD1,
  loadPublicCollectionsFromD1,
  serializeCollection,
  PUBLIC_COLLECTIONS_SNAPSHOT_KEY,
} from "~/lib/collection-source";
import { publishSnapshot, readSnapshot } from "~/lib/d1-snapshot-store";

export type {
  CollectionListItem,
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

  const collections = await loadPublicCollectionsFromD1();
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
 * Loads the complete payload needed by a collection route. Both the persistent
 * route snapshot and the authoritative relational records live in D1.
 */
export async function loadCollectionPage(
  id: string,
  isAdmin = false,
): Promise<CollectionPageResult> {
  const snapshot = await readSnapshot<CollectionPageData | null>(
    collectionSnapshotKey(id),
  );
  if (snapshot.status === "hit") {
    const collection = snapshot.payload
      ? serializeCollection(snapshot.payload)
      : null;
    if (!collection || (collection.isPrivate && !isAdmin)) {
      return { collection: null, cacheStatus: "D1-HIT" };
    }
    return { collection, cacheStatus: "D1-HIT" };
  }

  const collection = await loadCollectionFromD1(id);
  const cacheStatus =
    snapshot.status === "unavailable"
      ? "D1-SNAPSHOT-UNAVAILABLE/RELATIONAL"
      : `D1-${snapshot.status.toUpperCase()}/RELATIONAL`;

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
