PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  content_hash TEXT,
  width INTEGER,
  height INTEGER,
  date INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS photos_content_hash_idx
  ON photos(content_hash);

CREATE TABLE IF NOT EXISTS photo_collections (
  photo_id TEXT NOT NULL
    REFERENCES photos(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL
    REFERENCES collections(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (photo_id, collection_id)
);

CREATE INDEX IF NOT EXISTS photo_collections_collection_order_idx
  ON photo_collections(collection_id, "order");
