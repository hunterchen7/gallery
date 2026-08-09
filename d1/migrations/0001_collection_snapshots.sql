CREATE TABLE collection_snapshots (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL DEFAULT 'null',
  generation INTEGER NOT NULL DEFAULT 0,
  dirty INTEGER NOT NULL DEFAULT 1 CHECK (dirty IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collection_snapshot_mutations (
  token TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  FOREIGN KEY (cache_key) REFERENCES collection_snapshots(cache_key) ON DELETE CASCADE
);

CREATE INDEX collection_snapshot_mutations_cache_key_idx
  ON collection_snapshot_mutations(cache_key);

CREATE INDEX collection_snapshot_mutations_started_at_idx
  ON collection_snapshot_mutations(started_at);
