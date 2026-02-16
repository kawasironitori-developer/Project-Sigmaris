import type { NextConfig } from "next";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";

// Monorepo: load env from repo root (`../.env`) so all apps can share one config.
// Next.js will still load `touhou-talk-ui/.env*` afterwards (which can override).
const configDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(configDir, "..");
const isDev = process.env.NODE_ENV !== "production";
loadEnvConfig(rootDir, isDev);

const nextConfig: NextConfig = {
  output: "standalone",
  // Ensure public runtime config is always inlined for client components.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SIGMARIS_CORE: process.env.NEXT_PUBLIC_SIGMARIS_CORE,
  },
};

export default nextConfig;
