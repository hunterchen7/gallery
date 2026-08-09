/**
 * Development-only HTTP bridge to the deployed Durable Object namespace.
 * Wrangler runs this as a remote preview, so the local Vinxi server can use
 * the production cache and its invalidation state without a Worker build.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");

    const match = url.pathname.match(/^\/collections\/([^/]+)$/);
    if (!match) return new Response("Not found", { status: 404 });

    const collectionId = decodeURIComponent(match[1]);
    const id = env.COLLECTION_CACHE.idFromName(collectionId);
    return env.COLLECTION_CACHE.get(id).fetch(request);
  },
};
