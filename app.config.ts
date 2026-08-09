import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
    server: {
        preset: "cloudflare-module",
    },
    vite: {
        server: {
            allowedHosts: true,
        },
    },
});
