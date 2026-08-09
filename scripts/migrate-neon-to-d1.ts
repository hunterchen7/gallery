import "dotenv/config";

const apiKey = process.env.API_KEY;
if (!apiKey) throw new Error("API_KEY is required");

const origin = process.env.MIGRATION_ORIGIN || "http://127.0.0.1:3000";
const response = await fetch(
  `${origin}/api/admin/migrations/neon-to-d1`,
  {
    method: "POST",
    headers: { "X-Auth-Key": apiKey },
  },
);
const report = await response.json();

if (!response.ok) {
  throw new Error(
    `Neon to D1 migration failed (${response.status}): ${JSON.stringify(report)}`,
  );
}

console.log(JSON.stringify(report, null, 2));
