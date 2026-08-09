import { spawn } from "node:child_process";
import process from "node:process";

const CACHE_ORIGIN = "http://127.0.0.1:8787";
const children = new Set();
let shuttingDown = false;

function start(command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    console.error(
      `${command} stopped unexpectedly (${signal || `exit ${code ?? 1}`})`,
    );
    shutdown("SIGTERM", code ?? 1);
  });
  return child;
}

function shutdown(signal = "SIGTERM", exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill(signal);
  process.exitCode = exitCode;
}

async function waitForCache() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${CACHE_ORIGIN}/health`);
      if (response.ok) return;
    } catch {
      // Wrangler is still starting its remote preview.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the collection cache dev proxy");
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

start("npx", [
  "wrangler",
  "dev",
  "--remote",
  "--config",
  "wrangler.dev.jsonc",
  "--ip",
  "127.0.0.1",
  "--port",
  "8787",
  "--show-interactive-dev-session=false",
]);

try {
  await waitForCache();
  console.log("Collection cache proxy ready; starting the gallery app.");
  start("npx", ["vinxi", "dev", ...process.argv.slice(2)]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown("SIGTERM", 1);
}
