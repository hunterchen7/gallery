/**
 * Development-only HTTP bridge to remote Cloudflare bindings. Wrangler runs
 * this as a remote preview so the local Vinxi server can use the same D1 state
 * as production without a Worker build.
 */
import {
  beginD1SnapshotMutation,
  completeD1SnapshotMutation,
  publishD1Snapshot,
  readD1Snapshot,
} from "../src/lib/d1-snapshot-operations.ts";
import { migrateNeonToD1 } from "../src/lib/neon-to-d1-migration.ts";

function json(body, status = 200) {
  return Response.json(body, { status });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");

    if (
      url.pathname === "/migrations/neon-to-d1" &&
      request.method === "POST"
    ) {
      if (request.headers.get("X-Auth-Key") !== env.API_KEY) {
        return json({ error: "Unauthorized" }, 401);
      }
      try {
        return json(
          await migrateNeonToD1(
            env.COLLECTION_SNAPSHOTS,
            env.DATABASE_URL,
          ),
        );
      } catch (error) {
        console.error("Neon to D1 migration failed:", error);
        return json(
          {
            error:
              error instanceof Error ? error.message : "Database migration failed",
          },
          500,
        );
      }
    }

    if (url.pathname === "/d1" && request.method === "POST") {
      try {
        const body = await request.json();
        const statement = ({ query, params = [] }) =>
          env.COLLECTION_SNAPSHOTS.prepare(query).bind(...params);

        if (body.operation === "batch") {
          return json(
            await env.COLLECTION_SNAPSHOTS.batch(
              body.statements.map(statement),
            ),
          );
        }

        if (body.operation === "exec") {
          return json(await env.COLLECTION_SNAPSHOTS.exec(body.query));
        }

        const prepared = statement(body);
        if (body.operation === "all") return json(await prepared.all());
        if (body.operation === "run") return json(await prepared.run());
        if (body.operation === "first") {
          return json(
            body.columnName
              ? await prepared.first(body.columnName)
              : await prepared.first(),
          );
        }
        if (body.operation === "raw") {
          return json(
            body.options
              ? await prepared.raw(body.options)
              : await prepared.raw(),
          );
        }
        return json({ error: "Unsupported D1 operation" }, 400);
      } catch (error) {
        console.error("D1 development query bridge failed:", error);
        return json({ error: "D1 query failed" }, 500);
      }
    }

    const snapshotMatch = url.pathname.match(/^\/snapshots\/([^/]+)$/);
    if (snapshotMatch) {
      const cacheKey = decodeURIComponent(snapshotMatch[1]);

      try {
        if (request.method === "GET") {
          return json(await readD1Snapshot(env.COLLECTION_SNAPSHOTS, cacheKey));
        }

        const body = await request.json();
        if (request.method === "POST") {
          await beginD1SnapshotMutation(
            env.COLLECTION_SNAPSHOTS,
            cacheKey,
            body.token,
          );
          return json({ success: true });
        }

        if (request.method === "DELETE") {
          const generation = await completeD1SnapshotMutation(
            env.COLLECTION_SNAPSHOTS,
            cacheKey,
            body.token,
          );
          return json(
            generation === null
              ? { status: "pending" }
              : { status: "refresh", generation },
          );
        }

        if (request.method === "PUT") {
          const published = await publishD1Snapshot(
            env.COLLECTION_SNAPSHOTS,
            cacheKey,
            body.payload,
            body.generation,
          );
          return json({ published });
        }
      } catch (error) {
        console.error("D1 development bridge failed:", error);
        return json({ error: "D1 snapshot operation failed" }, 500);
      }

      return json({ error: "Method not allowed" }, 405);
    }

    return new Response("Not found", { status: 404 });
  },
};
