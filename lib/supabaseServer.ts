// ===========================================
//  Sigmaris OS — Supabase Utility (v1)
// -------------------------------------------
//  set:
//    - NEXT_PUBLIC_SUPABASE_URL
//    - NEXT_PUBLIC_SUPABASE_ANON_KEY
//    - SUPABASE_SERVICE_ROLE_KEY
//
//  provide:
//    - getSupabaseServer()     → Service Role（管理処理）
//    - getSupabaseAuth()       → Auth Route 用（Cookie 認証）
//    - getSupabaseComponent()  → Server Component 用認証
//
//  PersonaSync / ReflectionEngine 全体との整合性保証済み
// ===========================================

import { createClient } from "@supabase/supabase-js";
import {
  createRouteHandlerClient,
  createServerComponentClient,
} from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// -------------------------------------------
// 1) Service Role Client（管理・内部タスク専用）
// -------------------------------------------
export const getSupabaseServer = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "❌ Missing environment variables: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  // ⚠️ これだけ“Service Role（全権限）”なので外部露出禁止
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
    },
  });
};

// -------------------------------------------
// 2) Route Handler 用 Auth クライアント
//    - /api/* でのユーザー認証チェックに使用
//    - Cookie（next-auth）と連動
// -------------------------------------------
export const getSupabaseAuth = async () => {
  const cookieStore = cookies();
  return createRouteHandlerClient({
    cookies: () => cookieStore,
  });
};

// -------------------------------------------
// 3) Server Component 内で user 情報を読むためのクライアント
//    - getUser() / getSession() を RSC 内で実行
// -------------------------------------------
export const getSupabaseComponent = async () => {
  const cookieStore = cookies();
  return createServerComponentClient({
    cookies: () => cookieStore,
  });
};
