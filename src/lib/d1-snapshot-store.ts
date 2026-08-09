import {
  beginD1SnapshotMutation,
  completeD1SnapshotMutation,
  type D1DatabaseLike,
  type D1SnapshotRead,
  publishD1Snapshot,
  readD1Snapshot,
} from "~/lib/d1-snapshot-operations";

interface CloudflareEnv {
  COLLECTION_SNAPSHOTS?: D1DatabaseLike;
}

export type SnapshotStoreRead<T> =
  | D1SnapshotRead<T>
  | { status: "unavailable" };

export type SnapshotMutationCompletion =
  | { status: "refresh"; generation: number }
  | { status: "pending" }
  | { status: "unavailable" };

const LOCAL_SNAPSHOT_ORIGIN = "http://127.0.0.1:8787";

function getDatabase(): D1DatabaseLike | undefined {
  return (
    globalThis as typeof globalThis & {
      __env__?: CloudflareEnv;
    }
  ).__env__?.COLLECTION_SNAPSHOTS;
}

function canUseDevelopmentProxy() {
  return import.meta.env.DEV;
}

function snapshotUrl(cacheKey: string) {
  return `${LOCAL_SNAPSHOT_ORIGIN}/snapshots/${encodeURIComponent(cacheKey)}`;
}

async function proxyRequest(cacheKey: string, init?: RequestInit) {
  return fetch(snapshotUrl(cacheKey), init);
}

export async function readSnapshot<T>(
  cacheKey: string,
): Promise<SnapshotStoreRead<T>> {
  try {
    const db = getDatabase();
    if (db) return readD1Snapshot<T>(db, cacheKey);
    if (!canUseDevelopmentProxy()) return { status: "unavailable" };

    const response = await proxyRequest(cacheKey);
    if (!response.ok) throw new Error(`Snapshot read failed (${response.status})`);
    return (await response.json()) as D1SnapshotRead<T>;
  } catch (error) {
    console.error("D1 snapshot read failed:", error);
    return { status: "unavailable" };
  }
}

export async function beginSnapshotMutation(
  cacheKey: string,
): Promise<string | null> {
  const token = crypto.randomUUID();
  const db = getDatabase();
  if (db) {
    await beginD1SnapshotMutation(db, cacheKey, token);
    return token;
  }
  if (!canUseDevelopmentProxy()) return null;

  const response = await proxyRequest(cacheKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw new Error(`D1 snapshot invalidation failed (${response.status})`);
  }
  return token;
}

export async function completeSnapshotMutation(
  cacheKey: string,
  token: string,
): Promise<SnapshotMutationCompletion> {
  try {
    const db = getDatabase();
    if (db) {
      const generation = await completeD1SnapshotMutation(db, cacheKey, token);
      return generation === null
        ? { status: "pending" }
        : { status: "refresh", generation };
    }
    if (!canUseDevelopmentProxy()) return { status: "unavailable" };

    const response = await proxyRequest(cacheKey, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      throw new Error(`D1 mutation completion failed (${response.status})`);
    }
    return (await response.json()) as SnapshotMutationCompletion;
  } catch (error) {
    console.error("D1 mutation completion failed:", error);
    return { status: "unavailable" };
  }
}

export async function publishSnapshot(
  cacheKey: string,
  payload: unknown,
  generation: number,
): Promise<boolean> {
  try {
    const db = getDatabase();
    if (db) return publishD1Snapshot(db, cacheKey, payload, generation);
    if (!canUseDevelopmentProxy()) return false;

    const response = await proxyRequest(cacheKey, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation, payload }),
    });
    if (!response.ok) throw new Error(`Snapshot publish failed (${response.status})`);
    const result = (await response.json()) as { published: boolean };
    return result.published;
  } catch (error) {
    console.error("D1 snapshot publish failed:", error);
    return false;
  }
}
