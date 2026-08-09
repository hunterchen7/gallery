import type { Collection, Photo } from "~/db/schema";

export interface CollectionSnapshot extends Collection {
  photos: Array<Photo & { order: number }>;
}

interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

interface CloudflareEnv {
  COLLECTION_CACHE?: DurableObjectNamespaceLike;
}

type CacheReadResult =
  | {
      status: "available";
      collection: CollectionSnapshot | null;
      cacheStatus: string;
    }
  | { status: "unavailable" };

function getNamespace(): DurableObjectNamespaceLike | undefined {
  return (
    globalThis as typeof globalThis & {
      __env__?: CloudflareEnv;
    }
  ).__env__?.COLLECTION_CACHE;
}

function getStub(collectionId: string): DurableObjectStubLike | null {
  const namespace = getNamespace();
  if (!namespace) return null;
  return namespace.get(namespace.idFromName(collectionId));
}

function collectionUrl(collectionId: string) {
  return `https://collection-cache.internal/collections/${encodeURIComponent(collectionId)}`;
}

export async function readCollectionCache(
  collectionId: string,
): Promise<CacheReadResult> {
  const stub = getStub(collectionId);
  if (!stub) return { status: "unavailable" };

  try {
    const response = await stub.fetch(collectionUrl(collectionId));
    const cacheStatus = response.headers.get("X-Collection-Cache") ?? "UNKNOWN";

    if (response.status === 404) {
      return { status: "available", collection: null, cacheStatus };
    }
    if (!response.ok) {
      console.error("Collection cache read failed:", response.status);
      return { status: "unavailable" };
    }

    return {
      status: "available",
      collection: (await response.json()) as CollectionSnapshot,
      cacheStatus,
    };
  } catch (error) {
    console.error("Collection cache read failed:", error);
    return { status: "unavailable" };
  }
}

/**
 * Marks a collection dirty before its Neon mutation begins. If the binding is
 * configured, failure is fatal so a write can never leave a stale clean cache.
 */
export async function invalidateCollectionCache(collectionId: string) {
  const stub = getStub(collectionId);
  if (!stub) return false;

  const response = await stub.fetch(collectionUrl(collectionId), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Collection cache invalidation failed (${response.status})`);
  }
  return true;
}

/**
 * Rebuilds a dirty snapshot after a successful Neon mutation. A failed refresh
 * is safe: the DO stays dirty and bypasses its snapshot until a later refresh.
 */
export async function refreshCollectionCache(collectionId: string) {
  const stub = getStub(collectionId);
  if (!stub) return false;

  try {
    const response = await stub.fetch(collectionUrl(collectionId), {
      method: "PUT",
    });
    if (!response.ok) {
      console.error("Collection cache refresh failed:", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Collection cache refresh failed:", error);
    return false;
  }
}
