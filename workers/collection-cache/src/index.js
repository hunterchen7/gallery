import { neon } from "@neondatabase/serverless";
import { DurableObject } from "cloudflare:workers";

const STATE_KEY = "collection-cache-state";

function jsonResponse(body, status = 200, cacheStatus = "MISS") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Collection-Cache": cacheStatus,
    },
  });
}

export class CollectionCache extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = neon(env.DATABASE_URL);
    this.state = { generation: 0, dirty: false };
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.state =
        (await ctx.storage.get(STATE_KEY)) ?? this.state;
    });
  }

  async fetch(request) {
    await this.ready;

    const url = new URL(request.url);
    const collectionId = decodeURIComponent(
      url.pathname.replace(/^\/collections\//, ""),
    );

    if (!collectionId || collectionId === url.pathname) {
      return jsonResponse({ error: "Collection id is required" }, 400);
    }

    if (request.method === "GET") {
      return this.getCollection(collectionId);
    }

    if (request.method === "DELETE") {
      return this.invalidate();
    }

    if (request.method === "PUT") {
      return this.refresh(collectionId);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  async getCollection(collectionId) {
    if (!this.state.dirty && this.state.snapshot !== undefined) {
      return this.snapshotResponse(this.state.snapshot, "HIT");
    }

    const generation = this.state.generation;
    const snapshot = await this.loadCollection(collectionId);

    // An edit invalidated this object while Neon was being read. The response is
    // still a valid concurrent read, but it must not become the persistent cache.
    if (!this.state.dirty && this.state.generation === generation) {
      this.state = { generation, dirty: false, snapshot };
      await this.ctx.storage.put(STATE_KEY, this.state);
      return this.snapshotResponse(snapshot, "MISS");
    }

    return this.snapshotResponse(snapshot, "BYPASS");
  }

  async invalidate() {
    this.state = {
      generation: this.state.generation + 1,
      dirty: true,
    };
    await this.ctx.storage.put(STATE_KEY, this.state);
    return jsonResponse({ success: true }, 200, "INVALIDATED");
  }

  async refresh(collectionId) {
    const generation = this.state.generation;
    const snapshot = await this.loadCollection(collectionId);

    // A newer mutation owns the next refresh. Do not publish an older read over
    // its invalidation marker.
    if (this.state.generation !== generation) {
      return jsonResponse({ success: true, refreshed: false }, 202, "BYPASS");
    }

    this.state = { generation, dirty: false, snapshot };
    await this.ctx.storage.put(STATE_KEY, this.state);
    return jsonResponse({ success: true, refreshed: true }, 200, "REFRESHED");
  }

  snapshotResponse(snapshot, cacheStatus) {
    if (snapshot === null) {
      return jsonResponse({ error: "Collection not found" }, 404, cacheStatus);
    }
    return jsonResponse(snapshot, 200, cacheStatus);
  }

  async loadCollection(collectionId) {
    const rows = await this.sql`
      SELECT
        c.id,
        c.name,
        c.description,
        c.is_private AS "isPrivate",
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt",
        p.id AS "photoId",
        p.url,
        p.thumbnail,
        p.width,
        p.height,
        p.date,
        pc."order"
      FROM collections c
      LEFT JOIN photo_collections pc ON pc.collection_id = c.id
      LEFT JOIN photos p ON p.id = pc.photo_id
      WHERE c.id = ${collectionId}
      ORDER BY pc."order" ASC
    `;

    if (rows.length === 0) return null;

    const first = rows[0];
    return {
      id: first.id,
      name: first.name,
      description: first.description,
      isPrivate: first.isPrivate,
      createdAt: first.createdAt,
      updatedAt: first.updatedAt,
      photos: rows
        .filter((row) => row.photoId !== null)
        .map((row) => ({
          id: row.photoId,
          url: row.url,
          thumbnail: row.thumbnail,
          width: row.width,
          height: row.height,
          date: row.date,
          order: row.order,
        })),
    };
  }
}

export default {
  fetch() {
    return new Response("Not found", { status: 404 });
  },
};
