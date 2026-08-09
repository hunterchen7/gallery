export interface D1ResultLike<T = Record<string, unknown>> {
  results?: T[];
  success: boolean;
  error?: string;
  meta?: { changes?: number };
}

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<Array<D1ResultLike<T>>>;
}

export type D1SnapshotRead<T> =
  | { status: "hit"; payload: T; generation: number }
  | { status: "miss"; generation: 0 }
  | { status: "dirty"; generation: number };

const ABANDONED_MUTATION_MS = 5 * 60 * 1000;

interface SnapshotRow {
  payload: string;
  generation: number;
  dirty: number;
  activeMutations: number;
}

function assertSucceeded(result: D1ResultLike, operation: string) {
  if (!result.success) {
    throw new Error(result.error || `D1 ${operation} failed`);
  }
}

export async function readD1Snapshot<T>(
  db: D1DatabaseLike,
  cacheKey: string,
): Promise<D1SnapshotRead<T>> {
  const cleanup = await db
    .prepare(
      `DELETE FROM collection_snapshot_mutations
       WHERE cache_key = ? AND started_at < ?`,
    )
    .bind(cacheKey, Date.now() - ABANDONED_MUTATION_MS)
    .run();
  assertSucceeded(cleanup, "mutation cleanup");

  const row = await db
    .prepare(
      `SELECT
         payload,
         generation,
         dirty,
         EXISTS(
           SELECT 1
           FROM collection_snapshot_mutations mutations
           WHERE mutations.cache_key = collection_snapshots.cache_key
         ) AS activeMutations
       FROM collection_snapshots
       WHERE cache_key = ?`,
    )
    .bind(cacheKey)
    .first<SnapshotRow>();

  if (!row) return { status: "miss", generation: 0 };
  if (row.dirty || row.activeMutations) {
    return { status: "dirty", generation: row.generation };
  }

  try {
    return {
      status: "hit",
      payload: JSON.parse(row.payload) as T,
      generation: row.generation,
    };
  } catch {
    return { status: "dirty", generation: row.generation };
  }
}

export async function beginD1SnapshotMutation(
  db: D1DatabaseLike,
  cacheKey: string,
  token: string,
) {
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO collection_snapshots (
           cache_key, payload, generation, dirty, updated_at
         ) VALUES (?, 'null', 1, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(cache_key) DO UPDATE SET
           generation = collection_snapshots.generation + 1,
           dirty = 1,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(cacheKey),
    db
      .prepare(
        `INSERT INTO collection_snapshot_mutations (token, cache_key, started_at)
         VALUES (?, ?, ?)`,
      )
      .bind(token, cacheKey, Date.now()),
  ]);

  results.forEach((result) => assertSucceeded(result, "invalidation"));
}

export async function completeD1SnapshotMutation(
  db: D1DatabaseLike,
  cacheKey: string,
  token: string,
): Promise<number | null> {
  const results = await db.batch<{ generation: number }>([
    db
      .prepare(
        `DELETE FROM collection_snapshot_mutations
         WHERE token = ? AND cache_key = ?`,
      )
      .bind(token, cacheKey),
    db
      .prepare(
        `SELECT generation
         FROM collection_snapshots snapshots
         WHERE cache_key = ?
           AND NOT EXISTS (
             SELECT 1
             FROM collection_snapshot_mutations mutations
             WHERE mutations.cache_key = snapshots.cache_key
           )`,
      )
      .bind(cacheKey),
  ]);

  results.forEach((result) => assertSucceeded(result, "mutation completion"));
  return results[1].results?.[0]?.generation ?? null;
}

export async function publishD1Snapshot(
  db: D1DatabaseLike,
  cacheKey: string,
  payload: unknown,
  generation: number,
): Promise<boolean> {
  const serialized = JSON.stringify(payload);
  const result = await db
    .prepare(
      `INSERT INTO collection_snapshots (
         cache_key, payload, generation, dirty, updated_at
       ) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload = excluded.payload,
         dirty = 0,
         updated_at = CURRENT_TIMESTAMP
       WHERE collection_snapshots.generation = excluded.generation
         AND NOT EXISTS (
           SELECT 1
           FROM collection_snapshot_mutations mutations
           WHERE mutations.cache_key = collection_snapshots.cache_key
         )`,
    )
    .bind(cacheKey, serialized, generation)
    .run();
  assertSucceeded(result, "snapshot publish");
  return (result.meta?.changes ?? 0) > 0;
}
