// /app/api/test/route.ts
export const dynamic = "force-dynamic"; // ← 静的ビルド禁止＆動的APIに固定

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

/**
 * 🧩 テスト用API
 * - Supabase Serverクライアント（Service Role）で動作
 * - cookiesやauth不要
 * - Vercel静的化エラー対策済み
 */
export async function GET() {
  try {
    const supabase = getSupabaseServer();

    const { data, error } = await supabase.from("persona").select("*").limit(1);

    if (error) {
      console.error("⚠️ [API/test] Supabase error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err: any) {
    console.error("💥 [API/test] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
