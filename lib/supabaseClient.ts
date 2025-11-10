// /lib/supabaseClient.ts
"use client";

/**
 * Next.js App Router 用の Supabase クライアント
 * ---------------------------------------------
 * - Cookieベースでセッション維持
 * - Google OAuth / Email認証対応
 * - すべてのクライアントコンポーネントで共通利用可能
 */

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// ✅ 型定義がない場合はこちらでOK
export const supabase = createClientComponentClient();
