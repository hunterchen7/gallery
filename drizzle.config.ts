import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./d1/migrations",
  dialect: "sqlite",
});
