import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Monorepo: load env from repo root (`../.env`) so all apps can share one config.
// Next.js will still load `sigmaris-os/.env*` afterwards (which can override).
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const configDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(configDir, "..");
const isDev = process.env.NODE_ENV !== "production";
loadEnvConfig(rootDir, isDev);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Ensure public runtime config is always inlined for client components.
  // (These are safe to expose because they are NEXT_PUBLIC_* variables.)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SIGMARIS_CORE: process.env.NEXT_PUBLIC_SIGMARIS_CORE,
  },

  // 🧩 本番（Vercel）では console.* を削除
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
};

export default nextConfig;
