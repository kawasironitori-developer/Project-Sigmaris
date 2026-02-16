// src/lib/supabaseClient.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

function parseDocumentCookies(): Array<{ name: string; value: string }> {
  if (typeof document === "undefined") return [];
  const raw = document.cookie || "";
  if (!raw) return [];
  return raw.split(";").map((part) => {
    const [k, ...rest] = part.trim().split("=");
    const name = decodeURIComponent(k || "");
    const value = decodeURIComponent(rest.join("=") || "");
    return { name, value };
  });
}

function setDocumentCookie(name: string, value: string, options?: any) {
  if (typeof document === "undefined") return;
  const opt = options ?? {};
  const parts: string[] = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opt.path || "/"}`);
  if (opt.maxAge != null) parts.push(`Max-Age=${String(opt.maxAge)}`);
  if (opt.expires) parts.push(`Expires=${new Date(opt.expires).toUTCString()}`);
  if (opt.domain) parts.push(`Domain=${String(opt.domain)}`);
  if (opt.sameSite) parts.push(`SameSite=${String(opt.sameSite)}`);
  if (opt.secure) parts.push("Secure");
  document.cookie = parts.join("; ");
}

function readPublicEnv() {
  const w = typeof window !== "undefined" ? (window as any) : null;
  const cfg = w && typeof w.__TOUHOU_PUBLIC === "object" ? (w.__TOUHOU_PUBLIC as any) : null;
  const url =
    (cfg && typeof cfg.supabaseUrl === "string" ? cfg.supabaseUrl : "") ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const anon =
    (cfg && typeof cfg.supabaseAnonKey === "string" ? cfg.supabaseAnonKey : "") ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return { url: String(url), anon: String(anon) };
}

/**
 * Supabase Browser Client
 *
 * - Client Component 専用
 * - Promise を返さない（超重要）
 * - auth / session / callback 対応済み
 * - App Router 正式対応
 */
let _client: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (_client) return _client;
  if (typeof window === "undefined") {
    throw new Error("[supabaseClient] supabaseBrowser() called on server");
  }

  const { url, anon } = readPublicEnv();
  if (!url || !anon) {
    throw new Error("[supabaseClient] NEXT_PUBLIC_SUPABASE_URL / ANON_KEY missing");
  }

  _client = createBrowserClient(url, anon, {
    cookies: {
      getAll() {
        return parseDocumentCookies();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          setDocumentCookie(name, value, options);
        });
      },
    },
  });

  return _client;
}
