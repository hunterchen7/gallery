import { neon } from "@neondatabase/serverless";
import { DurableObject } from "cloudflare:workers";

const STATE_KEY = "collection-cache-state";
const ABANDONED_MUTATION_MS = 5 * 60 * 1000;

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
    this.state = { generation: 0, activeMutations: {} };
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.state =
        (await ctx.storage.get(STATE_KEY)) ?? this.state;
      this.state.activeMutations ??= {};
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
      return this.refresh(
        collectionId,
        request.headers.get("X-Cache-Mutation-Token"),
      );
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  async getCollection(collectionId) {
    await this.pruneAbandonedMutations();

    if (!this.isDirty() && this.state.snapshot !== undefined) {
      return this.snapshotResponse(this.state.snapshot, "HIT");
    }

    const generation = this.state.generation;
    const snapshot = await this.loadCollection(collectionId);

    // An edit invalidated this object while Neon was being read. The response is
    // still a valid concurrent read, but it must not become the persistent cache.
    if (!this.isDirty() && this.state.generation === generation) {
      this.state = { generation, activeMutations: {}, snapshot };
      await this.ctx.storage.put(STATE_KEY, this.state);
      return this.snapshotResponse(snapshot, "MISS");
    }

    return this.snapshotResponse(snapshot, "BYPASS");
  }

  async invalidate() {
    const token = crypto.randomUUID();
    this.state = {
      generation: this.state.generation + 1,
      activeMutations: {
        ...this.state.activeMutations,
        [token]: Date.now(),
      },
    };
    await this.ctx.storage.put(STATE_KEY, this.state);
    return jsonResponse({ success: true, token }, 200, "INVALIDATED");
  }

  async refresh(collectionId, token) {
    if (!token || !(token in this.state.activeMutations)) {
      return jsonResponse({ error: "Invalid mutation token" }, 409);
    }

    const activeMutations = { ...this.state.activeMutations };
    delete activeMutations[token];
    this.state = { ...this.state, activeMutations };
    await this.ctx.storage.put(STATE_KEY, this.state);

    if (this.isDirty()) {
      return jsonResponse({ success: true, refreshed: false }, 202, "DIRTY");
    }

    const generation = this.state.generation;
    const snapshot = await this.loadCollection(collectionId);

    // A newer mutation owns the next refresh. Do not publish an older read over
    // its invalidation marker.
    if (this.state.generation !== generation || this.isDirty()) {
      return jsonResponse({ success: true, refreshed: false }, 202, "BYPASS");
    }

    this.state = { generation, activeMutations: {}, snapshot };
    await this.ctx.storage.put(STATE_KEY, this.state);
    return jsonResponse({ success: true, refreshed: true }, 200, "REFRESHED");
  }

  isDirty() {
    return Object.keys(this.state.activeMutations).length > 0;
  }

  async pruneAbandonedMutations() {
    const cutoff = Date.now() - ABANDONED_MUTATION_MS;
    const activeMutations = Object.fromEntries(
      Object.entries(this.state.activeMutations).filter(
        ([, startedAt]) => startedAt >= cutoff,
      ),
    );

    if (
      Object.keys(activeMutations).length ===
      Object.keys(this.state.activeMutations).length
    ) {
      return;
    }

    this.state = { ...this.state, activeMutations };
    await this.ctx.storage.put(STATE_KEY, this.state);
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
        p.content_hash AS "contentHash",
        p.width,
        p.height,
        p.date,
        p.created_at AS "photoCreatedAt",
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
          contentHash: row.contentHash,
          width: row.width,
          height: row.height,
          date: row.date,
          createdAt: row.photoCreatedAt,
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
