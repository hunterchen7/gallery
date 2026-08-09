import app from "../.output/server/index.mjs";

export default {
  fetch(request, env, context) {
    // SolidStart exposes string bindings through process.env. Keep the complete
    // Cloudflare environment available to server modules that need D1 objects.
    globalThis.__env__ = env;
    return app.fetch(request, env, context);
  },
};
