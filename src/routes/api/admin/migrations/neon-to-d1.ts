import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";
import { migrateNeonToD1 } from "~/lib/neon-to-d1-migration";

export async function POST(event: APIEvent) {
  const authKey = event.request.headers.get("X-Auth-Key");
  if (!authKey || authKey !== process.env.API_KEY) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (import.meta.env.DEV) {
    const response = await fetch(
      "http://127.0.0.1:8787/migrations/neon-to-d1",
      {
        method: "POST",
        headers: { "X-Auth-Key": authKey },
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    return json(await migrateNeonToD1());
  } catch (error) {
    console.error("Neon to D1 migration failed:", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Database migration failed",
      },
      { status: 500 },
    );
  }
}
