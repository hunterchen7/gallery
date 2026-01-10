import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";

/**
 * GET /api/auth/config - Get the encrypted API key for client-side decryption
 * This is safe to expose since the key is encrypted
 */
export async function GET() {
  const encryptedKey = process.env.ENCRYPTED_API_KEY;

  if (!encryptedKey) {
    return json({ error: "Auth not configured" }, { status: 500 });
  }

  return json({ encryptedKey });
}

/**
 * POST /api/auth/config - Verify that a decrypted key is valid
 * Used to confirm login was successful
 */
export async function POST(event: APIEvent) {
  const body = await event.request.json();
  const { key } = body;

  const expectedKey = process.env.API_KEY;

  if (!expectedKey) {
    return json({ error: "Auth not configured" }, { status: 500 });
  }

  const valid = key === expectedKey;
  return json({ valid });
}
