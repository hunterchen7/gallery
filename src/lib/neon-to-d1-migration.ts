import { neon } from "@neondatabase/serverless";
import {
  getD1Database,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from "../db/d1-client";

const BATCH_SIZE = 50;

interface LegacyCollection {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  created_at: string | number;
  updated_at: string | number;
}

interface LegacyPhoto {
  id: string;
  url: string;
  thumbnail: string;
  content_hash: string | null;
  width: number | null;
  height: number | null;
  date: string | number;
  created_at: string | number;
}

interface LegacyPhotoCollection {
  photo_id: string;
  collection_id: string;
  order: number;
}

interface D1Collection {
  id: string;
  name: string;
  description: string | null;
  is_private: number;
  created_at: number;
  updated_at: number;
}

interface D1Photo {
  id: string;
  url: string;
  thumbnail: string;
  content_hash: string | null;
  width: number | null;
  height: number | null;
  date: number;
  created_at: number;
}

interface D1PhotoCollection {
  photo_id: string;
  collection_id: string;
  order: number;
}

export interface NeonToD1MigrationReport {
  source: {
    collections: number;
    photos: number;
    photoCollections: number;
  };
  target: {
    collections: number;
    photos: number;
    photoCollections: number;
  };
  batches: number;
  verified: true;
  durationMs: number;
}

function asInteger(value: string | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`Invalid integer value returned by Neon: ${value}`);
  }
  return result;
}

function normalizeNullableInteger(value: number | null): number | null {
  return value === null ? null : Number(value);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function runBatches(
  database: D1DatabaseLike,
  statements: D1PreparedStatementLike[],
): Promise<number> {
  const batches = chunks(statements, BATCH_SIZE);
  for (const batch of batches) {
    const results = await database.batch(batch);
    const failed = results.find((result) => !result.success);
    if (failed) {
      throw new Error(failed.error || "D1 batch failed");
    }
  }
  return batches.length;
}

async function readRows<T>(
  database: D1DatabaseLike,
  query: string,
): Promise<T[]> {
  const result = await database.prepare(query).all<T>();
  if (!result.success) throw new Error(result.error || "D1 read failed");
  return result.results ?? [];
}

function assertSameRows<T>(table: string, source: T[], target: T[]) {
  if (source.length !== target.length) {
    throw new Error(
      `${table} count mismatch: Neon=${source.length}, D1=${target.length}`,
    );
  }

  for (let index = 0; index < source.length; index += 1) {
    if (JSON.stringify(source[index]) !== JSON.stringify(target[index])) {
      throw new Error(`${table} row mismatch at index ${index}`);
    }
  }
}

export async function migrateNeonToD1(
  database: D1DatabaseLike = getD1Database(),
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): Promise<NeonToD1MigrationReport> {
  const startedAt = Date.now();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the Neon migration");
  }

  const sql = neon(databaseUrl);
  const [legacyCollections, legacyPhotos, legacyPhotoCollections] =
    await Promise.all([
      sql`SELECT id, name, description, is_private,
                 (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at,
                 (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint AS updated_at
          FROM collections ORDER BY id` as Promise<LegacyCollection[]>,
      sql`SELECT id::text AS id, url, thumbnail, content_hash, width, height,
                 (EXTRACT(EPOCH FROM date) * 1000)::bigint AS date,
                 (EXTRACT(EPOCH FROM created_at) * 1000)::bigint AS created_at
          FROM photos ORDER BY id` as Promise<LegacyPhoto[]>,
      sql`SELECT photo_id::text AS photo_id, collection_id, "order"
          FROM photo_collections ORDER BY collection_id, "order", photo_id` as Promise<
        LegacyPhotoCollection[]
      >,
    ]);

  const collections: D1Collection[] = legacyCollections.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    is_private: row.is_private ? 1 : 0,
    created_at: asInteger(row.created_at),
    updated_at: asInteger(row.updated_at),
  }));
  const photos: D1Photo[] = legacyPhotos.map((row) => ({
    id: row.id,
    url: row.url,
    thumbnail: row.thumbnail,
    content_hash: row.content_hash,
    width: normalizeNullableInteger(row.width),
    height: normalizeNullableInteger(row.height),
    date: asInteger(row.date),
    created_at: asInteger(row.created_at),
  }));
  const photoCollections: D1PhotoCollection[] = legacyPhotoCollections.map(
    (row) => ({
      photo_id: row.photo_id,
      collection_id: row.collection_id,
      order: Number(row.order),
    }),
  );

  const collectionIds = new Set(collections.map((row) => row.id));
  const photoIds = new Set(photos.map((row) => row.id));
  for (const row of photoCollections) {
    if (!collectionIds.has(row.collection_id) || !photoIds.has(row.photo_id)) {
      throw new Error("Neon contains an orphaned photo collection association");
    }
  }

  let batchCount = 0;

  batchCount += await runBatches(
    database,
    collections.map((row) =>
      database
        .prepare(
          `INSERT INTO collections
             (id, name, description, is_private, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             is_private = excluded.is_private,
             created_at = excluded.created_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          row.id,
          row.name,
          row.description,
          row.is_private,
          row.created_at,
          row.updated_at,
        ),
    ),
  );

  batchCount += await runBatches(
    database,
    photos.map((row) =>
      database
        .prepare(
          `INSERT INTO photos
             (id, url, thumbnail, content_hash, width, height, date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             url = excluded.url,
             thumbnail = excluded.thumbnail,
             content_hash = excluded.content_hash,
             width = excluded.width,
             height = excluded.height,
             date = excluded.date,
             created_at = excluded.created_at`,
        )
        .bind(
          row.id,
          row.url,
          row.thumbnail,
          row.content_hash,
          row.width,
          row.height,
          row.date,
          row.created_at,
        ),
    ),
  );

  batchCount += await runBatches(
    database,
    photoCollections.map((row) =>
      database
        .prepare(
          `INSERT INTO photo_collections (photo_id, collection_id, "order")
           VALUES (?, ?, ?)
           ON CONFLICT(photo_id, collection_id) DO UPDATE SET
             "order" = excluded."order"`,
        )
        .bind(row.photo_id, row.collection_id, row.order),
    ),
  );

  const [targetCollections, targetPhotos, targetPhotoCollections] =
    await Promise.all([
      readRows<D1Collection>(
        database,
        `SELECT id, name, description, is_private, created_at, updated_at
         FROM collections ORDER BY id`,
      ),
      readRows<D1Photo>(
        database,
        `SELECT id, url, thumbnail, content_hash, width, height, date, created_at
         FROM photos ORDER BY id`,
      ),
      readRows<D1PhotoCollection>(
        database,
        `SELECT photo_id, collection_id, "order"
         FROM photo_collections ORDER BY collection_id, "order", photo_id`,
      ),
    ]);

  assertSameRows("collections", collections, targetCollections);
  assertSameRows("photos", photos, targetPhotos);
  assertSameRows("photo_collections", photoCollections, targetPhotoCollections);

  const foreignKeyIssues = await readRows<Record<string, unknown>>(
    database,
    "PRAGMA foreign_key_check",
  );
  if (foreignKeyIssues.length > 0) {
    throw new Error(`D1 foreign key check found ${foreignKeyIssues.length} issue(s)`);
  }

  return {
    source: {
      collections: collections.length,
      photos: photos.length,
      photoCollections: photoCollections.length,
    },
    target: {
      collections: targetCollections.length,
      photos: targetPhotos.length,
      photoCollections: targetPhotoCollections.length,
    },
    batches: batchCount,
    verified: true,
    durationMs: Date.now() - startedAt,
  };
}
