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

function json(body, status = 200) {
  return Response.json(body, { status });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");

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
