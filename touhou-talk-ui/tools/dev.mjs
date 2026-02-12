import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(scriptDir, "../..");

// Load monorepo root env BEFORE starting Next.js so Turbopack/SSR processes inherit it.
loadEnvConfig(repoRoot, true);

// On Windows, spawning `.cmd` directly can fail (EINVAL). Spawn the JS CLI via Node instead.
const nextCli = path.resolve(appDir, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextCli)) {
  console.error(`[dev] next CLI not found: ${nextCli}`);
  process.exit(1);
}

const child = spawn(process.execPath, [nextCli, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: appDir,
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
