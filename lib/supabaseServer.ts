// /lib/supabaseServer.ts
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * Supabase Server (Auth Session Edition)
 * -----------------------------------------
 * ✅ 本番運用用クライアント
 * - Cookie 内の Supabase セッションを利用して認証
 * - RLS（auth.uid()）を有効にした安全なDBアクセス
 * - anonキー／service_roleキーをコードに直書きしない構成
 * - Service Role Mode の代替として安全に PersonaSync を動作させる
 * -----------------------------------------
 */


export const getSupabaseServer = () => {
  const client = createServerComponentClient({ cookies });
  console.log("🧠 SupabaseServer client initialized (auth-session mode)");
  return client;
};
