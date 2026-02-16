// src/lib/supabase-server.ts
import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* =========================
   Env
========================= */

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertSupabaseConfigured() {
  // IMPORTANT:
  // Do not throw at module evaluation time. Next.js build may import API routes
  // while collecting page data. We only enforce configuration at runtime.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("[supabase-server] SUPABASE_URL / ANON_KEY missing");
  }
}

/* =========================
   Supabase Server Client
   - App Router 正式対応
   - cookies() は Promise（Next.js 15+）
========================= */

export async function supabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies(); // ★ 必ず await

  assertSupabaseConfigured();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },

      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

/* =========================
   Supabase Admin Client
   - Service Role
   - RLS bypass
========================= */

export function supabaseAdmin(): SupabaseClient {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("[supabase-server] Missing SERVICE_ROLE_KEY");
  }

  assertSupabaseConfigured();
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/* =========================
   Auth helpers
========================= */

export async function getUser() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[supabase-server] getUser error:", error);
    return null;
  }

  return data.user ?? null;
}

export async function requireUser() {
  const user = await getUser();

  if (!user) {
    throw new Error("[supabase-server] Unauthorized");
  }

  return user;
}

export async function requireUserId(): Promise<string> {
  const user = await requireUser();
  return user.id;
}
