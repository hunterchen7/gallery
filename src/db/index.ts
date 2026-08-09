import { drizzle } from "drizzle-orm/d1";
import { getD1Database } from "./d1-client";
import * as schema from "./schema";

function createDb() {
  return drizzle(getD1Database() as D1Database, { schema });
}

// Lazy initialization to avoid errors during build
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export { schema };
