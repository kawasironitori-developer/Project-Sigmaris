// /app/api/persona/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * === POST: 人格データの保存 ===
 * - calm / empathy / curiosity / reflection / meta_summary を記録
 * - user_id が UNIQUE でない場合でも安全にフォールバック
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { traits, reflectionText, metaSummary, growthWeight } = body;

    // ✅ 認証付き Supabase クライアント
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized POST /api/persona");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = {
      user_id: user.id,
      calm: traits?.calm ?? 0,
      empathy: traits?.empathy ?? 0,
      curiosity: traits?.curiosity ?? 0,
      reflection: reflectionText ?? "",
      meta_summary: metaSummary ?? "",
      growth: growthWeight ?? 0,
      updated_at: new Date().toISOString(),
    };

    // ✅ upsert + fallback 対応
    const { error: upsertError } = await supabase
      .from("persona")
      .upsert(payload, { onConflict: "user_id" });

    if (upsertError?.code === "42P10") {
      console.warn(
        "⚠ persona.user_id に UNIQUE 制約がないため insert にフォールバックします。"
      );
      await supabase.from("persona").insert(payload);
    } else if (upsertError) {
      throw upsertError;
    }

    console.log(`🧠 Persona updated for ${user.id}`);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("❌ POST /api/persona failed:", e);
    return NextResponse.json(
      { error: e.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * === GET: 人格データの取得 ===
 * - calm / empathy / curiosity / reflection / meta_summary を返す
 * - 初回アクセス時はデフォルト値を返す
 */
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.warn("⚠️ Unauthorized GET /api/persona");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error: dbError } = await supabase
      .from("persona")
      .select(
        "calm, empathy, curiosity, reflection, meta_summary, growth, updated_at"
      )
      .eq("user_id", user.id)
      .maybeSingle(); // 複数行エラー防止

    if (dbError) throw dbError;

    if (!data) {
      console.log(`ℹ️ No persona found — returning defaults for ${user.id}`);
      return NextResponse.json({
        calm: 0.5,
        empathy: 0.5,
        curiosity: 0.5,
        reflection: "",
        meta_summary: "",
        growth: 0,
        updated_at: new Date().toISOString(),
      });
    }

    console.log(`✅ Persona fetched for ${user.id}`);
    return NextResponse.json(data);
  } catch (e: any) {
    console.error("❌ GET /api/persona failed:", e);
    return NextResponse.json(
      { error: e.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
