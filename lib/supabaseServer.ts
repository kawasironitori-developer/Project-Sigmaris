// /lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";
import {
  createServerComponentClient,
  createRouteHandlerClient,
} from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * Supabase Utility Factory
 * -------------------------------
 * getSupabaseServer() → 管理者専用（Service Role Key）
 * getSupabaseAuth()   → 認証付きAPI用（Cookie共有）
 * -------------------------------
 */

/** 🔹 Service Role（全権限アクセス・Webhook等） */
export const getSupabaseServer = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase environment variables");
  return createClient(url, key);
};

/** 🔹 Cookie共有の認証付きクライアント（APIルート / Server Component） */
export const getSupabaseAuth = async () => {
  const cookieStore = cookies();
  return createRouteHandlerClient({ cookies: () => cookieStore });
};

/** 🔹 Server Component（getUser用） */
export const getSupabaseComponent = async () => {
  const cookieStore = cookies();
  return createServerComponentClient({ cookies: () => cookieStore });
};
